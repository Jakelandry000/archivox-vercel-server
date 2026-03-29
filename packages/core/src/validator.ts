import { LayoutV1, Room2D } from './layout';
import { Priors, getAdjacencyScore } from './priors';

export type Severity = 'error' | 'warning' | 'info';

export interface Violation {
  code: string;
  severity: Severity;
  message: string;
  roomIds?: string[];
  value?: number;
  threshold?: number;
}

export interface ValidationMetrics {
  totalArea: number;
  coveredArea: number;
  coverageRatio: number;
  roomCount: number;
  /** Number of overlapping pairs (alias: overlapCount) */
  overlapPairs: number;
  overlapCount: number; // kept for backwards compat
  totalOverlapArea: number;
  outOfBoundsArea: number;
  roomAreas: Record<string, number>;
  circulationRatio: number;
  garageRatio: number;
  avgRoomWidth: number;
  avgRoomHeight: number;
}

export interface ValidationResult {
  /** 0–100; -20 per error, -5 per warning, -1 per info, plus soft priors bonus (≤+5). */
  score: number;
  violations: Violation[];
  metrics: ValidationMetrics;
  /**
   * Score adjustment contributed by dataset priors (non-negative soft bonus).
   * Undefined when no priors were supplied to validateLayout.
   */
  priorsAdjustment?: number;
}

// ── Dimension thresholds (feet; scaled if meters) ──────────────────────────
// [recommended_min, hard_min]; below hard_min => error, below rec_min => warning
const MIN_DIM_FT: Record<string, [number, number]> = {
  bedroom:      [9,  6],
  bathroom:     [5,  3],
  kitchen:      [8,  5],
  'living room':[10, 6],
  living:       [10, 6],
  dining:       [8,  5],
  office:       [8,  5],
  laundry:      [4,  2],
  garage:       [16, 10],
  hall:         [3,  2],
  closet:       [2,  1],
  other:        [2,  1],
};

// ── Geometry helpers ───────────────────────────────────────────────────────

function roomArea(r: Room2D): number {
  return r.width * r.height;
}

