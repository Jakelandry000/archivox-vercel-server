import { LayoutV1, Units, DoorElement, WindowElement, WallSegment, Room2D, validateLayout, ValidationResult, loadPriors, Priors, RepairAction, runChecks, computeRulebookDeduction, registerRulebookV1Checks } from '@archivox/core';
import { extractRoomProgram, RoomProgram, PlannedDoor, PlannedWindow } from './llm-planner';

export { extractRoomProgram, type RoomProgram } from './llm-planner';

// Ensure all 103 Rule Book v1 checks are registered before the first call to
// runChecks() inside the generate loop.  registerRulebookV1Checks is idempotent.
registerRulebookV1Checks();

export type GenerateInput = {
  prompt: string;
  units?: Units;
  width?: number;
  depth?: number;
  /** Optional seed for deterministic variation across attempts. */
  seed?: number;
  /**
   * Building typology.  When set to 'residential', validation runs are scoped
   * to residential rule checks only.  Omit to run all registered checks
   * (preserves existing behavior for non-residential or untyped plans).
   */
  typology?: 'residential' | 'general';
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

// Primary generator.  When `plannedRooms` are provided (from the LLM planner)
// they replace the heuristic regex extraction phase; the packing + repair loop
// still apply, preserving geometric correctness.  Falls back to heuristic when
// plannedRooms is absent or empty.
export function generateLayoutFromText(
  input: GenerateInput,
  attemptIndex = 0,
  rng?: () => number,
  hints?: RepairHints,
  plannedRooms?: RoomProgram['rooms'],
  plannedDoors?: PlannedDoor[],
  plannedWindows?: PlannedWindow[],
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

  let roomDefs: RoomDef[];

  if (plannedRooms && plannedRooms.length > 0) {
    // LLM planner path: use provided room dimensions, applying jitter + repair.
    roomDefs = plannedRooms.map(r => ({
      id: r.id,
      type: r.type,
      w: r.type === 'garage'
        ? jitter(r.width) * (hints?.garageScale ?? 1.0)
        : dim(r.width, r.type),
      h: r.type === 'garage'
        ? jitter(r.height) * (hints?.garageScale ?? 1.0)
        : dim(r.height, r.type),
      label: r.label,
    }));
  } else {
    // Heuristic fallback path: regex extraction + hard-coded typical dimensions.
    const wants = {
      bedrooms: parseCount(prompt, ['bedroom', 'bedrooms', 'bed']) ?? 1,
      bathrooms: parseCount(prompt, ['bathroom', 'bathrooms', 'bath']) ?? 1,
      office: /\boffice\b/.test(prompt),
      garage: /\bgarage\b/.test(prompt),
      laundry: /\blaundry\b/.test(prompt),
    };

    roomDefs = [];
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
  }

  // On the first attempt, sort by door-graph BFS so connected rooms pack adjacent.
  // Later attempts shuffle for geometric variety (repair loop).
  if (attemptIndex === 0 && plannedDoors) {
    roomDefs = sortRoomsByAdjacency(roomDefs, plannedDoors);
  } else if (rng && attemptIndex > 0) {
    seededShuffle(roomDefs, rng);
  }

  // Pack rooms in rows; apply spacing hint to reduce overlap risk.
  const spacing = hints?.roomSpacing ?? 0;
  const rooms: LayoutV1['rooms'] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowH = 0;

  for (const { id: roomId, type, w, h, label, newRow } of roomDefs) {
    if ((newRow && cursorX > 0) || cursorX + w > width) {
      cursorX = 0;
      cursorY += rowH + spacing;
      rowH = 0;
    }
    // Collision-aware Y: scan forward from cursorY until the position is clear
    // of all already-placed rooms. Never move Y backward (that causes containment).
    const placedY = findClearY(rooms, cursorX, w, h, cursorY, spacing);
    const id = roomId ?? `${type.replace(/\s+/g, '_')}_${rooms.length + 1}`;
    rooms.push({ id, type, label, x: cursorX, y: placedY, width: w, height: h });
    cursorX += w + spacing;
    rowH = Math.max(rowH, placedY - cursorY + h);
  }

  let doors: DoorElement[] | undefined =
    plannedDoors && plannedDoors.length > 0
      ? plannedDoors.map((d, i) => ({
          id: d.id ?? `door_${i + 1}`,
          type: d.type,
          fromRoomId: d.fromRoomId,
          toRoomId: d.toRoomId,
          clearWidth: d.clearWidth,
          ...(d.wallSegmentId ? { wallSegmentId: d.wallSegmentId } : {}),
          ...(d.offsetAlongWall !== undefined ? { offsetAlongWall: d.offsetAlongWall } : {}),
        }))
      : undefined;

  let windows: WindowElement[] | undefined =
    plannedWindows && plannedWindows.length > 0
      ? plannedWindows.map((w, i) => ({
          id: w.id ?? `window_${i + 1}`,
          roomId: w.roomId,
          sillHeight: w.sillHeight,
          ...(w.wallSegmentId ? { wallSegmentId: w.wallSegmentId } : {}),
          ...(w.type ? { type: w.type } : {}),
          ...(w.offsetAlongWall !== undefined ? { offsetAlongWall: w.offsetAlongWall } : {}),
        }))
      : undefined;

  // Derive wall segments from packed room geometry and assign wallSegmentId to
  // every door and window that doesn't already have one.
  const { walls, interiorWallsByRoomPair, exteriorWallsByRoom } = deriveWallSegments(rooms);
  if (doors || windows) {
    const assigned = assignWallSegmentIds(
      doors ?? [],
      windows ?? [],
      interiorWallsByRoomPair,
      exteriorWallsByRoom,
    );
    if (doors) doors = assigned.doors;
    if (windows) windows = assigned.windows;
  }

  return {
    schemaVersion: 'layout.v1',
    units,
    dimensions: { width, depth },
    rooms,
    ...(walls.length > 0 ? { walls } : {}),
    ...(doors ? { doors } : {}),
    ...(windows ? { windows } : {}),
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

  let best: { layout: LayoutV1; validation: ValidationResult; combinedScore: number } | null = null;
  const scores: number[] = [];
  const debug: Array<{ strategy: string }> = [];

  let currentHints: RepairHints | undefined;
  let nextStrategy = 'initial';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const layout = generateLayoutFromText(input, attempt - 1, rng, currentHints);
    const validation = validateLayout(layout, effectivePriors);

    // Per-attempt rulebook scoring: fold deductions into the comparison score so
    // best-of-N selection reflects combined quality (base + rulebook + priors).
    const rulebookViolations = runChecks(layout, undefined, input.typology);
    const rulebookDeduction  = computeRulebookDeduction(rulebookViolations);
    const combinedScore = Math.max(0, Math.min(100, validation.score - rulebookDeduction));

    scores.push(combinedScore);
    debug.push({ strategy: nextStrategy });

    if (!best || combinedScore > best.combinedScore) {
      best = { layout, validation, combinedScore };
    }

    if (combinedScore >= earlyExitScore) break;
    // Legacy threshold: also stop early if scoreThreshold met (keeps old callers happy).
    if (attempt > 1 && combinedScore >= scoreThreshold) break;

    // Derive repair hints and strategy label for the next attempt.
    const derived = deriveRepairHints(validation, layout);
    currentHints = derived.hints;
    nextStrategy = derived.strategy;
  }

  const bestScore = best!.combinedScore;
  return {
    layout: best!.layout,
    validation: best!.validation,
    attempts: scores.length,
    meta: { attempts: scores.length, bestScore, scores, seed, debug },
  };
}

/**
 * Async variant of `generateAndValidate` that calls the LLM planner first.
 *
 * When ANTHROPIC_API_KEY is set, extracts a room program from the prompt via
 * the Claude API and feeds it into the packing + repair loop.  Falls back to
 * the synchronous heuristic generator when the API key is absent or the call
 * fails, so callers always receive a valid result.
 */
export async function generateWithLLM(
  input: GenerateInput,
  options: {
    scoreThreshold?: number;
    maxAttempts?: number;
    earlyExitScore?: number;
    priors?: Priors | null;
  } = {},
): Promise<GenerateResult> {
  const { scoreThreshold = 70, maxAttempts = 8, earlyExitScore = 95 } = options;
  const effectivePriors: Priors | undefined =
    'priors' in options ? (options.priors ?? undefined) : (loadPriors() ?? undefined);

  const seed = input.seed ?? Math.floor(Math.random() * 2 ** 31);
  const rng = makeLCG(seed);

  // Ask the LLM planner for a room program; fall back to heuristic on failure.
  const roomProgram = await extractRoomProgram(
    input.prompt,
    input.units ?? 'feet',
    input.width ?? 40,
    input.depth ?? 30,
  );

  let best: { layout: LayoutV1; validation: ValidationResult; combinedScore: number } | null = null;
  const scores: number[] = [];
  const debug: Array<{ strategy: string }> = [];
  let currentHints: RepairHints | undefined;
  let nextStrategy = roomProgram ? 'llm-planner' : 'heuristic-fallback';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const layout = generateLayoutFromText(
      input,
      attempt - 1,
      rng,
      currentHints,
      roomProgram?.rooms,
      roomProgram?.doors,
      roomProgram?.windows,
    );
    const validation = validateLayout(layout, effectivePriors);
    const rulebookViolations = runChecks(layout, undefined, input.typology);
    const rulebookDeduction  = computeRulebookDeduction(rulebookViolations);
    const combinedScore = Math.max(0, Math.min(100, validation.score - rulebookDeduction));

    scores.push(combinedScore);
    debug.push({ strategy: nextStrategy });

    if (!best || combinedScore > best.combinedScore) {
      best = { layout, validation, combinedScore };
    }

    if (combinedScore >= earlyExitScore) break;
    if (attempt > 1 && combinedScore >= scoreThreshold) break;

    const derived = deriveRepairHints(validation, layout);
    currentHints = derived.hints;
    nextStrategy = derived.strategy;
  }

  return {
    layout: best!.layout,
    validation: best!.validation,
    attempts: scores.length,
    meta: { attempts: scores.length, bestScore: best!.combinedScore, scores, seed, debug },
  };
}

