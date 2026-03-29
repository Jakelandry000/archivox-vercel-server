import { LayoutV1, Units, validateLayout, ValidationResult, loadPriors, Priors } from '@archivox/core';

export type GenerateInput = {
  prompt: string;
  units?: Units;
  width?: number;
  depth?: number;
  /** Optional seed for deterministic variation across attempts. */
  seed?: number;
};

export type GenerateMeta = {
  attempts: number;
  bestScore: number;
  scores: number[];
  seed: number;
  /** Per-attempt debug info. Index 0 = attempt 1. */
  debug: Array<{ strategy: string }>;
};

export type GenerateResult = {
  layout: LayoutV1;
  validation: ValidationResult;
  /** Number of generation attempts made (1 = passed on first try) */
  attempts: number;
  /** Detailed stats about the best-of-N run. */
  meta: GenerateMeta;
};

// Internal: repair adjustments derived from a previous validation result.
type RepairHints = {
  canvasScale: number;
  garageScale: number;
  roomSpacing: number;
  worstRoomTypes: Set<string>;
  worstRoomScale: number;
};

// MVP heuristic generator: cheap, deterministic, good enough to demo.
// Later: swap with an LLM-backed planner that outputs LayoutV1.
export function generateLayoutFromText(
  input: GenerateInput,
  attemptIndex = 0,
  rng?: () => number,
  hints?: RepairHints
): LayoutV1 {
  const prompt = (input.prompt ?? '').toLowerCase();

  const units: Units = input.units ?? 'feet';

  // Alternate aspect ratio: even attempts use wide canvas, odd use tall.
  const baseWidth = clampNum(input.width ?? 40, 10, 200);
  const baseDepth = clampNum(input.depth ?? 30, 10, 200);
  let width: number;
  let depth: number;
  if (attemptIndex === 0) {
    width = baseWidth;
    depth = baseDepth;
  } else if (attemptIndex % 2 === 0) {
    // wide variant: stretch width
    width = clampNum(baseWidth * 1.15, 10, 200);
    depth = clampNum(baseDepth * 0.9, 10, 200);
  } else {
    // tall variant: stretch depth
    width = clampNum(baseWidth * 0.9, 10, 200);
    depth = clampNum(baseDepth * 1.15, 10, 200);
  }

  // Apply canvas scale from repair hints (expand for high-coverage or out-of-bounds).
  if (hints && hints.canvasScale !== 1.0) {
    width = clampNum(width * hints.canvasScale, 10, 200);
    depth = clampNum(depth * hints.canvasScale, 10, 200);
  }

  const wants = {
    bedrooms: parseCount(prompt, ['bedroom', 'bedrooms', 'bed']) ?? 1,
    bathrooms: parseCount(prompt, ['bathroom', 'bathrooms', 'bath']) ?? 1,
    office: /\boffice\b/.test(prompt),
    garage: /\bgarage\b/.test(prompt),
    laundry: /\blaundry\b/.test(prompt),
    kitchen: true,
    living: true,
  };

  // Build room list with optional size jitter (±10% via rng).
  const jitter = (base: number) => {
    if (!rng || attemptIndex === 0) return base;
    return base * (0.9 + rng() * 0.2);
  };

  // Scale down rooms whose types caused overlaps in the prior attempt.
  const repairScale = (type: string): number =>
    hints && hints.worstRoomTypes.has(type) ? hints.worstRoomScale : 1.0;

  // Combined jitter + repair scale for a room dimension.
  const dim = (base: number, type: string) => jitter(base) * repairScale(type);

  type RoomDef = { type: string; w: number; h: number; label?: string };
  const roomDefs: RoomDef[] = [];

  roomDefs.push({ type: 'living room', w: dim(18, 'living room'), h: dim(14, 'living room') });
  roomDefs.push({ type: 'kitchen', w: dim(12, 'kitchen'), h: dim(10, 'kitchen') });
  if (wants.laundry) roomDefs.push({ type: 'laundry', w: dim(6, 'laundry'), h: dim(6, 'laundry') });
  if (wants.office) roomDefs.push({ type: 'office', w: dim(10, 'office'), h: dim(10, 'office') });
  for (let i = 0; i < clampNum(wants.bedrooms, 1, 6); i++) {
    roomDefs.push({ type: 'bedroom', w: dim(12, 'bedroom'), h: dim(10, 'bedroom') });
  }
  for (let i = 0; i < clampNum(wants.bathrooms, 1, 4); i++) {
    roomDefs.push({ type: 'bathroom', w: dim(8, 'bathroom'), h: dim(8, 'bathroom') });
  }
  if (wants.garage) {
    const gs = hints?.garageScale ?? 1.0;
    roomDefs.push({ type: 'garage', w: jitter(20) * gs, h: jitter(18) * gs });
  }

  // Vary placement order via seeded shuffle (Fisher-Yates) for attempt > 0.
  if (rng && attemptIndex > 0) {
    seededShuffle(roomDefs, rng);
  }

  // Pack rooms in rows; apply spacing hint to reduce overlap risk.
  const spacing = hints?.roomSpacing ?? 0;
  const rooms: LayoutV1['rooms'] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowH = 0;

  for (const { type, w, h, label } of roomDefs) {
    if (cursorX + w > width) {
      cursorX = 0;
      cursorY += rowH + spacing;
      rowH = 0;
    }
    if (cursorY + h > depth) {
      cursorY = Math.max(0, depth - h);
    }
    const id = `${type.replace(/\s+/g, '_')}_${rooms.length + 1}`;
    rooms.push({ id, type, label, x: cursorX, y: cursorY, width: w, height: h });
    cursorX += w + spacing;
    rowH = Math.max(rowH, h);
  }

  return {
    schemaVersion: 'layout.v1',
    units,
    dimensions: { width, depth },
    rooms,
  };
}