/** Returns area of intersection between two axis-aligned rectangles, or 0. */
function overlapArea(a: Room2D, b: Room2D): number {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

/** True if a is fully contained within b (b's boundary can equal a's). */
function isContainedIn(a: Room2D, b: Room2D): boolean {
  return (
    a.x >= b.x &&
    a.y >= b.y &&
    a.x + a.width  <= b.x + b.width &&
    a.y + a.height <= b.y + b.height
  );
}

function roomsAreAdjacent(a: Room2D, b: Room2D, tol = 0.5): boolean {
  const horizAdj =
    (Math.abs(a.x + a.width - b.x) <= tol || Math.abs(b.x + b.width - a.x) <= tol) &&
    a.y < b.y + b.height - tol &&
    a.y + a.height > b.y + tol;
  const vertAdj =
    (Math.abs(a.y + a.height - b.y) <= tol || Math.abs(b.y + b.height - a.y) <= tol) &&
    a.x < b.x + b.width - tol &&
    a.x + a.width > b.x + tol;
  return horizAdj || vertAdj;
}

/** True if room touches any exterior wall of the floor plan. */
function touchesExterior(r: Room2D, dimW: number, dimD: number, tol = 0.5): boolean {
  return (
    r.x <= tol ||
    r.y <= tol ||
    r.x + r.width  >= dimW - tol ||
    r.y + r.height >= dimD - tol
  );
}

function roomLabel(r: Room2D): string {
  return r.label ?? r.id;
}

// ── Overlap thresholds ─────────────────────────────────────────────────────
const OVERLAP_ERROR_RATIO   = 0.01;  // >1 % of smaller room => error
const OVERLAP_WARNING_RATIO = 0.001; // >0.1 % of smaller room => warning

// ── Out-of-bounds helper ───────────────────────────────────────────────────
function outOfBoundsArea(r: Room2D, dimW: number, dimD: number): number {
  const clampedX  = Math.max(0, Math.min(r.x, dimW));
  const clampedX2 = Math.max(0, Math.min(r.x + r.width, dimW));
  const clampedY  = Math.max(0, Math.min(r.y, dimD));
  const clampedY2 = Math.max(0, Math.min(r.y + r.height, dimD));
  const insideW = clampedX2 - clampedX;
  const insideH = clampedY2 - clampedY;
  const inside  = insideW > 0 && insideH > 0 ? insideW * insideH : 0;
  return roomArea(r) - inside;
}

/**
 * Validates a LayoutV1 floor plan (Validator v2).
 *
 * Geometry:
 *  - Self-intersection (non-positive dimension) => ERROR
 *  - Out-of-bounds => ERROR
 *  - Room-room overlap: >1% smaller => ERROR, 0.1%-1% => WARNING
 *  - Containment (A fully inside B) => ERROR
 *  - Minimum dimension per type => WARNING / ERROR
 *
 * Semantic:
 *  - Bath not near bedrooms => WARNING
 *  - Kitchen not adjacent to living/dining => WARNING
 *  - Garage not on exterior or not adjacent to service rooms => WARNING
 *  - Preferred/discouraged adjacency (retained from v1)
 *
 * Global: coverage ratio, living-room ratio.
 * Score: 0–100, -20/error -5/warning -1/info.
 */
/**
 * Optional priors for soft scoring — see packages/core/src/priors.ts.
 * When supplied, each adjacent room pair that is common in the dataset
 * contributes +1 to the score (capped at +5 total).  Hard rule violations
 * and existing semantics are unchanged regardless of whether priors are passed.
 */
export function validateLayout(layout: LayoutV1, priors?: Priors): ValidationResult {
  const violations: Violation[] = [];
  const { rooms, dimensions, units } = layout;
  const ftToUnit = units === 'meters' ? 0.3048 : 1;
  const { width: dimW, depth: dimD } = dimensions;

  // Pre-compute areas
  const areas: Record<string, number> = {};
  for (const r of rooms) {
    areas[r.id] = roomArea(r);
  }

  // ── 1. SELF-INTERSECTION (non-positive dimensions) ──────────────────────
  for (const r of rooms) {
    if (r.width <= 0 || r.height <= 0) {
      violations.push({
        code: 'SELF_INTERSECTION',
        severity: 'error',
        message: `Room "${roomLabel(r)}" (${r.type}) has non-positive dimensions (${r.width}×${r.height}).`,
        roomIds: [r.id],
        value: Math.min(r.width, r.height),
        threshold: 0,
      });
    }
  }

  // ── 2. OUT OF BOUNDS ────────────────────────────────────────────────────
  let totalOutOfBoundsArea = 0;
  for (const r of rooms) {
    if (r.width <= 0 || r.height <= 0) continue; // already flagged
    const oobArea = outOfBoundsArea(r, dimW, dimD);
    if (oobArea > 0) {
      totalOutOfBoundsArea += oobArea;
      violations.push({
        code: 'ROOM_OUT_OF_BOUNDS',
        severity: 'error',
        message: `Room "${roomLabel(r)}" (${r.type}) extends outside the floor plan boundaries.`,
        roomIds: [r.id],
        value: oobArea,
      });
    }
  }

  // ── 3. OVERLAP + CONTAINMENT ─────────────────────────────────────────────
  let overlapPairs = 0;
  let totalOverlapArea = 0;
  const validRooms = rooms.filter(r => r.width > 0 && r.height > 0);

  for (let i = 0; i < validRooms.length; i++) {
    for (let j = i + 1; j < validRooms.length; j++) {
      const a = validRooms[i];
      const b = validRooms[j];
      const oa = overlapArea(a, b);
      if (oa <= 0) continue;

      totalOverlapArea += oa;
      const smallerArea = Math.min(areas[a.id], areas[b.id]);
      const ratio = smallerArea > 0 ? oa / smallerArea : 1;

      // Containment check (a inside b or b inside a)
      if (isContainedIn(a, b) || isContainedIn(b, a)) {
        overlapPairs++;
        violations.push({
          code: 'ROOM_CONTAINMENT',
          severity: 'error',
          message: `Room "${roomLabel(a)}" is fully contained within "${roomLabel(b)}" (or vice-versa).`,
          roomIds: [a.id, b.id],
          value: oa,
          threshold: smallerArea,
        });
      } else if (ratio > OVERLAP_ERROR_RATIO) {
        overlapPairs++;
        violations.push({
          code: 'ROOM_OVERLAP',
          severity: 'error',
          message: `Room "${roomLabel(a)}" overlaps "${roomLabel(b)}" by ${(ratio * 100).toFixed(1)}% of the smaller room.`,
          roomIds: [a.id, b.id],
          value: ratio,
          threshold: OVERLAP_ERROR_RATIO,
        });
      } else if (ratio > OVERLAP_WARNING_RATIO) {
        overlapPairs++;
        violations.push({
          code: 'ROOM_OVERLAP_MINOR',
          severity: 'warning',
          message: `Room "${roomLabel(a)}" has a minor overlap with "${roomLabel(b)}" (${(ratio * 100).toFixed(2)}%).`,
          roomIds: [a.id, b.id],
          value: ratio,
          threshold: OVERLAP_WARNING_RATIO,
        });
      }
    }
  }

  // ── 4. MINIMUM DIMENSIONS ────────────────────────────────────────────────
  for (const r of validRooms) {
    const [recMin, hardMin] = (MIN_DIM_FT[r.type] ?? [2, 1]).map(v => v * ftToUnit);
    const minActual = Math.min(r.width, r.height);
    if (minActual < hardMin) {
      violations.push({
        code: 'ROOM_TOO_SMALL',
        severity: 'error',
        message: `Room "${roomLabel(r)}" (${r.type}) min dimension ${minActual.toFixed(1)} ${units} is below the hard minimum of ${hardMin.toFixed(1)} ${units}.`,
        roomIds: [r.id],
        value: minActual,
        threshold: hardMin,
      });
    } else if (minActual < recMin) {
      violations.push({
        code: 'ROOM_TOO_SMALL',
        severity: 'warning',
        message: `Room "${roomLabel(r)}" (${r.type}) min dimension ${minActual.toFixed(1)} ${units} is below the recommended ${recMin.toFixed(1)} ${units}.`,
        roomIds: [r.id],
        value: minActual,
        threshold: recMin,
      });
    }
  }

  // ── 5. SEMANTIC WARNINGS ─────────────────────────────────────────────────

  // 5a. Bathroom near bedrooms
  const bathrooms = validRooms.filter(r => r.type === 'bathroom');
  const bedrooms  = validRooms.filter(r => r.type === 'bedroom');
  if (bathrooms.length > 0 && bedrooms.length > 0) {
    const anyBathNearBed = bathrooms.some(bath =>
      bedrooms.some(bed => roomsAreAdjacent(bath, bed))
    );
    if (!anyBathNearBed) {
      violations.push({
        code: 'BATH_NOT_NEAR_BEDROOM',
        severity: 'warning',
        message: 'No bathroom is adjacent to a bedroom; bathrooms should be accessible from sleeping areas.',
        roomIds: [...bathrooms.map(r => r.id), ...bedrooms.map(r => r.id)],
      });
    }
  }

  // 5b. Kitchen adjacent to living/dining
  const kitchens = validRooms.filter(r => r.type === 'kitchen');
  const livingAndDining = validRooms.filter(
    r => r.type === 'living' || r.type === 'living room' || r.type === 'dining'
  );
  if (kitchens.length > 0 && livingAndDining.length > 0) {
    const anyKitAdj = kitchens.some(k =>
      livingAndDining.some(ld => roomsAreAdjacent(k, ld))
    );
    if (!anyKitAdj) {
      violations.push({
        code: 'KITCHEN_NOT_ADJACENT_LIVING_DINING',
        severity: 'warning',
        message: 'Kitchen is not adjacent to any living or dining area.',
        roomIds: [...kitchens.map(r => r.id), ...livingAndDining.map(r => r.id)],
      });
    }
  }

  // 5c. Garage on exterior + adjacent to service/entry rooms
  const garages = validRooms.filter(r => r.type === 'garage');
  for (const garage of garages) {
    if (!touchesExterior(garage, dimW, dimD)) {
      violations.push({
        code: 'GARAGE_NOT_ON_EXTERIOR',
        severity: 'warning',
        message: `Garage "${roomLabel(garage)}" does not touch an exterior wall.`,
        roomIds: [garage.id],
      });
    }
    const serviceTypes = new Set(['entry', 'mud', 'laundry', 'living', 'living room']);
    const serviceRooms = validRooms.filter(r => serviceTypes.has(r.type));
    if (serviceRooms.length > 0) {
      const adjToService = serviceRooms.some(s => roomsAreAdjacent(garage, s));
      if (!adjToService) {
        violations.push({
          code: 'GARAGE_NOT_ADJACENT_SERVICE',
          severity: 'warning',
          message: `Garage "${roomLabel(garage)}" is not adjacent to an entry, mud, laundry, or living room.`,
          roomIds: [garage.id, ...serviceRooms.map(r => r.id)],
        });
      }
    }
  }

  // 5d. Preferred adjacency (kitchen↔dining, kitchen↔living, laundry↔garage)
  const PREFERRED_ADJACENCY: [string, string][] = [
    ['kitchen', 'dining'],
    ['kitchen', 'living room'],
    ['kitchen', 'living'],
    ['laundry', 'garage'],
  ];
  for (const [typeA, typeB] of PREFERRED_ADJACENCY) {
    const groupA = validRooms.filter(r => r.type === typeA);
    const groupB = validRooms.filter(r => r.type === typeB);
    if (groupA.length > 0 && groupB.length > 0) {
      const anyAdj = groupA.some(ra => groupB.some(rb => roomsAreAdjacent(ra, rb)));
      if (!anyAdj) {
        violations.push({
          code: 'ADJACENCY_PREFERRED',
          severity: 'info',
          message: `${typeA} and ${typeB} are typically adjacent but are separated in this layout.`,
          roomIds: [...groupA.map(r => r.id), ...groupB.map(r => r.id)],
        });
      }
    }
  }

  // 5e. Discouraged adjacency
  const DISCOURAGED_ADJACENCY: [string, string][] = [
    ['bathroom', 'kitchen'],
    ['garage', 'bedroom'],
  ];
  for (const [typeA, typeB] of DISCOURAGED_ADJACENCY) {
    const groupA = validRooms.filter(r => r.type === typeA);
    const groupB = validRooms.filter(r => r.type === typeB);
    for (const ra of groupA) {
      for (const rb of groupB) {
        if (roomsAreAdjacent(ra, rb)) {
          violations.push({
            code: 'ADJACENCY_DISCOURAGED',
            severity: 'warning',
            message: `${typeA} should not be directly adjacent to ${typeB}.`,
            roomIds: [ra.id, rb.id],
          });
        }
      }
    }
  }

  // ── 6. GLOBAL CHECKS ─────────────────────────────────────────────────────

  const totalArea   = dimW * dimD;
  const coveredArea = validRooms.reduce((s, r) => s + areas[r.id], 0);
  const coverageRatio = totalArea > 0 ? coveredArea / totalArea : 0;

  if (coverageRatio < 0.6) {
    violations.push({
      code: 'LOW_COVERAGE',
      severity: 'warning',
      message: `Floor plan coverage is ${(coverageRatio * 100).toFixed(1)}% — recommended ≥ 60%.`,
      value: coverageRatio,
      threshold: 0.6,
    });
  }
  if (coverageRatio > 0.95) {
    violations.push({
      code: 'HIGH_COVERAGE',
      severity: 'warning',
      message: `Floor plan coverage is ${(coverageRatio * 100).toFixed(1)}% — recommended ≤ 95% to allow for walls.`,
      value: coverageRatio,
      threshold: 0.95,
    });
  }

  // Living-room area ratio: 12–50% of covered area
  const livingRooms = validRooms.filter(r => r.type === 'living' || r.type === 'living room');
  if (livingRooms.length > 0 && coveredArea > 0) {
    const livingArea = livingRooms.reduce((s, r) => s + areas[r.id], 0);
    const ratio = livingArea / coveredArea;
    if (ratio < 0.12) {
      violations.push({
        code: 'LIVING_ROOM_TOO_SMALL',
        severity: 'info',
        message: `Living area is ${(ratio * 100).toFixed(1)}% of rooms — recommended ≥ 12%.`,
        value: ratio,
        threshold: 0.12,
      });
    }
    if (ratio > 0.5) {
      violations.push({
        code: 'LIVING_ROOM_TOO_LARGE',
        severity: 'info',
        message: `Living area is ${(ratio * 100).toFixed(1)}% of rooms — recommended ≤ 50%.`,
        value: ratio,
        threshold: 0.5,
      });
    }
  }

  // ── SCORE ─────────────────────────────────────────────────────────────────

  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warnCount  = violations.filter(v => v.severity === 'warning').length;
  const infoCount  = violations.filter(v => v.severity === 'info').length;
  const baseScore = Math.max(0, 100 - errorCount * 20 - warnCount * 5 - infoCount * 1);

  // ── PRIORS SOFT SCORING ───────────────────────────────────────────────────
  // Each adjacent room pair that is common in the dataset (≥5% of all edges)
  // contributes +1 to the score, capped at +5.  No hard fails; no effect when
  // priors are omitted.
  let priorsAdjustment: number | undefined;
  if (priors) {
    const ADJACENCY_THRESHOLD = 0.05;
    let bonus = 0;
    for (let i = 0; i < validRooms.length; i++) {
      for (let j = i + 1; j < validRooms.length; j++) {
        if (roomsAreAdjacent(validRooms[i], validRooms[j])) {
          const adjScore = getAdjacencyScore(priors, validRooms[i].type, validRooms[j].type);
          if (adjScore >= ADJACENCY_THRESHOLD) bonus += 1;
        }
      }
    }
    priorsAdjustment = Math.min(bonus, 5);
  }

  const score = Math.min(100, baseScore + (priorsAdjustment ?? 0));

  // ── METRICS ───────────────────────────────────────────────────────────────

  const hallArea   = validRooms
    .filter(r => r.type === 'hall' || r.type === 'closet')
    .reduce((s, r) => s + areas[r.id], 0);
  const garageArea = garages.reduce((s, r) => s + areas[r.id], 0);

  const metrics: ValidationMetrics = {
    totalArea,
    coveredArea,
    coverageRatio,
    roomCount: rooms.length,
    overlapPairs,
    overlapCount: overlapPairs,
    totalOverlapArea,
    outOfBoundsArea: totalOutOfBoundsArea,
    roomAreas: { ...areas },
    circulationRatio: coveredArea > 0 ? hallArea / coveredArea : 0,
    garageRatio:      coveredArea > 0 ? garageArea / coveredArea : 0,
    avgRoomWidth:
      validRooms.length > 0 ? validRooms.reduce((s, r) => s + r.width, 0) / validRooms.length : 0,
    avgRoomHeight:
      validRooms.length > 0 ? validRooms.reduce((s, r) => s + r.height, 0) / validRooms.length : 0,
  };

  return {
    score,
    violations,
    metrics,
    ...(priorsAdjustment !== undefined ? { priorsAdjustment } : {}),
  };
}