// ---------------------------------------------------------------------------
// Adjacency-aware room ordering
// ---------------------------------------------------------------------------

type RoomDef = { id?: string; type: string; w: number; h: number; label?: string; newRow?: boolean };

/**
 * BFS-sorts roomDefs using the door graph so that door-connected rooms pack
 * near each other in the row packer.  Rooms not reachable via any door go at
 * the end in their original relative order.  Returns the original array
 * unchanged when no IDs or doors are present.
 */
function sortRoomsByAdjacency(roomDefs: RoomDef[], plannedDoors: PlannedDoor[]): RoomDef[] {
  if (plannedDoors.length === 0) return roomDefs;

  const adj = new Map<string, Set<string>>();
  for (const d of plannedDoors) {
    if (!d.toRoomId) continue;
    if (!adj.has(d.fromRoomId)) adj.set(d.fromRoomId, new Set());
    if (!adj.has(d.toRoomId)) adj.set(d.toRoomId, new Set());
    adj.get(d.fromRoomId)!.add(d.toRoomId);
    adj.get(d.toRoomId)!.add(d.fromRoomId);
  }

  const roomIdSet = new Set(roomDefs.map(r => r.id).filter((id): id is string => !!id));

  // Root: prefer entrance or living room that is in the door graph.
  let root: string | undefined;
  for (const r of roomDefs) {
    if (r.id && adj.has(r.id) && (r.type === 'entrance' || r.type === 'living room')) {
      root = r.id;
      break;
    }
  }
  if (!root) root = [...adj.keys()].find(id => roomIdSet.has(id));
  if (!root) return roomDefs;

  const visited = new Set<string>();
  const orderedIds: string[] = [];
  const queue = [root];
  visited.add(root);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    orderedIds.push(cur);
    for (const nb of adj.get(cur) ?? new Set()) {
      if (!visited.has(nb) && roomIdSet.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }

  const idToRoom = new Map(roomDefs.map(r => [r.id, r]));
  const sorted = orderedIds.map(id => idToRoom.get(id)!).filter(Boolean);
  const unvisited = roomDefs.filter(r => !r.id || !visited.has(r.id));
  const result = [...sorted, ...unvisited];

  // Mark the first connector room (hallway/corridor) as a row-starter so the
  // packer places it at the beginning of a new row between zones.
  const CONNECTOR_TYPES = ['hallway', 'corridor', 'landing', 'foyer'];
  const connIdx = result.findIndex(r => CONNECTOR_TYPES.some(t => r.type.includes(t)));
  if (connIdx > 0) result[connIdx] = { ...result[connIdx], newRow: true };

  return result;
}

// ---------------------------------------------------------------------------
// Wall derivation helpers
// ---------------------------------------------------------------------------

/**
 * Derives WallSegment objects from the axis-aligned bounding boxes of packed
 * rooms.  Interior walls are created where two rooms share an edge; all other
 * room edges become exterior walls.  Returns the segments together with two
 * lookup maps used by assignWallSegmentIds.
 */
export function deriveWallSegments(rooms: Room2D[]): {
  walls: WallSegment[];
  /** Sorted room-pair key (roomA|roomB) → interior wallId */
  interiorWallsByRoomPair: Map<string, string>;
  /** roomId → list of exterior wallIds for that room */
  exteriorWallsByRoom: Map<string, string[]>;
} {
  const walls: WallSegment[] = [];
  const interiorWallsByRoomPair = new Map<string, string>();
  const exteriorWallsByRoom = new Map<string, string[]>();
  // Tracks which (roomId:side) edges have been claimed by a shared interior wall.
  const claimed = new Set<string>();
  const eps = 0.05;

  const nextId = () => `wall_${walls.length + 1}`;

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];

      // a's right edge touches b's left edge (vertical shared wall)
      if (Math.abs(a.x + a.width - b.x) < eps) {
        const y0 = Math.max(a.y, b.y);
        const y1 = Math.min(a.y + a.height, b.y + b.height);
        if (y1 - y0 > eps) {
          const id = nextId();
          walls.push({ id, start: { x: a.x + a.width, y: y0 }, end: { x: a.x + a.width, y: y1 }, thickness: 0.5, type: 'interior' });
          claimed.add(`${a.id}:right`);
          claimed.add(`${b.id}:left`);
          interiorWallsByRoomPair.set([a.id, b.id].sort().join('|'), id);
        }
      }

      // b's right edge touches a's left edge (vertical shared wall)
      if (Math.abs(b.x + b.width - a.x) < eps) {
        const y0 = Math.max(a.y, b.y);
        const y1 = Math.min(a.y + a.height, b.y + b.height);
        if (y1 - y0 > eps) {
          const id = nextId();
          walls.push({ id, start: { x: b.x + b.width, y: y0 }, end: { x: b.x + b.width, y: y1 }, thickness: 0.5, type: 'interior' });
          claimed.add(`${b.id}:right`);
          claimed.add(`${a.id}:left`);
          interiorWallsByRoomPair.set([a.id, b.id].sort().join('|'), id);
        }
      }

      // a's bottom edge touches b's top edge (horizontal shared wall)
      if (Math.abs(a.y + a.height - b.y) < eps) {
        const x0 = Math.max(a.x, b.x);
        const x1 = Math.min(a.x + a.width, b.x + b.width);
        if (x1 - x0 > eps) {
          const id = nextId();
          walls.push({ id, start: { x: x0, y: a.y + a.height }, end: { x: x1, y: a.y + a.height }, thickness: 0.5, type: 'interior' });
          claimed.add(`${a.id}:bottom`);
          claimed.add(`${b.id}:top`);
          interiorWallsByRoomPair.set([a.id, b.id].sort().join('|'), id);
        }
      }

      // b's bottom edge touches a's top edge (horizontal shared wall)
      if (Math.abs(b.y + b.height - a.y) < eps) {
        const x0 = Math.max(a.x, b.x);
        const x1 = Math.min(a.x + a.width, b.x + b.width);
        if (x1 - x0 > eps) {
          const id = nextId();
          walls.push({ id, start: { x: x0, y: b.y + b.height }, end: { x: x1, y: b.y + b.height }, thickness: 0.5, type: 'interior' });
          claimed.add(`${b.id}:bottom`);
          claimed.add(`${a.id}:top`);
          interiorWallsByRoomPair.set([a.id, b.id].sort().join('|'), id);
        }
      }
    }
  }

  // Exterior walls — every room edge not claimed by a shared interior wall.
  for (const room of rooms) {
    const extIds: string[] = [];
    const addExt = (start: { x: number; y: number }, end: { x: number; y: number }) => {
      const id = nextId();
      walls.push({ id, start, end, thickness: 0.75, type: 'exterior' });
      extIds.push(id);
    };

    if (!claimed.has(`${room.id}:top`))
      addExt({ x: room.x, y: room.y }, { x: room.x + room.width, y: room.y });
    if (!claimed.has(`${room.id}:bottom`))
      addExt({ x: room.x, y: room.y + room.height }, { x: room.x + room.width, y: room.y + room.height });
    if (!claimed.has(`${room.id}:left`))
      addExt({ x: room.x, y: room.y }, { x: room.x, y: room.y + room.height });
    if (!claimed.has(`${room.id}:right`))
      addExt({ x: room.x + room.width, y: room.y }, { x: room.x + room.width, y: room.y + room.height });

    if (extIds.length > 0) exteriorWallsByRoom.set(room.id, extIds);
  }

  return { walls, interiorWallsByRoomPair, exteriorWallsByRoom };
}

