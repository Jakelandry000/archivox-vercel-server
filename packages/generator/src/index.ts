import { LayoutV1, Units, validateLayout, ValidationResult } from '@archivox/core';

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
};

export type GenerateResult = {
  layout: LayoutV1;
  validation: ValidationResult;
  /** Number of generation attempts made (1 = passed on first try) */
  attempts: number;
  /** Detailed stats about the best-of-N run. */
  meta: GenerateMeta;
};

// MVP heuristic generator: cheap, deterministic, good enough to demo.
// Later: swap with an LLM-backed planner that outputs LayoutV1.
export function generateLayoutFromText(
  input: GenerateInput,
  attemptIndex = 0,
  rng?: () => number
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

  type RoomDef = { type: string; w: number; h: number; label?: string };
  const roomDefs: RoomDef[] = [];

  roomDefs.push({ type: 'living room', w: jitter(18), h: jitter(14) });
  roomDefs.push({ type: 'kitchen', w: jitter(12), h: jitter(10) });
  if (wants.laundry) roomDefs.push({ type: 'laundry', w: jitter(6), h: jitter(6) });
  if (wants.office) roomDefs.push({ type: 'office', w: jitter(10), h: jitter(10) });
  for (let i = 0; i < clampNum(wants.bedrooms, 1, 6); i++) {
    roomDefs.push({ type: 'bedroom', w: jitter(12), h: jitter(10) });
  }
  for (let i = 0; i < clampNum(wants.bathrooms, 1, 4); i++) {
    roomDefs.push({ type: 'bathroom', w: jitter(8), h: jitter(8) });
  }
  if (wants.garage) roomDefs.push({ type: 'garage', w: jitter(20), h: jitter(18) });

  // Vary placement order via seeded shuffle (Fisher-Yates) for attempt > 0.
  if (rng && attemptIndex > 0) {
    seededShuffle(roomDefs, rng);
  }

  // Pack rooms in rows.
  const rooms: LayoutV1['rooms'] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowH = 0;

  for (const { type, w, h, label } of roomDefs) {
    if (cursorX + w > width) {
      cursorX = 0;
      cursorY += rowH;
      rowH = 0;
    }
    if (cursorY + h > depth) {
      cursorY = Math.max(0, depth - h);
    }
    const id = `${type.replace(/\s+/g, '_')}_${rooms.length + 1}`;
    rooms.push({ id, type, label, x: cursorX, y: cursorY, width: w, height: h });
    cursorX += w;
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
 * size jitter).  Returns the highest-scoring result.  Early-exits if
 * `earlyExitScore` (default 95) is reached.
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
  } = {}
): GenerateResult {
  const { scoreThreshold = 70, maxAttempts = 8, earlyExitScore = 95 } = options;

  // Resolve seed: caller-supplied or random.
  const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = makeLCG(seed);

  let best: { layout: LayoutV1; validation: ValidationResult } | null = null;
  const scores: number[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const layout = generateLayoutFromText(input, attempt - 1, rng);
    const validation = validateLayout(layout);
    scores.push(validation.score);

    if (!best || validation.score > best.validation.score) {
      best = { layout, validation };
    }

    if (validation.score >= earlyExitScore) break;
    // Legacy threshold: also stop early if scoreThreshold met (keeps old callers happy).
    if (attempt > 1 && validation.score >= scoreThreshold) break;
  }

  const bestScore = best!.validation.score;
  return {
    layout: best!.layout,
    validation: best!.validation,
    attempts: scores.length,
    meta: { attempts: scores.length, bestScore, scores, seed },
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