/**
 * Generates a layout and validates it.  Tries up to `maxAttempts` (default 8)
 * using deterministic variation (seeded shuffle, aspect-ratio alternation, room
 * size jitter) and a constraint-driven repair loop: each failed attempt feeds
 * its validation violations/metrics back to adjust the next attempt.
 * Returns the highest-scoring result.  Early-exits if `earlyExitScore`
 * (default 95) is reached.
 *
 * The `GenerateResult` shape is backward compatible: `attempts` is still
 * present at the top level; new detail lives in `meta`.
 */
export function generateAndValidate(
  input: GenerateInput,
  options: {
    scoreThreshold?: number;
    maxAttempts?: number;
    /** Score at which to stop early. Default 95. */
    earlyExitScore?: number;
    /**
     * Dataset priors for soft scoring.  When omitted the generator falls back
     * to loading them from the default path (cached).  Pass null to explicitly
     * disable priors for this call.
     */
    priors?: Priors | null;
  } = {}
): GenerateResult {
  const { scoreThreshold = 70, maxAttempts = 8, earlyExitScore = 95 } = options;
  // Resolve effective priors: explicit option wins; otherwise try default path.
  const effectivePriors: Priors | undefined =
    'priors' in options ? (options.priors ?? undefined) : (loadPriors() ?? undefined);

  // Resolve seed: caller-supplied or random.
  const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = makeLCG(seed);

  let best: { layout: LayoutV1; validation: ValidationResult } | null = null;
  const scores: number[] = [];
  const debug: Array<{ strategy: string }> = [];

  let currentHints: RepairHints | undefined;
  let nextStrategy = 'initial';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const layout = generateLayoutFromText(input, attempt - 1, rng, currentHints);
    const validation = validateLayout(layout, effectivePriors);
    scores.push(validation.score);
    debug.push({ strategy: nextStrategy });

    if (!best || validation.score > best.validation.score) {
      best = { layout, validation };
    }

    if (validation.score >= earlyExitScore) break;
    // Legacy threshold: also stop early if scoreThreshold met (keeps old callers happy).
    if (attempt > 1 && validation.score >= scoreThreshold) break;

    // Derive repair hints and strategy label for the next attempt.
    const derived = deriveRepairHints(validation, layout);
    currentHints = derived.hints;
    nextStrategy = derived.strategy;
  }

  const bestScore = best!.validation.score;
  return {
    layout: best!.layout,
    validation: best!.validation,
    attempts: scores.length,
    meta: { attempts: scores.length, bestScore, scores, seed, debug },
  };
}

// ---------------------------------------------------------------------------
// Repair loop
// ---------------------------------------------------------------------------

/**
 * Analyzes a validation result and derives repair hints for the next attempt.
 * Returns both the hints and a human-readable strategy label recorded in
 * meta.debug[i].strategy.
 */
function deriveRepairHints(
  validation: ValidationResult,
  layout: LayoutV1
): { hints: RepairHints; strategy: string } {
  const hints: RepairHints = {
    canvasScale: 1.0,
    garageScale: 1.0,
    roomSpacing: 0,
    worstRoomTypes: new Set(),
    worstRoomScale: 1.0,
  };
  const strategies: string[] = [];

  // 1. High coverage → enlarge canvas so rooms have breathing room.
  if (validation.violations.some(v => v.code === 'HIGH_COVERAGE')) {
    hints.canvasScale = Math.max(hints.canvasScale, 1.15);
    strategies.push('expand-canvas');
  }

  // 2. High garage ratio → downscale garage.
  if (validation.metrics.garageRatio > 0.25) {
    hints.garageScale = 0.85;
    strategies.push('shrink-garage');
  }

  // 3. Overlap / containment → spacing boost + downscale offending room types.
  const overlapViolations = validation.violations.filter(
    v => v.code === 'ROOM_OVERLAP' || v.code === 'ROOM_CONTAINMENT'
  );
  if (overlapViolations.length > 0) {
    hints.roomSpacing = Math.max(hints.roomSpacing, 1.0);
    hints.worstRoomScale = 0.9;
    const roomById = new Map(layout.rooms.map(r => [r.id, r]));
    for (const v of overlapViolations) {
      for (const id of v.roomIds ?? []) {
        const room = roomById.get(id);
        if (room) hints.worstRoomTypes.add(room.type);
      }
    }
    strategies.push('fix-overlap');
  }

  // 4. Out-of-bounds → enlarge canvas to contain rooms.
  if (validation.metrics.outOfBoundsArea > 0) {
    hints.canvasScale = Math.max(hints.canvasScale, 1.1);
    strategies.push('expand-bounds');
  }

  return {
    hints,
    strategy: strategies.length > 0 ? strategies.join('+') : 'none',
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Linear congruential generator (Numerical Recipes params). Returns [0,1). */
function makeLCG(seed: number): () => number {
  let s = seed >>> 0; // uint32
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** In-place Fisher-Yates shuffle using the provided rng. */
function seededShuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function parseCount(prompt: string, keywords: string[]): number | null {
  for (const k of keywords) {
    const re = new RegExp(`(\\d+)\\s+${escapeRegex(k)}`);
    const m = prompt.match(re);
    if (m?.[1]) return Number(m[1]);
  }
  return null;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clampNum(n: number, min: number, max: number) {
  n = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, n));
}