/**
 * Returns copies of doors and windows with wallSegmentId populated where it
 * was absent.  Interior doors get the wall shared between fromRoomId and
 * toRoomId; exterior doors and windows get the first exterior wall of their
 * room.  Elements that already carry a wallSegmentId are returned unchanged.
 */
export function assignWallSegmentIds(
  doors: DoorElement[],
  windows: WindowElement[],
  interiorWallsByRoomPair: Map<string, string>,
  exteriorWallsByRoom: Map<string, string[]>,
): { doors: DoorElement[]; windows: WindowElement[] } {
  const assignedDoors = doors.map(door => {
    if (door.wallSegmentId) return door;
    let wallId: string | undefined;
    if (door.toRoomId === null) {
      wallId = exteriorWallsByRoom.get(door.fromRoomId)?.[0];
    } else {
      wallId = interiorWallsByRoomPair.get([door.fromRoomId, door.toRoomId].sort().join('|'));
      // No fallback: if rooms aren't adjacent, leave wallSegmentId undefined.
      // A wrong exterior wall ID causes bad door placement in Rhino; undefined is safe.
    }
    return wallId ? { ...door, wallSegmentId: wallId } : door;
  });

  const assignedWindows = windows.map(win => {
    if (win.wallSegmentId) return win;
    const wallId = exteriorWallsByRoom.get(win.roomId)?.[0];
    return wallId ? { ...win, wallSegmentId: wallId } : win;
  });

  return { doors: assignedDoors, windows: assignedWindows };
}

