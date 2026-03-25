import { LayoutV1, Room2D } from './layout.js';

export type Severity = 'error' | 'warning' | 'info';

export interface Violation {
  code: string;
  severity: Severity;
  message: string;
  roomIds?: string[];
}

export interface ValidationMetrics {
  totalArea: number;
  coveredArea: number;
  coverageRatio: number;
  roomCount: number;
  overlapCount: number;
  avgRoomWidth: number;
  avgRoomHeight: number;
}

export interface ValidationResult {
  /** 0–100; deducted per violation severity */
  score: number;
  violations: Violation[];
  metrics: ValidationMetrics;
}

// Recommended minimum room dimensions in feet (scaled if units === 'meters')
const MIN_DIM_FT: Record<string, number> = {
  bedroom: 9,
  bathroom: 5,
  kitchen: 8,
  'living room': 10,
  living: 10,
  dining: 8,
  office: 8,
  laundry: 4,
  garage: 16,
  hall: 3,
  closet: 2,
  other: 2,
};

// Pairs that should be adjacent
const PREFERRED_ADJACENCY: [string, string][] = [
  ['kitchen', 'dining'],
  ['kitchen', 'living room'],
  ['kitchen', 'living'],
  ['laundry', 'garage'],
];

// Pairs that should NOT be adjacent
const DISCOURAGED_ADJACENCY: [string, string][] = [
  ['bathroom', 'kitchen'],
  ['garage', 'bedroom'],
];

function rectsOverlap(a: Room2D, b: Room2D): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function roomsAreAdjacent(a: Room2D, b: Room2D, tol = 0.5): boolean {
  const horizAdj =
    (Math.abs(a.x + a.width - b.x) <= tol || Math.abs(b.x + b.width - a.x) <= tol) &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
  const vertAdj =
    (Math.abs(a.y + a.height - b.y) <= tol || Math.abs(b.y + b.height - a.y) <= tol) &&
    a.x < b.x + b.width &&
    a.x + a.width > b.x;
  return horizAdj || vertAdj;
}

function roomLabel(r: Room2D): string {
  return r.label ?? r.id;
}

/**
 * Validates a LayoutV1 floor plan.
 *
 * Checks:
 *  - Geometry: containment, room overlaps, minimum dimensions
 *  - Semantic: preferred and discouraged adjacency heuristics
 *  - Global: area coverage ratio, living-room area ratio
 *
 * @returns score (0–100), array of violations, and computed metrics
 */
export function validateLayout(layout: LayoutV1): ValidationResult {
  const violations: Violation[] = [];
  const { rooms, dimensions, units } = layout;

  // Scale factor: minimums are defined in feet; convert if the layout is in meters
  const ftToUnit = units === 'meters' ? 0.3048 : 1;

  // ── GEOMETRY ────────────────────────────────────────────────────────────────

  // 1. Containment: every room must fit inside dimensions
  for (const r of rooms) {
    if (
      r.x < 0 ||
      r.y < 0 ||
      r.x + r.width > dimensions.width ||
      r.y + r.height > dimensions.depth
    ) {
      violations.push({
        code: 'ROOM_OUT_OF_BOUNDS',
        severity: 'error',
        message: `Room "${roomLabel(r)}" (${r.type}) extends outside the floor plan boundaries.`,
        roomIds: [r.id],
      });
    }
  }

  // 2. Overlaps: no two rooms may overlap
  let overlapCount = 0;
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (rectsOverlap(rooms[i], rooms[j])) {
        overlapCount++;
        violations.push({
          code: 'ROOM_OVERLAP',
          severity: 'error',
          message: `Room "${roomLabel(rooms[i])}" overlaps with "${roomLabel(rooms[j])}".`,
          roomIds: [rooms[i].id, rooms[j].id],
        });
      }
    }
  }

  // 3. Minimum dimensions
  for (const r of rooms) {
    const minDim = (MIN_DIM_FT[r.type] ?? 2) * ftToUnit;
    if (r.width < minDim || r.height < minDim) {
      violations.push({
        code: 'ROOM_TOO_SMALL',
        severity: 'warning',
        message: `Room "${roomLabel(r)}" (${r.type}) is below the recommended minimum of ${minDim.toFixed(1)} ${units}.`,
        roomIds: [r.id],
      });
    }
  }

  // ── SEMANTIC ─────────────────────────────────────────────────────────────────

  // 4. Preferred adjacency
  for (const [typeA, typeB] of PREFERRED_ADJACENCY) {
    const groupA = rooms.filter(r => r.type === typeA);
    const groupB = rooms.filter(r => r.type === typeB);
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

  // 5. Discouraged adjacency
  for (const [typeA, typeB] of DISCOURAGED_ADJACENCY) {
    const groupA = rooms.filter(r => r.type === typeA);
    const groupB = rooms.filter(r => r.type === typeB);
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

  // ── GLOBAL ───────────────────────────────────────────────────────────────────

  const totalArea = dimensions.width * dimensions.depth;
  const coveredArea = rooms.reduce((s, r) => s + r.width * r.height, 0);
  const coverageRatio = totalArea > 0 ? coveredArea / totalArea : 0;

  // 6. Coverage ratio: 60–95%
  if (coverageRatio < 0.6) {
    violations.push({
      code: 'LOW_COVERAGE',
      severity: 'warning',
      message: `Floor plan coverage is ${(coverageRatio * 100).toFixed(1)}% — recommended ≥ 60%.`,
    });
  }
  if (coverageRatio > 0.95) {
    violations.push({
      code: 'HIGH_COVERAGE',
      severity: 'warning',
      message: `Floor plan coverage is ${(coverageRatio * 100).toFixed(1)}% — recommended ≤ 95% to allow for walls.`,
    });
  }

  // 7. Living-room area ratio: 12–50% of covered area
  const livingRooms = rooms.filter(r => r.type === 'living' || r.type === 'living room');
  if (livingRooms.length > 0 && coveredArea > 0) {
    const livingArea = livingRooms.reduce((s, r) => s + r.width * r.height, 0);
    const ratio = livingArea / coveredArea;
    if (ratio < 0.12) {
      violations.push({
        code: 'LIVING_ROOM_TOO_SMALL',
        severity: 'info',
        message: `Living area is ${(ratio * 100).toFixed(1)}% of rooms — recommended ≥ 12%.`,
      });
    }
    if (ratio > 0.5) {
      violations.push({
        code: 'LIVING_ROOM_TOO_LARGE',
        severity: 'info',
        message: `Living area is ${(ratio * 100).toFixed(1)}% of rooms — recommended ≤ 50%.`,
      });
    }
  }

  // ── SCORE ────────────────────────────────────────────────────────────────────

  const errorCount = violations.filter(v => v.severity === 'error').length;
  const warnCount = violations.filter(v => v.severity === 'warning').length;
  const infoCount = violations.filter(v => v.severity === 'info').length;
  const score = Math.max(0, 100 - errorCount * 15 - warnCount * 5 - infoCount * 1);

  const metrics: ValidationMetrics = {
    totalArea,
    coveredArea,
    coverageRatio,
    roomCount: rooms.length,
    overlapCount,
    avgRoomWidth:
      rooms.length > 0 ? rooms.reduce((s, r) => s + r.width, 0) / rooms.length : 0,
    avgRoomHeight:
      rooms.length > 0 ? rooms.reduce((s, r) => s + r.height, 0) / rooms.length : 0,
  };

  return { score, violations, metrics };
}