// ---------------------------------------------------------------------------
// Repair loop
// ---------------------------------------------------------------------------

/**
 * Analyzes a validation result and derives repair hints for the next attempt.
 * Returns both the hints and a human-readable strategy label recorded in
 * meta.debug[i].strategy.
 *
 * When violations carry structured `suggestedFixes`, those are used to inform
 * the numeric hints where applicable (e.g. resizeRoom → worstRoomScale, etc.).
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
  const roomById = new Map(layout.rooms.map(r => [r.id, r]));

  // 1. High coverage → enlarge canvas so rooms have breathing room.
  if (validation.violations.some(v => v.code === 'HIGH_COVERAGE')) {
    hints.canvasScale = Math.max(hints.canvasScale, 1.15);
    strategies.push('expand-canvas');
  }

  // 2. High garage ratio → downscale garage.
  //    Also covers RB-001 suggestedFixes (resizeRoom on garage).
  if (validation.metrics.garageRatio > 0.25) {
    hints.garageScale = 0.85;
    strategies.push('shrink-garage');
  } else {
    // Check RB-001 structured hints for garage resize scale.
    const garageRatioViol = validation.violations.find(v => v.code === 'RB-001');
    if (garageRatioViol?.suggestedFixes) {
      for (const fix of garageRatioViol.suggestedFixes) {
        if (fix.type === 'resizeRoom' && fix.scaleX !== undefined) {
          hints.garageScale = Math.min(hints.garageScale, fix.scaleX);
          strategies.push('shrink-garage');
        }
      }
    }
  }

  // 3. Overlap / containment → spacing boost + downscale offending room types.
  const overlapViolations = validation.violations.filter(
    v => v.code === 'ROOM_OVERLAP' || v.code === 'ROOM_CONTAINMENT'
  );
  if (overlapViolations.length > 0) {
    hints.roomSpacing = Math.max(hints.roomSpacing, 1.0);
    hints.worstRoomScale = 0.9;
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
    hints.canvasScale = Math.max(hints.canvasScale, 1.2);
    strategies.push('expand-bounds');
  }

  // 5. Thin slivers (RB-003) → mark the sliver room types for scale correction.
  const sliverViolations = validation.violations.filter(v => v.code === 'RB-003');
  if (sliverViolations.length > 0) {
    for (const v of sliverViolations) {
      for (const id of v.roomIds ?? []) {
        const room = roomById.get(id);
        if (room) hints.worstRoomTypes.add(room.type);
      }
    }
    hints.worstRoomScale = Math.min(hints.worstRoomScale, 0.85);
    strategies.push('fix-slivers');
  }

  // 6. Canvas too small (addRoom fix on RB-008/RB-009) → expand canvas slightly.
  const missingRoomViolations = validation.violations.filter(
    v => (v.code === 'RB-008' || v.code === 'RB-009') &&
         v.suggestedFixes?.some(f => f.type === 'addRoom')
  );
  if (missingRoomViolations.length > 0) {
    hints.canvasScale = Math.max(hints.canvasScale, 1.05);
    strategies.push('add-missing-rooms');
  }

  return {
    hints,
    strategy: strategies.length > 0 ? strategies.join('+') : 'none',
  };
}

// ---------------------------------------------------------------------------
// applyRepairAction — deterministic single-fix applicator
// ---------------------------------------------------------------------------

/**
 * Applies a single `RepairAction` (from a Violation's `suggestedFixes`) to a
 * layout and returns a new layout with that fix applied.  The input layout is
 * not mutated.  Returns the same layout unchanged when the action references a
 * room that does not exist or the action type is not supported.
 *
 * Supported action types: `resizeRoom`, `moveRoom`, `swapRooms`, `removeRoom`.
 * `addHallwayConnection` and `addRoom` are no-ops (structural changes require
 * full re-layout).
 */
export function applyRepairAction(layout: LayoutV1, action: RepairAction): LayoutV1 {
  // Deep-clone rooms so the input is not mutated.
  const rooms = layout.rooms.map(r => ({ ...r }));

  if (action.type === 'resizeRoom') {
    const r = rooms.find(r => r.id === action.roomId);
    if (r) {
      if (action.targetW !== undefined) r.width  = action.targetW;
      else if (action.scaleX !== undefined) r.width  = r.width  * action.scaleX;
      if (action.targetH !== undefined) r.height = action.targetH;
      else if (action.scaleY !== undefined) r.height = r.height * action.scaleY;
    }
  } else if (action.type === 'moveRoom') {
    const r = rooms.find(r => r.id === action.roomId);
    if (r) {
      r.x += action.dx;
      r.y += action.dy;
    }
  } else if (action.type === 'swapRooms') {
    const a = rooms.find(r => r.id === action.roomIdA);
    const b = rooms.find(r => r.id === action.roomIdB);
    if (a && b) {
      const ax = a.x, ay = a.y;
      a.x = b.x; a.y = b.y;
      b.x = ax;  b.y = ay;
    }
  } else if (action.type === 'removeRoom') {
    const idx = rooms.findIndex(r => r.id === action.roomId);
    if (idx !== -1) rooms.splice(idx, 1);
  }
  // 'addRoom' and 'addHallwayConnection' are not handled — they require re-layout.

  return { ...layout, rooms };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the smallest Y >= startY such that a rectangle (x, Y, w, h) does
 * not overlap any room in `placed` by more than epsilon.  Scans forward only
 * — never backward — so containment/overlap from backward clamping is
 * impossible.  If every candidate Y causes an overlap, the function still
 * returns a non-overlapping position (potentially out-of-canvas bounds); the
 * repair loop handles out-of-bounds via canvas expansion.
 */
function findClearY(
  placed: LayoutV1['rooms'],
  x: number,
  w: number,
  h: number,
  startY: number,
  spacing: number,
  eps = 1e-6,
): number {
  let y = startY;
  // Each iteration either confirms clear or jumps past a conflicting room.
  // At most placed.length jumps are needed before all conflicts are cleared.
  for (let guard = 0; guard <= placed.length; guard++) {
    let maxConflictBottom = -1;
    for (const r of placed) {
      const ox = Math.min(x + w, r.x + r.width) - Math.max(x, r.x);
      const oy = Math.min(y + h, r.y + r.height) - Math.max(y, r.y);
      if (ox > eps && oy > eps) {
        maxConflictBottom = Math.max(maxConflictBottom, r.y + r.height);
      }
    }
    if (maxConflictBottom < 0) return y; // no conflict at this Y
    y = maxConflictBottom + spacing;     // jump past all current conflicts
  }
  return y; // all conflicts cleared (or guard exhausted — should not happen)
}

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
