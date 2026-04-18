/**
 * Rule Check Registry — packages/core/src/ruleChecks.ts
 *
 * Provides a typed RuleCheck interface and a registry of checks that extend
 * the base validateLayout() with additional semantic rules mapped to
 * rulebook IDs (RB-NNN → R-NNN in rules/rulebook/rulebook_manifest.json).
 *
 * Usage:
 *   import { runChecks } from '@archivox/core';
 *   const extraViolations = runChecks(layout, { units: 'feet' });
 *
 * The existing validateLayout() API is not changed; these checks can be run
 * additively and their violations merged with the base result.
 */

import { LayoutV1, Room2D } from './layout';
import { Violation, RepairAction } from './validator';

// ── Context ───────────────────────────────────────────────────────────────────

export interface CheckContext {
  units: 'feet' | 'meters';
  /** Floor plan width in layout units. */
  dimW: number;
  /** Floor plan depth in layout units. */
  dimD: number;
  /** Multiplier: 1 for feet, 0.3048 for meters. */
  ftToUnit: number;
}

// ── RuleCheck interface ───────────────────────────────────────────────────────

export interface RuleCheck {
  /** Stable check ID matching rulebook_manifest.json checkId (e.g. "RB-001"). */
  id: string;
  /** Short human-readable title. */
  title: string;
  /** Default severity for this rule's violations. */
  severity: Violation['severity'];
  /**
   * Optional rulebook rule ID from rules/rulebook/rulebook_manifest.json (e.g. "R-021").
   * Null when no direct match exists in the extracted academic rulebook.
   */
  ruleId?: string | null;
  /**
   * Optional guard: return false to skip this check for the given layout.
   * Defaults to always run.
   */
  applies?(layout: LayoutV1, ctx: CheckContext): boolean;
  /** Run the check; return any violations found. */
  check(layout: LayoutV1, ctx: CheckContext): Violation[];
}

// ── Registry ──────────────────────────────────────────────────────────────────

const _registry: RuleCheck[] = [];

/** Register one or more checks. Idempotent by id. */
export function registerChecks(...checks: RuleCheck[]): void {
  for (const c of checks) {
    if (!_registry.find(r => r.id === c.id)) {
      _registry.push(c);
    }
  }
}

/** Returns a copy of all registered checks. */
export function listChecks(): RuleCheck[] {
  return [..._registry];
}

/**
 * Run all registered checks against `layout` and return combined violations.
 * Optionally pass a subset of check IDs to run only those.
 */
export function runChecks(layout: LayoutV1, ids?: string[]): Violation[] {
  const ctx: CheckContext = {
    units: layout.units,
    dimW: layout.dimensions.width,
    dimD: layout.dimensions.depth,
    ftToUnit: layout.units === 'meters' ? 0.3048 : 1,
  };

  const active = ids
    ? _registry.filter(c => ids.includes(c.id))
    : _registry;

  const violations: Violation[] = [];
  for (const check of active) {
    if (check.applies && !check.applies(layout, ctx)) continue;
    const found = check.check(layout, ctx);
    if (check.ruleId) {
      for (const v of found) {
        v.ruleId = check.ruleId;
      }
    }
    violations.push(...found);
  }
  return violations;
}

// ── Geometry helpers (local, mirrors validator.ts internals) ──────────────────

function roomArea(r: Room2D): number {
  return r.width * r.height;
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

function touchesExterior(r: Room2D, dimW: number, dimD: number, tol = 0.5): boolean {
  return (
    r.x <= tol ||
    r.y <= tol ||
    r.x + r.width  >= dimW - tol ||
    r.y + r.height >= dimD - tol
  );
}

function validRooms(layout: LayoutV1): Room2D[] {
  return layout.rooms.filter(r => r.width > 0 && r.height > 0);
}

function roomLabel(r: Room2D): string {
  return r.label ?? r.id;
}

// ── CIRCULATION_TYPES: rooms that count as "reachable hub" ────────────────────

const CIRCULATION_TYPES = new Set(['hall', 'living', 'living room', 'dining', 'entry', 'other']);
const HABITABLE_TYPES   = new Set([
  'bedroom', 'bathroom', 'kitchen', 'office', 'laundry', 'garage', 'closet',
]);

// ── 10 built-in checks ────────────────────────────────────────────────────────

/**
 * RB-001 — GARAGE_AREA_RATIO_MAX
 * Garage(s) must not exceed 25% of the total conditioned area (all non-garage rooms).
 * Rulebook ref: R-001
 */
const RB_001: RuleCheck = {
  id: 'RB-001',
  ruleId: null,
  title: 'Garage Area Ratio Max',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'garage' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const garages = rooms.filter(r => r.type === 'garage');
    const nonGarage = rooms.filter(r => r.type !== 'garage');
    const garageArea = garages.reduce((s, r) => s + roomArea(r), 0);
    const condArea   = nonGarage.reduce((s, r) => s + roomArea(r), 0);
    if (condArea === 0) return [];
    const ratio = garageArea / condArea;
    const MAX = 0.25;
    if (ratio > MAX) {
      const fixes: RepairAction[] = garages.map(g => ({
        type: 'resizeRoom',
        roomId: g.id,
        scaleX: 0.85,
        scaleY: 0.85,
      }));
      return [{
        code: 'RB-001',
        severity: 'warning',
        message: `Garage area is ${(ratio * 100).toFixed(1)}% of conditioned area — recommended ≤ ${MAX * 100}%.`,
        roomIds: garages.map(g => g.id),
        value: ratio,
        threshold: MAX,
        suggestedFixes: fixes,
      }];
    }
    return [];
  },
};

/**
 * RB-002 — BEDROOM_MIN_AREA
 * Each bedroom must have ≥ 70 sq ft usable area (warning) or ≥ 50 sq ft (error).
 * Complements ROOM_TOO_SMALL which checks only minimum dimension.
 * Rulebook ref: R-002
 */
const RB_002: RuleCheck = {
  id: 'RB-002',
  ruleId: 'R-013',
  title: 'Bedroom Minimum Area',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const beds = rooms.filter(r => r.type === 'bedroom');
    const hardMinSqFt = 50;
    const recMinSqFt  = 70;
    const factor = ctx.ftToUnit * ctx.ftToUnit;
    const violations: Violation[] = [];
    for (const r of beds) {
      const area = roomArea(r) / factor; // normalize to sq ft for comparison
      if (area < hardMinSqFt) {
        violations.push({
          code: 'RB-002',
          severity: 'error',
          message: `Bedroom "${roomLabel(r)}" area ${area.toFixed(0)} sq ft is below the hard minimum of ${hardMinSqFt} sq ft.`,
          roomIds: [r.id],
          value: area,
          threshold: hardMinSqFt,
          suggestedFixes: [{ type: 'resizeRoom', roomId: r.id, scaleX: 1.2, scaleY: 1.2 }],
        });
      } else if (area < recMinSqFt) {
        violations.push({
          code: 'RB-002',
          severity: 'warning',
          message: `Bedroom "${roomLabel(r)}" area ${area.toFixed(0)} sq ft is below the recommended ${recMinSqFt} sq ft.`,
          roomIds: [r.id],
          value: area,
          threshold: recMinSqFt,
          suggestedFixes: [{ type: 'resizeRoom', roomId: r.id, scaleX: 1.1, scaleY: 1.1 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-003 — NO_THIN_SLIVERS
 * No room may have an aspect ratio exceeding 5:1 (warning) or 10:1 (error).
 * Prevents impossible or visually degenerate rooms.
 * Rulebook ref: R-003
 */
const RB_003: RuleCheck = {
  id: 'RB-003',
  ruleId: 'R-062',
  title: 'No Thin Slivers',
  severity: 'warning',
  check(layout) {
    const rooms = validRooms(layout);
    const violations: Violation[] = [];
    for (const r of rooms) {
      const ratio = Math.max(r.width, r.height) / Math.min(r.width, r.height);
      if (ratio > 10) {
        violations.push({
          code: 'RB-003',
          severity: 'error',
          message: `Room "${roomLabel(r)}" (${r.type}) has extreme aspect ratio ${ratio.toFixed(1)}:1 — must be ≤ 10:1.`,
          roomIds: [r.id],
          value: ratio,
          threshold: 10,
          suggestedFixes: [{ type: 'resizeRoom', roomId: r.id, scaleX: 0.5, scaleY: 2.0 }],
        });
      } else if (ratio > 5) {
        violations.push({
          code: 'RB-003',
          severity: 'warning',
          message: `Room "${roomLabel(r)}" (${r.type}) has aspect ratio ${ratio.toFixed(1)}:1 — recommended ≤ 5:1.`,
          roomIds: [r.id],
          value: ratio,
          threshold: 5,
          suggestedFixes: [{ type: 'resizeRoom', roomId: r.id, scaleX: 0.7, scaleY: 1.5 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-004 — EXTERIOR_ACCESS_LIVING
 * The living room must touch at least one exterior wall (daylight/egress proxy).
 * Rulebook ref: R-004
 */
const RB_004: RuleCheck = {
  id: 'RB-004',
  ruleId: 'R-021',
  title: 'Living Room Exterior Access',
  severity: 'warning',
  applies: layout => layout.rooms.some(
    r => (r.type === 'living' || r.type === 'living room') && r.width > 0 && r.height > 0
  ),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const living = rooms.filter(r => r.type === 'living' || r.type === 'living room');
    const anyExterior = living.some(r => touchesExterior(r, ctx.dimW, ctx.dimD));
    if (!anyExterior) {
      return [{
        code: 'RB-004',
        severity: 'warning',
        message: 'No living room touches an exterior wall — natural light and egress may be blocked.',
        roomIds: living.map(r => r.id),
        suggestedFixes: living.map(r => ({ type: 'moveRoom' as const, roomId: r.id, dx: -r.x, dy: 0 })),
      }];
    }
    return [];
  },
};

/**
 * RB-005 — EXTERIOR_ACCESS_KITCHEN
 * The kitchen should touch an exterior wall (natural ventilation/light).
 * Rulebook ref: R-005
 */
const RB_005: RuleCheck = {
  id: 'RB-005',
  ruleId: 'R-021',
  title: 'Kitchen Exterior Access',
  severity: 'info',
  applies: layout => layout.rooms.some(r => r.type === 'kitchen' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const kitchens = rooms.filter(r => r.type === 'kitchen');
    const anyExterior = kitchens.some(r => touchesExterior(r, ctx.dimW, ctx.dimD));
    if (!anyExterior) {
      return [{
        code: 'RB-005',
        severity: 'info',
        message: 'No kitchen touches an exterior wall — natural ventilation may be insufficient.',
        roomIds: kitchens.map(r => r.id),
        suggestedFixes: kitchens.map(r => ({ type: 'moveRoom' as const, roomId: r.id, dx: 0, dy: -r.y })),
      }];
    }
    return [];
  },
};

/**
 * RB-006 — CLOSET_NEAR_BEDROOM
 * When closets are present, at least one must be adjacent to a bedroom.
 * Rulebook ref: R-006
 */
const RB_006: RuleCheck = {
  id: 'RB-006',
  ruleId: null,
  title: 'Closet Near Bedroom',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'closet' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const closets  = rooms.filter(r => r.type === 'closet');
    const bedrooms = rooms.filter(r => r.type === 'bedroom');
    const anyAdj = closets.some(c => bedrooms.some(b => roomsAreAdjacent(c, b)));
    if (!anyAdj) {
      return [{
        code: 'RB-006',
        severity: 'info',
        message: 'No closet is adjacent to a bedroom — closets should be accessible from sleeping areas.',
        roomIds: [...closets.map(r => r.id), ...bedrooms.map(r => r.id)],
        suggestedFixes: closets.map(c => ({
          type: 'moveRoom' as const,
          roomId: c.id,
          dx: bedrooms[0] ? bedrooms[0].x - c.x : 0,
          dy: bedrooms[0] ? bedrooms[0].y - c.y : 0,
        })),
      }];
    }
    return [];
  },
};

/**
 * RB-007 — CIRCULATION_CONNECTIVITY
 * Every habitable room must share an edge with at least one circulation room
 * (hall, living, dining, entry) — or be a circulation room itself.
 * Rulebook ref: R-007
 */
const RB_007: RuleCheck = {
  id: 'RB-007',
  ruleId: 'R-025',
  title: 'Circulation Connectivity',
  severity: 'warning',
  check(layout) {
    const rooms = validRooms(layout);
    if (rooms.length <= 1) return [];

    const circRooms = rooms.filter(r => CIRCULATION_TYPES.has(r.type));
    if (circRooms.length === 0) return [];

    const violations: Violation[] = [];
    for (const r of rooms) {
      if (CIRCULATION_TYPES.has(r.type)) continue; // is itself circulation
      const connected = circRooms.some(c => roomsAreAdjacent(r, c));
      if (!connected) {
        violations.push({
          code: 'RB-007',
          severity: 'warning',
          message: `Room "${roomLabel(r)}" (${r.type}) has no adjacency to any circulation space (hall/living/entry).`,
          roomIds: [r.id, ...circRooms.map(c => c.id)],
          suggestedFixes: [{ type: 'addHallwayConnection', nearRoomId: r.id }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-008 — BEDROOM_COUNT_MIN
 * A residential plan must contain at least one bedroom.
 * Rulebook ref: R-008
 */
const RB_008: RuleCheck = {
  id: 'RB-008',
  ruleId: null,
  title: 'Bedroom Count Minimum',
  severity: 'warning',
  check(layout) {
    const rooms = validRooms(layout);
    const beds = rooms.filter(r => r.type === 'bedroom');
    if (beds.length === 0) {
      return [{
        code: 'RB-008',
        severity: 'warning',
        message: 'No bedroom found in plan — residential dwellings require at least one bedroom.',
        suggestedFixes: [{ type: 'addRoom', roomType: 'bedroom' }],
      }];
    }
    return [];
  },
};

/**
 * RB-009 — BATHROOM_COUNT_MIN
 * If bedrooms are present, at least one bathroom must exist.
 * Rulebook ref: R-009
 */
const RB_009: RuleCheck = {
  id: 'RB-009',
  ruleId: null,
  title: 'Bathroom Count Minimum',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const baths = rooms.filter(r => r.type === 'bathroom');
    if (baths.length === 0) {
      return [{
        code: 'RB-009',
        severity: 'warning',
        message: 'No bathroom found — at least one bathroom is required when bedrooms are present.',
        suggestedFixes: [{ type: 'addRoom', roomType: 'bathroom' }],
      }];
    }
    return [];
  },
};

/**
 * RB-010 — LAUNDRY_NOT_ADJACENT_BEDROOM
 * Laundry rooms should not share a direct wall with a bedroom (noise/vibration).
 * Rulebook ref: R-010
 */
const RB_010: RuleCheck = {
  id: 'RB-010',
  ruleId: 'R-088',
  title: 'Laundry Not Adjacent Bedroom',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'laundry' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const laundries = rooms.filter(r => r.type === 'laundry');
    const bedrooms  = rooms.filter(r => r.type === 'bedroom');
    const violations: Violation[] = [];
    for (const l of laundries) {
      for (const b of bedrooms) {
        if (roomsAreAdjacent(l, b)) {
          violations.push({
            code: 'RB-010',
            severity: 'info',
            message: `Laundry "${roomLabel(l)}" is adjacent to bedroom "${roomLabel(b)}" — noise and vibration may disturb occupants.`,
            roomIds: [l.id, b.id],
            suggestedFixes: [{ type: 'swapRooms', roomIdA: l.id, roomIdB: b.id }],
          });
        }
      }
    }
    return violations;
  },
};

// ── Next 10 checks (RB-011..RB-020) ──────────────────────────────────────────

/**
 * RB-011 — BEDROOM_EXTERIOR_ACCESS
 * Every bedroom should touch at least one exterior wall (natural light / ventilation proxy).
 * Rulebook ref: R-021 (Daylighting Depth Rule)
 */
const RB_011: RuleCheck = {
  id: 'RB-011',
  ruleId: 'R-021',
  title: 'Bedroom Exterior Access',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const beds = rooms.filter(r => r.type === 'bedroom');
    const violations: Violation[] = [];
    for (const r of beds) {
      if (!touchesExterior(r, ctx.dimW, ctx.dimD)) {
        violations.push({
          code: 'RB-011',
          severity: 'warning',
          message: `Bedroom "${roomLabel(r)}" does not touch an exterior wall — natural light and ventilation may be insufficient.`,
          roomIds: [r.id],
          suggestedFixes: [{ type: 'moveRoom', roomId: r.id, dx: -r.x, dy: 0 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-012 — ENTRY_TO_PUBLIC_SPACE
 * An entry room must be adjacent to at least one public zone (living/hall/dining).
 * Rulebook ref: R-032 (Entry Sequence Primacy)
 */
const RB_012: RuleCheck = {
  id: 'RB-012',
  ruleId: 'R-032',
  title: 'Entry to Public Space',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'entry' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const entries = rooms.filter(r => r.type === 'entry');
    const publicTypes = new Set(['living', 'living room', 'dining', 'hall', 'other']);
    const violations: Violation[] = [];
    for (const e of entries) {
      const adjToPublic = rooms.some(r => publicTypes.has(r.type) && roomsAreAdjacent(e, r));
      if (!adjToPublic) {
        violations.push({
          code: 'RB-012',
          severity: 'warning',
          message: `Entry "${roomLabel(e)}" does not connect to any public space (living/hall/dining) — entry sequences must lead to shared spaces first.`,
          roomIds: [e.id, ...rooms.filter(r => publicTypes.has(r.type)).map(r => r.id)],
          suggestedFixes: [{ type: 'addHallwayConnection', nearRoomId: e.id }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-013 — BEDROOM_NOT_ADJACENT_KITCHEN
 * Bedrooms should not share a direct wall with a kitchen (acoustic + odor separation).
 * Rulebook ref: R-088 (Acoustic Noise Control Hierarchy)
 */
const RB_013: RuleCheck = {
  id: 'RB-013',
  ruleId: 'R-088',
  title: 'Bedroom Not Adjacent Kitchen',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'kitchen' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const beds = rooms.filter(r => r.type === 'bedroom');
    const kitchens = rooms.filter(r => r.type === 'kitchen');
    const violations: Violation[] = [];
    for (const b of beds) {
      for (const k of kitchens) {
        if (roomsAreAdjacent(b, k)) {
          violations.push({
            code: 'RB-013',
            severity: 'info',
            message: `Bedroom "${roomLabel(b)}" is directly adjacent to kitchen "${roomLabel(k)}" — acoustic and odor separation is recommended.`,
            roomIds: [b.id, k.id],
            suggestedFixes: [{ type: 'swapRooms', roomIdA: b.id, roomIdB: k.id }],
          });
        }
      }
    }
    return violations;
  },
};

/**
 * RB-014 — BATH_BEDROOM_RATIO
 * Plans with ≥ 3 bedrooms should provide at least 2 bathrooms.
 * Rulebook ref: null (IRC P2903 / HUD residential standards)
 */
const RB_014: RuleCheck = {
  id: 'RB-014',
  ruleId: null,
  title: 'Bath–Bedroom Ratio',
  severity: 'warning',
  applies: layout =>
    layout.rooms.filter(r => r.type === 'bedroom' && r.width > 0 && r.height > 0).length >= 3,
  check(layout) {
    const rooms = validRooms(layout);
    const beds  = rooms.filter(r => r.type === 'bedroom');
    const baths = rooms.filter(r => r.type === 'bathroom');
    if (beds.length >= 3 && baths.length < 2) {
      return [{
        code: 'RB-014',
        severity: 'warning',
        message: `${beds.length} bedrooms but only ${baths.length} bathroom(s) — plans with ≥ 3 bedrooms should have at least 2 bathrooms.`,
        roomIds: [...beds.map(r => r.id), ...baths.map(r => r.id)],
        value: baths.length,
        threshold: 2,
        suggestedFixes: [{ type: 'addRoom', roomType: 'bathroom' }],
      }];
    }
    return [];
  },
};

/**
 * RB-015 — EXCESSIVE_CIRCULATION_AREA
 * Hall + closet area combined must not exceed 20% of total covered area.
 * Rulebook ref: R-031 (Floor Plan Interconnection Density Limit)
 */
const RB_015: RuleCheck = {
  id: 'RB-015',
  ruleId: 'R-031',
  title: 'Excessive Circulation Area',
  severity: 'warning',
  applies: layout =>
    layout.rooms.some(r => (r.type === 'hall' || r.type === 'closet') && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const circRooms = rooms.filter(r => r.type === 'hall' || r.type === 'closet');
    const circArea  = circRooms.reduce((s, r) => s + roomArea(r), 0);
    const totalArea = rooms.reduce((s, r) => s + roomArea(r), 0);
    if (totalArea === 0) return [];
    const ratio = circArea / totalArea;
    const MAX = 0.20;
    if (ratio > MAX) {
      return [{
        code: 'RB-015',
        severity: 'warning',
        message: `Circulation area (halls/closets) is ${(ratio * 100).toFixed(1)}% of covered area — recommended ≤ ${MAX * 100}%.`,
        roomIds: circRooms.map(r => r.id),
        value: ratio,
        threshold: MAX,
        suggestedFixes: circRooms.map(r => ({ type: 'resizeRoom' as const, roomId: r.id, scaleX: 0.8, scaleY: 0.8 })),
      }];
    }
    return [];
  },
};

/**
 * RB-016 — ENTRY_EXTERIOR_ACCESS
 * If an entry room exists, it must touch an exterior wall (it needs an exterior door).
 * Rulebook ref: R-036 (Exterior Door Count Minimization)
 */
const RB_016: RuleCheck = {
  id: 'RB-016',
  ruleId: 'R-036',
  title: 'Entry Exterior Access',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'entry' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const entries = rooms.filter(r => r.type === 'entry');
    const violations: Violation[] = [];
    for (const e of entries) {
      if (!touchesExterior(e, ctx.dimW, ctx.dimD)) {
        violations.push({
          code: 'RB-016',
          severity: 'warning',
          message: `Entry "${roomLabel(e)}" does not touch an exterior wall — an entry must connect to the outside.`,
          roomIds: [e.id],
          suggestedFixes: [{ type: 'moveRoom', roomId: e.id, dx: -e.x, dy: -e.y }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-017 — LIVING_DINING_AREA_RATIO
 * Combined living + dining area should be ≥ 15% of covered area (social space adequacy).
 * Rulebook ref: R-026 (Spatial Zone Count Limit)
 */
const RB_017: RuleCheck = {
  id: 'RB-017',
  ruleId: 'R-026',
  title: 'Living+Dining Area Ratio',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => (r.type === 'living' || r.type === 'living room') && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'dining' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const socialRooms = rooms.filter(
      r => r.type === 'living' || r.type === 'living room' || r.type === 'dining'
    );
    const socialArea = socialRooms.reduce((s, r) => s + roomArea(r), 0);
    const totalArea  = rooms.reduce((s, r) => s + roomArea(r), 0);
    if (totalArea === 0) return [];
    const ratio = socialArea / totalArea;
    const MIN = 0.15;
    if (ratio < MIN) {
      return [{
        code: 'RB-017',
        severity: 'info',
        message: `Living+dining area is ${(ratio * 100).toFixed(1)}% of covered area — recommended ≥ ${MIN * 100}% for adequate social space.`,
        roomIds: socialRooms.map(r => r.id),
        value: ratio,
        threshold: MIN,
        suggestedFixes: socialRooms.map(r => ({
          type: 'resizeRoom' as const, roomId: r.id, scaleX: 1.2, scaleY: 1.2,
        })),
      }];
    }
    return [];
  },
};

/**
 * RB-018 — BATHROOM_CIRCULATION_ACCESS
 * At least one bathroom must be reachable from a circulation space (hall/entry/living/dining)
 * for guest accessibility — not only through bedrooms.
 * Rulebook ref: R-013 (ADA Turning Radius at All Activity Nodes)
 */
const RB_018: RuleCheck = {
  id: 'RB-018',
  ruleId: 'R-013',
  title: 'Bathroom Circulation Access',
  severity: 'info',
  applies: layout => layout.rooms.some(r => r.type === 'bathroom' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const baths = rooms.filter(r => r.type === 'bathroom');
    const circTypes = new Set(['hall', 'entry', 'living', 'living room', 'dining', 'other']);
    const anyBathOnCirc = baths.some(b =>
      rooms.some(r => circTypes.has(r.type) && roomsAreAdjacent(b, r))
    );
    if (!anyBathOnCirc) {
      return [{
        code: 'RB-018',
        severity: 'info',
        message: 'No bathroom is accessible from a circulation space (hall/entry/living) — at least one bathroom should be reachable without passing through a bedroom.',
        roomIds: baths.map(r => r.id),
        suggestedFixes: baths.length > 0
          ? [{ type: 'addHallwayConnection', nearRoomId: baths[0].id }]
          : [],
      }];
    }
    return [];
  },
};

/**
 * RB-019 — KITCHEN_MIN_AREA
 * Kitchen must have ≥ 60 sq ft usable area (warning) or ≥ 40 sq ft (error).
 * Rulebook ref: R-082 (Workstation Ergonomic Work-Triangle Optimization)
 */
const RB_019: RuleCheck = {
  id: 'RB-019',
  ruleId: 'R-082',
  title: 'Kitchen Minimum Area',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'kitchen' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const kitchens = rooms.filter(r => r.type === 'kitchen');
    const hardMin = 40;
    const recMin  = 60;
    const factor = ctx.ftToUnit * ctx.ftToUnit;
    const violations: Violation[] = [];
    for (const r of kitchens) {
      const area = roomArea(r) / factor;
      if (area < hardMin) {
        violations.push({
          code: 'RB-019',
          severity: 'error',
          message: `Kitchen "${roomLabel(r)}" area ${area.toFixed(0)} sq ft is below the hard minimum of ${hardMin} sq ft.`,
          roomIds: [r.id],
          value: area,
          threshold: hardMin,
          suggestedFixes: [{ type: 'resizeRoom', roomId: r.id, scaleX: 1.25, scaleY: 1.25 }],
        });
      } else if (area < recMin) {
        violations.push({
          code: 'RB-019',
          severity: 'warning',
          message: `Kitchen "${roomLabel(r)}" area ${area.toFixed(0)} sq ft is below the recommended ${recMin} sq ft.`,
          roomIds: [r.id],
          value: area,
          threshold: recMin,
          suggestedFixes: [{ type: 'resizeRoom', roomId: r.id, scaleX: 1.1, scaleY: 1.1 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-020 — BEDROOM_NOT_ADJACENT_ENTRY
 * Entry should not open directly into a bedroom (privacy sequence violation).
 * Rulebook ref: R-032 (Entry Sequence Primacy)
 */
const RB_020: RuleCheck = {
  id: 'RB-020',
  ruleId: 'R-032',
  title: 'Bedroom Not Adjacent to Entry',
  severity: 'warning',
  applies: layout =>
    layout.rooms.some(r => r.type === 'entry'   && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const entries  = rooms.filter(r => r.type === 'entry');
    const bedrooms = rooms.filter(r => r.type === 'bedroom');
    const violations: Violation[] = [];
    for (const e of entries) {
      for (const b of bedrooms) {
        if (roomsAreAdjacent(e, b)) {
          violations.push({
            code: 'RB-020',
            severity: 'warning',
            message: `Entry "${roomLabel(e)}" opens directly into bedroom "${roomLabel(b)}" — a public buffer space should intervene.`,
            roomIds: [e.id, b.id],
            suggestedFixes: [{ type: 'addHallwayConnection', nearRoomId: b.id }],
          });
        }
      }
    }
    return violations;
  },
};

// ── Next 10 checks (RB-021..RB-030) ──────────────────────────────────────────

/**
 * RB-021 — BATH_NOT_ADJACENT_DINING
 * Bathroom should not be directly adjacent to a dining room (odor/hygiene separation).
 * Rulebook ref: R-088 (Acoustic Noise Control Hierarchy — includes odor source avoidance)
 */
const RB_021: RuleCheck = {
  id: 'RB-021',
  ruleId: 'R-088',
  title: 'Bathroom Not Adjacent Dining',
  severity: 'warning',
  applies: layout =>
    layout.rooms.some(r => r.type === 'bathroom' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'dining'   && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const baths  = rooms.filter(r => r.type === 'bathroom');
    const dining = rooms.filter(r => r.type === 'dining');
    const violations: Violation[] = [];
    for (const b of baths) {
      for (const d of dining) {
        if (roomsAreAdjacent(b, d)) {
          violations.push({
            code: 'RB-021',
            severity: 'warning',
            message: `Bathroom "${roomLabel(b)}" is adjacent to dining room "${roomLabel(d)}" — odor and hygiene separation is required.`,
            roomIds: [b.id, d.id],
            suggestedFixes: [{ type: 'swapRooms', roomIdA: b.id, roomIdB: d.id }],
          });
        }
      }
    }
    return violations;
  },
};

/**
 * RB-022 — BATH_NOT_ADJACENT_GARAGE
 * Bathroom should not be directly adjacent to a garage (fume infiltration, noise).
 * Rulebook ref: R-088 (Acoustic Noise Control Hierarchy)
 */
const RB_022: RuleCheck = {
  id: 'RB-022',
  ruleId: 'R-088',
  title: 'Bathroom Not Adjacent Garage',
  severity: 'warning',
  applies: layout =>
    layout.rooms.some(r => r.type === 'bathroom' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'garage'   && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms   = validRooms(layout);
    const baths   = rooms.filter(r => r.type === 'bathroom');
    const garages = rooms.filter(r => r.type === 'garage');
    const violations: Violation[] = [];
    for (const b of baths) {
      for (const g of garages) {
        if (roomsAreAdjacent(b, g)) {
          violations.push({
            code: 'RB-022',
            severity: 'warning',
            message: `Bathroom "${roomLabel(b)}" is adjacent to garage "${roomLabel(g)}" — fume and noise infiltration is a health concern.`,
            roomIds: [b.id, g.id],
            suggestedFixes: [{ type: 'moveRoom', roomId: b.id, dx: -(b.x - g.x), dy: g.height + 2 }],
          });
        }
      }
    }
    return violations;
  },
};

/**
 * RB-023 — BEDROOM_CLUSTER
 * When ≥ 2 bedrooms are present, at least one pair should be adjacent to each other
 * or both adjacent to the same circulation room (bedroom-wing coherence).
 * Rulebook ref: R-025 (Interior Circulation Hierarchy Documentation)
 */
const RB_023: RuleCheck = {
  id: 'RB-023',
  ruleId: 'R-025',
  title: 'Bedroom Cluster',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.type === 'bedroom' && r.width > 0 && r.height > 0).length >= 2,
  check(layout) {
    const rooms = validRooms(layout);
    const beds  = rooms.filter(r => r.type === 'bedroom');
    const circTypes = new Set(['hall', 'living', 'living room', 'dining', 'entry', 'other']);
    const circRooms = rooms.filter(r => circTypes.has(r.type));

    // Any two bedrooms directly adjacent → clustered
    for (let i = 0; i < beds.length; i++) {
      for (let j = i + 1; j < beds.length; j++) {
        if (roomsAreAdjacent(beds[i], beds[j])) return [];
      }
    }

    // Two bedrooms share a common circulation hub → clustered in a wing
    for (const circ of circRooms) {
      const adjBeds = beds.filter(b => roomsAreAdjacent(b, circ));
      if (adjBeds.length >= 2) return [];
    }

    return [{
      code: 'RB-023',
      severity: 'info',
      message: `${beds.length} bedrooms are dispersed with no shared circulation hub or direct adjacency — bedrooms should form a coherent private wing.`,
      roomIds: beds.map(r => r.id),
      suggestedFixes: beds.length >= 2
        ? [{ type: 'moveRoom', roomId: beds[1].id, dx: beds[0].x + beds[0].width - beds[1].x, dy: 0 }]
        : [],
    }];
  },
};

/**
 * RB-024 — LIVING_NEAR_ENTRY
 * If both an entry and a living room are present, they should be adjacent.
 * The entry sequence should transition directly to the main social space.
 * Rulebook ref: R-032 (Entry Sequence Primacy)
 */
const RB_024: RuleCheck = {
  id: 'RB-024',
  ruleId: 'R-032',
  title: 'Living Room Near Entry',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'entry' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => (r.type === 'living' || r.type === 'living room') && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms   = validRooms(layout);
    const entries = rooms.filter(r => r.type === 'entry');
    const living  = rooms.filter(r => r.type === 'living' || r.type === 'living room');
    const anyAdj  = entries.some(e => living.some(l => roomsAreAdjacent(e, l)));
    if (!anyAdj) {
      return [{
        code: 'RB-024',
        severity: 'info',
        message: 'Entry is not adjacent to the living room — the entry sequence should transition directly to the main social space.',
        roomIds: [...entries.map(r => r.id), ...living.map(r => r.id)],
        suggestedFixes: entries.length > 0 && living.length > 0
          ? [{ type: 'moveRoom', roomId: living[0].id, dx: entries[0].x + entries[0].width - living[0].x, dy: entries[0].y - living[0].y }]
          : [],
      }];
    }
    return [];
  },
};

/**
 * RB-025 — CLOSET_MIN_PRESENT
 * Plans with ≥ 2 bedrooms should include at least one closet for clothing storage.
 * Rulebook ref: null (residential programming convention — not in extracted academic set)
 */
const RB_025: RuleCheck = {
  id: 'RB-025',
  ruleId: null,
  title: 'Closet Minimum Present',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.type === 'bedroom' && r.width > 0 && r.height > 0).length >= 2,
  check(layout) {
    const rooms   = validRooms(layout);
    const closets = rooms.filter(r => r.type === 'closet');
    if (closets.length === 0) {
      return [{
        code: 'RB-025',
        severity: 'info',
        message: 'No closet found — plans with 2+ bedrooms should include dedicated clothing storage.',
        suggestedFixes: [{ type: 'addRoom', roomType: 'closet' }],
      }];
    }
    return [];
  },
};

/**
 * RB-026 — LAUNDRY_IN_SERVICE_ZONE
 * Laundry must be adjacent to at least one service room (kitchen, garage, or bathroom)
 * to maintain a coherent utility zone and minimize plumbing complexity.
 * Rulebook ref: R-082 (Workstation Ergonomic Work-Triangle Optimization)
 */
const RB_026: RuleCheck = {
  id: 'RB-026',
  ruleId: 'R-082',
  title: 'Laundry in Service Zone',
  severity: 'info',
  applies: layout => layout.rooms.some(r => r.type === 'laundry' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms        = validRooms(layout);
    const laundries    = rooms.filter(r => r.type === 'laundry');
    const serviceTypes = new Set(['kitchen', 'garage', 'bathroom']);
    const serviceRooms = rooms.filter(r => serviceTypes.has(r.type));
    if (serviceRooms.length === 0) return [];

    const violations: Violation[] = [];
    for (const l of laundries) {
      const adjToService = serviceRooms.some(s => roomsAreAdjacent(l, s));
      if (!adjToService) {
        violations.push({
          code: 'RB-026',
          severity: 'info',
          message: `Laundry "${roomLabel(l)}" is not adjacent to any service room (kitchen/garage/bathroom) — laundry should be within the utility zone.`,
          roomIds: [l.id, ...serviceRooms.map(r => r.id)],
          suggestedFixes: serviceRooms.length > 0
            ? [{ type: 'moveRoom', roomId: l.id, dx: serviceRooms[0].x + serviceRooms[0].width - l.x, dy: serviceRooms[0].y - l.y }]
            : [],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-027 — OFFICE_EXTERIOR_ACCESS
 * Office/study rooms should touch at least one exterior wall for natural light and
 * ventilation, supporting cognitive performance.
 * Rulebook ref: R-021 (Daylighting Depth Rule)
 */
const RB_027: RuleCheck = {
  id: 'RB-027',
  ruleId: 'R-021',
  title: 'Office Exterior Access',
  severity: 'info',
  applies: layout => layout.rooms.some(r => r.type === 'office' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms   = validRooms(layout);
    const offices = rooms.filter(r => r.type === 'office');
    const violations: Violation[] = [];
    for (const r of offices) {
      if (!touchesExterior(r, ctx.dimW, ctx.dimD)) {
        violations.push({
          code: 'RB-027',
          severity: 'info',
          message: `Office "${roomLabel(r)}" does not touch an exterior wall — natural light improves cognitive performance and well-being.`,
          roomIds: [r.id],
          suggestedFixes: [{ type: 'moveRoom', roomId: r.id, dx: -r.x, dy: 0 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-028 — DINING_EXTERIOR_ACCESS
 * Dining room should touch at least one exterior wall for natural light and a
 * pleasant meal-time environment.
 * Rulebook ref: R-021 (Daylighting Depth Rule)
 */
const RB_028: RuleCheck = {
  id: 'RB-028',
  ruleId: 'R-021',
  title: 'Dining Exterior Access',
  severity: 'info',
  applies: layout => layout.rooms.some(r => r.type === 'dining' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms   = validRooms(layout);
    const dining  = rooms.filter(r => r.type === 'dining');
    const violations: Violation[] = [];
    for (const r of dining) {
      if (!touchesExterior(r, ctx.dimW, ctx.dimD)) {
        violations.push({
          code: 'RB-028',
          severity: 'info',
          message: `Dining room "${roomLabel(r)}" does not touch an exterior wall — natural light enhances the dining experience.`,
          roomIds: [r.id],
          suggestedFixes: [{ type: 'moveRoom', roomId: r.id, dx: 0, dy: -r.y }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-029 — BATHROOM_MIN_AREA
 * Each bathroom must have ≥ 30 sq ft usable area (warning) or ≥ 20 sq ft (error).
 * Complements ROOM_TOO_SMALL which checks minimum dimension only.
 * Rulebook ref: R-013 (ADA Turning Radius at All Activity Nodes)
 */
const RB_029: RuleCheck = {
  id: 'RB-029',
  ruleId: 'R-013',
  title: 'Bathroom Minimum Area',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'bathroom' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms    = validRooms(layout);
    const baths    = rooms.filter(r => r.type === 'bathroom');
    const hardMin  = 20;
    const recMin   = 30;
    const factor   = ctx.ftToUnit * ctx.ftToUnit;
    const violations: Violation[] = [];
    for (const r of baths) {
      const area = roomArea(r) / factor;
      if (area < hardMin) {
        violations.push({
          code: 'RB-029',
          severity: 'error',
          message: `Bathroom "${roomLabel(r)}" area ${area.toFixed(0)} sq ft is below the hard minimum of ${hardMin} sq ft.`,
          roomIds: [r.id],
          value: area,
          threshold: hardMin,
          suggestedFixes: [{ type: 'resizeRoom', roomId: r.id, scaleX: 1.3, scaleY: 1.3 }],
        });
      } else if (area < recMin) {
        violations.push({
          code: 'RB-029',
          severity: 'warning',
          message: `Bathroom "${roomLabel(r)}" area ${area.toFixed(0)} sq ft is below the recommended ${recMin} sq ft.`,
          roomIds: [r.id],
          value: area,
          threshold: recMin,
          suggestedFixes: [{ type: 'resizeRoom', roomId: r.id, scaleX: 1.15, scaleY: 1.15 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-030 — HALL_NEEDED_FOR_LARGE_PLANS
 * Plans with ≥ 3 bedrooms and covered area ≥ 800 sq ft must include at least one hall
 * to provide a circulation buffer between public and private zones.
 * Rulebook ref: R-025 (Interior Circulation Hierarchy Documentation)
 */
const RB_030: RuleCheck = {
  id: 'RB-030',
  ruleId: 'R-025',
  title: 'Hall Needed for Large Plans',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.type === 'bedroom' && r.width > 0 && r.height > 0).length >= 3,
  check(layout, ctx) {
    const rooms      = validRooms(layout);
    const beds       = rooms.filter(r => r.type === 'bedroom');
    if (beds.length < 3) return [];
    const factor     = ctx.ftToUnit * ctx.ftToUnit;
    const coveredArea = rooms.reduce((s, r) => s + roomArea(r), 0) / factor;
    if (coveredArea < 800) return [];
    const halls = rooms.filter(r => r.type === 'hall');
    if (halls.length === 0) {
      return [{
        code: 'RB-030',
        severity: 'info',
        message: `Large plan (${coveredArea.toFixed(0)} sq ft, ${beds.length} bedrooms) has no hallway — a hall is recommended to buffer public from private zones.`,
        suggestedFixes: [{ type: 'addRoom', roomType: 'hall' }],
      }];
    }
    return [];
  },
};

// ── Additional geometry helpers (used by RB-031+) ────────────────────────────

function overlapArea(a: Room2D, b: Room2D): number {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

function isContainedIn(a: Room2D, b: Room2D): boolean {
  return (
    a.x >= b.x &&
    a.y >= b.y &&
    a.x + a.width  <= b.x + b.width &&
    a.y + a.height <= b.y + b.height
  );
}

// ── Next 10 checks (RB-031..RB-040) ──────────────────────────────────────────

/**
 * RB-031 — NEAR_CONTAINMENT_TOL
 * When one room's overlap with another covers ≥ 85% of the smaller room's area
 * but strict geometric containment is not detected (floating-point gap), emit a
 * warning.  Tolerates sub-unit coordinate drift that prevents exact containment.
 * Rulebook ref: R-062 (Spatial Coherence Requirement)
 */
const RB_031: RuleCheck = {
  id: 'RB-031',
  ruleId: 'R-062',
  title: 'Near-Containment Tolerance',
  severity: 'warning',
  check(layout) {
    const rooms = validRooms(layout);
    const THRESHOLD = 0.85;
    const violations: Violation[] = [];
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i];
        const b = rooms[j];
        const oa = overlapArea(a, b);
        if (oa <= 0) continue;
        const smallerArea = Math.min(roomArea(a), roomArea(b));
        if (smallerArea <= 0) continue;
        const ratio = oa / smallerArea;
        if (ratio >= THRESHOLD && !isContainedIn(a, b) && !isContainedIn(b, a)) {
          violations.push({
            code: 'RB-031',
            severity: 'warning',
            message: `Room "${roomLabel(a)}" nearly contains "${roomLabel(b)}" (${(ratio * 100).toFixed(1)}% overlap of smaller room) — likely near-containment from floating-point coordinate drift.`,
            roomIds: [a.id, b.id],
            value: ratio,
            threshold: THRESHOLD,
            suggestedFixes: [{ type: 'moveRoom', roomId: b.id, dx: b.width + 1, dy: 0 }],
          });
        }
      }
    }
    return violations;
  },
};

/**
 * RB-032 — TOTAL_OVERLAP_BUDGET
 * The sum of all pairwise room overlap areas must not exceed 2% of total covered
 * area.  Catches plans where many small overlaps accumulate into a significant
 * shared-space budget that invalidates the floor plan geometry.
 * Rulebook ref: R-062 (Spatial Coherence Requirement)
 */
const RB_032: RuleCheck = {
  id: 'RB-032',
  ruleId: 'R-062',
  title: 'Total Overlap Budget',
  severity: 'error',
  check(layout) {
    const rooms = validRooms(layout);
    const coveredArea = rooms.reduce((s, r) => s + roomArea(r), 0);
    if (coveredArea === 0) return [];
    let totalOA = 0;
    const involvedIds = new Set<string>();
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const oa = overlapArea(rooms[i], rooms[j]);
        if (oa > 0) {
          totalOA += oa;
          involvedIds.add(rooms[i].id);
          involvedIds.add(rooms[j].id);
        }
      }
    }
    const BUDGET = 0.02;
    if (totalOA / coveredArea > BUDGET) {
      return [{
        code: 'RB-032',
        severity: 'error',
        message: `Total overlap area ${totalOA.toFixed(1)} sq units is ${(totalOA / coveredArea * 100).toFixed(1)}% of covered area — must be ≤ ${BUDGET * 100}%.`,
        roomIds: [...involvedIds],
        value: totalOA / coveredArea,
        threshold: BUDGET,
      }];
    }
    return [];
  },
};

/**
 * RB-033 — BEDROOM_HALL_ACCESS
 * Every bedroom must be able to reach at least one hall or entry room within
 * 2 adjacency hops.  Bedrooms accessible only through living or kitchen
 * (but no hall or entry within 2 steps) lack a proper private-zone buffer.
 * Rulebook ref: R-025 (Interior Circulation Hierarchy Documentation)
 */
const RB_033: RuleCheck = {
  id: 'RB-033',
  ruleId: 'R-025',
  title: 'Bedroom Hall/Entry Access',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => (r.type === 'hall' || r.type === 'entry') && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms   = validRooms(layout);
    const beds    = rooms.filter(r => r.type === 'bedroom');
    const privateHub = new Set(['hall', 'entry']);

    function reachesHubIn2(bed: Room2D): boolean {
      // 1 hop
      const hop1 = rooms.filter(r => r.id !== bed.id && roomsAreAdjacent(bed, r));
      if (hop1.some(r => privateHub.has(r.type))) return true;
      // 2 hops
      for (const mid of hop1) {
        const hop2 = rooms.filter(r => r.id !== bed.id && r.id !== mid.id && roomsAreAdjacent(mid, r));
        if (hop2.some(r => privateHub.has(r.type))) return true;
      }
      return false;
    }

    const violations: Violation[] = [];
    for (const b of beds) {
      if (!reachesHubIn2(b)) {
        violations.push({
          code: 'RB-033',
          severity: 'info',
          message: `Bedroom "${roomLabel(b)}" cannot reach a hall or entry within 2 adjacency hops — bedrooms should be accessible from a private circulation buffer.`,
          roomIds: [b.id],
          suggestedFixes: [{ type: 'addHallwayConnection', nearRoomId: b.id }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-034 — BATH_KITCHEN_BUFFER
 * A bathroom and a kitchen must not share a direct wall.  Plumbing odors and
 * sanitation conflicts require at least one buffer room (hall/closet) between them.
 * Rulebook ref: R-088 (Acoustic Noise Control Hierarchy — includes odor source avoidance)
 */
const RB_034: RuleCheck = {
  id: 'RB-034',
  ruleId: 'R-088',
  title: 'Bath–Kitchen Buffer Required',
  severity: 'warning',
  applies: layout =>
    layout.rooms.some(r => r.type === 'bathroom' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'kitchen'  && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms   = validRooms(layout);
    const baths   = rooms.filter(r => r.type === 'bathroom');
    const kitchens = rooms.filter(r => r.type === 'kitchen');
    const violations: Violation[] = [];
    for (const b of baths) {
      for (const k of kitchens) {
        if (roomsAreAdjacent(b, k)) {
          violations.push({
            code: 'RB-034',
            severity: 'warning',
            message: `Bathroom "${roomLabel(b)}" is directly adjacent to kitchen "${roomLabel(k)}" — a hall or closet buffer is required between wet rooms.`,
            roomIds: [b.id, k.id],
            suggestedFixes: [{ type: 'addHallwayConnection', nearRoomId: b.id }],
          });
        }
      }
    }
    return violations;
  },
};

/**
 * RB-035 — KITCHEN_PANTRY_ADJACENCY
 * When a pantry room is present it must be directly adjacent to the kitchen.
 * A pantry separated from the kitchen forces unnecessary cross-traffic.
 * Rulebook ref: R-082 (Workstation Ergonomic Work-Triangle Optimization)
 */
const RB_035: RuleCheck = {
  id: 'RB-035',
  ruleId: 'R-082',
  title: 'Kitchen–Pantry Adjacency',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'pantry' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'kitchen' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms    = validRooms(layout);
    const pantries = rooms.filter(r => r.type === 'pantry');
    const kitchens = rooms.filter(r => r.type === 'kitchen');
    const violations: Violation[] = [];
    for (const p of pantries) {
      const adjToKitchen = kitchens.some(k => roomsAreAdjacent(p, k));
      if (!adjToKitchen) {
        violations.push({
          code: 'RB-035',
          severity: 'info',
          message: `Pantry "${roomLabel(p)}" is not adjacent to any kitchen — the pantry should be directly accessible from the kitchen.`,
          roomIds: [p.id, ...kitchens.map(k => k.id)],
          suggestedFixes: kitchens.length > 0
            ? [{ type: 'moveRoom', roomId: p.id, dx: kitchens[0].x + kitchens[0].width - p.x, dy: kitchens[0].y - p.y }]
            : [],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-036 — WET_CORE_DISPERSAL
 * Kitchen + bathrooms + laundry (the "wet core") should share a coherent zone.
 * When the bounding box of all wet rooms exceeds 50% of the floor plan area,
 * plumbing runs are excessively long and the wet core is considered dispersed.
 * Rulebook ref: R-082 (Workstation Ergonomic Work-Triangle Optimization)
 */
const RB_036: RuleCheck = {
  id: 'RB-036',
  ruleId: 'R-082',
  title: 'Wet Core Dispersal',
  severity: 'warning',
  applies: layout => {
    const wet = layout.rooms.filter(
      r => (r.type === 'kitchen' || r.type === 'bathroom' || r.type === 'laundry') &&
           r.width > 0 && r.height > 0
    );
    return wet.length >= 2;
  },
  check(layout, ctx) {
    const rooms   = validRooms(layout);
    const wetRooms = rooms.filter(
      r => r.type === 'kitchen' || r.type === 'bathroom' || r.type === 'laundry'
    );
    if (wetRooms.length < 2) return [];
    const minX = Math.min(...wetRooms.map(r => r.x));
    const minY = Math.min(...wetRooms.map(r => r.y));
    const maxX = Math.max(...wetRooms.map(r => r.x + r.width));
    const maxY = Math.max(...wetRooms.map(r => r.y + r.height));
    const bboxArea = (maxX - minX) * (maxY - minY);
    const planArea = ctx.dimW * ctx.dimD;
    if (planArea === 0) return [];
    const ratio = bboxArea / planArea;
    const THRESHOLD = 0.5;
    if (ratio > THRESHOLD) {
      // Suggest moving the furthest wet room toward the centroid
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const furthest = wetRooms.reduce((worst, r) => {
        const d = Math.hypot(r.x + r.width / 2 - cx, r.y + r.height / 2 - cy);
        const dw = Math.hypot(worst.x + worst.width / 2 - cx, worst.y + worst.height / 2 - cy);
        return d > dw ? r : worst;
      });
      return [{
        code: 'RB-036',
        severity: 'warning',
        message: `Wet core (kitchen/bathroom/laundry) bounding box covers ${(ratio * 100).toFixed(1)}% of floor plan — recommended ≤ ${THRESHOLD * 100}% for efficient plumbing.`,
        roomIds: wetRooms.map(r => r.id),
        value: ratio,
        threshold: THRESHOLD,
        suggestedFixes: [{ type: 'moveRoom', roomId: furthest.id, dx: cx - (furthest.x + furthest.width / 2), dy: cy - (furthest.y + furthest.height / 2) }],
      }];
    }
    return [];
  },
};

/**
 * RB-037 — BEDROOM_PASS_THROUGH
 * A bedroom with ≥ 3 adjacencies to other rooms is likely a pass-through node,
 * degrading privacy.  Bedrooms should have ≤ 2 shared walls with other spaces.
 * Rulebook ref: R-001 (Prospect-Refuge Balance — retreat spaces require enclosure)
 */
const RB_037: RuleCheck = {
  id: 'RB-037',
  ruleId: 'R-001',
  title: 'Bedroom Pass-Through',
  severity: 'info',
  applies: layout => layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const beds  = rooms.filter(r => r.type === 'bedroom');
    const violations: Violation[] = [];
    for (const b of beds) {
      const neighbors = rooms.filter(r => r.id !== b.id && roomsAreAdjacent(b, r));
      if (neighbors.length >= 3) {
        violations.push({
          code: 'RB-037',
          severity: 'info',
          message: `Bedroom "${roomLabel(b)}" is adjacent to ${neighbors.length} rooms — 3+ adjacencies suggest a pass-through configuration that compromises privacy.`,
          roomIds: [b.id, ...neighbors.map(n => n.id)],
          value: neighbors.length,
          threshold: 3,
          suggestedFixes: [{ type: 'resizeRoom', roomId: b.id, scaleX: 0.9, scaleY: 0.9 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-038 — BATHROOM_PASS_THROUGH
 * A bathroom with ≥ 3 adjacencies to other rooms is likely a pass-through node.
 * Bathrooms should be private dead-ends, not corridor junctions.
 * Rulebook ref: R-001 (Prospect-Refuge Balance)
 */
const RB_038: RuleCheck = {
  id: 'RB-038',
  ruleId: 'R-001',
  title: 'Bathroom Pass-Through',
  severity: 'info',
  applies: layout => layout.rooms.some(r => r.type === 'bathroom' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const baths = rooms.filter(r => r.type === 'bathroom');
    const violations: Violation[] = [];
    for (const b of baths) {
      const neighbors = rooms.filter(r => r.id !== b.id && roomsAreAdjacent(b, r));
      if (neighbors.length >= 3) {
        violations.push({
          code: 'RB-038',
          severity: 'info',
          message: `Bathroom "${roomLabel(b)}" is adjacent to ${neighbors.length} rooms — bathrooms should be private dead-ends, not pass-through junctions.`,
          roomIds: [b.id, ...neighbors.map(n => n.id)],
          value: neighbors.length,
          threshold: 3,
          suggestedFixes: [{ type: 'resizeRoom', roomId: b.id, scaleX: 0.85, scaleY: 0.85 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-039 — BEDROOM_NOT_ADJACENT_LIVING
 * A bedroom that shares a direct wall with the living room lacks private-zone
 * separation.  A hallway or closet should intervene between the social hub and
 * the sleeping zone.
 * Rulebook ref: R-033 (Visual Privacy Threshold Distance)
 */
const RB_039: RuleCheck = {
  id: 'RB-039',
  ruleId: 'R-033',
  title: 'Bedroom Not Adjacent to Living Room',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => (r.type === 'living' || r.type === 'living room') && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms   = validRooms(layout);
    const beds    = rooms.filter(r => r.type === 'bedroom');
    const living  = rooms.filter(r => r.type === 'living' || r.type === 'living room');
    const violations: Violation[] = [];
    for (const b of beds) {
      for (const l of living) {
        if (roomsAreAdjacent(b, l)) {
          violations.push({
            code: 'RB-039',
            severity: 'info',
            message: `Bedroom "${roomLabel(b)}" is directly adjacent to living room "${roomLabel(l)}" — a hallway or closet buffer should separate the private and social zones.`,
            roomIds: [b.id, l.id],
            suggestedFixes: [{ type: 'addHallwayConnection', nearRoomId: b.id }],
          });
        }
      }
    }
    return violations;
  },
};

/**
 * RB-040 — ENTRY_NEEDS_HALL
 * In plans with ≥ 2 bedrooms, the entry room should be adjacent to at least one
 * hallway.  Without a hall at the entry, the entry opens directly into habitable
 * rooms with no semi-public transition buffer.
 * Rulebook ref: R-032 (Entry Sequence Primacy)
 */
const RB_040: RuleCheck = {
  id: 'RB-040',
  ruleId: 'R-032',
  title: 'Entry Needs Hall Buffer',
  severity: 'warning',
  applies: layout =>
    layout.rooms.some(r => r.type === 'entry' && r.width > 0 && r.height > 0) &&
    layout.rooms.filter(r => r.type === 'bedroom' && r.width > 0 && r.height > 0).length >= 2,
  check(layout) {
    const rooms   = validRooms(layout);
    const entries = rooms.filter(r => r.type === 'entry');
    const halls   = rooms.filter(r => r.type === 'hall');
    if (halls.length === 0) {
      return [{
        code: 'RB-040',
        severity: 'warning',
        message: 'Entry has no adjacent hallway — plans with ≥ 2 bedrooms need a hall at the entry to buffer the public threshold from private rooms.',
        roomIds: entries.map(e => e.id),
        suggestedFixes: entries.length > 0
          ? [{ type: 'addRoom', roomType: 'hall' }]
          : [],
      }];
    }
    const violations: Violation[] = [];
    for (const e of entries) {
      const adjToHall = halls.some(h => roomsAreAdjacent(e, h));
      if (!adjToHall) {
        violations.push({
          code: 'RB-040',
          severity: 'warning',
          message: `Entry "${roomLabel(e)}" is not adjacent to any hallway — the entry sequence requires a hall buffer before reaching private rooms.`,
          roomIds: [e.id, ...halls.map(h => h.id)],
          suggestedFixes: [{ type: 'addHallwayConnection', nearRoomId: e.id }],
        });
      }
    }
    return violations;
  },
};

// ── Next 10 checks (RB-041..RB-050) ──────────────────────────────────────────

/**
 * RB-041 — GARAGE_BEDROOM_SEPARATION
 * A garage must not share a direct wall with a bedroom (engine noise, exhaust fumes,
 * ASHRAE 62.2 §4.4 prohibits direct air-path between garage and habitable spaces).
 * Rulebook ref: R-088 (Acoustic Noise Control Hierarchy)
 */
const RB_041: RuleCheck = {
  id: 'RB-041',
  ruleId: 'R-088',
  title: 'Garage–Bedroom Separation',
  severity: 'warning',
  applies: layout =>
    layout.rooms.some(r => r.type === 'garage'  && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms    = validRooms(layout);
    const garages  = rooms.filter(r => r.type === 'garage');
    const bedrooms = rooms.filter(r => r.type === 'bedroom');
    const violations: Violation[] = [];
    for (const g of garages) {
      for (const b of bedrooms) {
        if (roomsAreAdjacent(g, b)) {
          violations.push({
            code: 'RB-041',
            severity: 'warning',
            message: `Bedroom "${roomLabel(b)}" is directly adjacent to garage "${roomLabel(g)}" — engine noise, fumes, and exhaust require separation per ASHRAE 62.2.`,
            roomIds: [g.id, b.id],
            suggestedFixes: [{ type: 'swapRooms', roomIdA: g.id, roomIdB: b.id }],
          });
        }
      }
    }
    return violations;
  },
};

/**
 * RB-042 — KITCHEN_LIVING_ADJACENCY
 * Kitchen and living room should share a direct wall to support efficient
 * food service, social hosting, and open-plan circulation.
 * Rulebook ref: R-082 (Workstation Ergonomic Work-Triangle Optimization)
 */
const RB_042: RuleCheck = {
  id: 'RB-042',
  ruleId: 'R-082',
  title: 'Kitchen–Living Adjacency',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'kitchen' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => (r.type === 'living' || r.type === 'living room') && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms    = validRooms(layout);
    const kitchens = rooms.filter(r => r.type === 'kitchen');
    const living   = rooms.filter(r => r.type === 'living' || r.type === 'living room');
    const anyAdj   = kitchens.some(k => living.some(l => roomsAreAdjacent(k, l)));
    if (!anyAdj) {
      return [{
        code: 'RB-042',
        severity: 'info',
        message: 'Kitchen and living room are not adjacent — social hosting and food service efficiency require kitchen–living adjacency.',
        roomIds: [...kitchens.map(r => r.id), ...living.map(r => r.id)],
        suggestedFixes: kitchens.length > 0 && living.length > 0
          ? [{ type: 'moveRoom', roomId: kitchens[0].id, dx: living[0].x + living[0].width - kitchens[0].x, dy: living[0].y - kitchens[0].y }]
          : [],
      }];
    }
    return [];
  },
};

/**
 * RB-043 — BATHROOM_EXTERIOR_ACCESS
 * Each bathroom should touch at least one exterior wall to enable natural
 * ventilation and light, reducing moisture and mold risk.
 * Rulebook ref: R-021 (Daylighting Depth Rule)
 */
const RB_043: RuleCheck = {
  id: 'RB-043',
  ruleId: 'R-021',
  title: 'Bathroom Exterior Access',
  severity: 'info',
  applies: layout => layout.rooms.some(r => r.type === 'bathroom' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const baths = rooms.filter(r => r.type === 'bathroom');
    const violations: Violation[] = [];
    for (const r of baths) {
      if (!touchesExterior(r, ctx.dimW, ctx.dimD)) {
        violations.push({
          code: 'RB-043',
          severity: 'info',
          message: `Bathroom "${roomLabel(r)}" does not touch an exterior wall — natural ventilation reduces moisture and mold risk.`,
          roomIds: [r.id],
          suggestedFixes: [{ type: 'moveRoom', roomId: r.id, dx: -r.x, dy: 0 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-044 — KITCHEN_NOT_ADJACENT_GARAGE
 * Kitchen must not share a direct wall with a garage (carbon monoxide, gasoline
 * vapors, and exhaust are food-safety hazards; ASHRAE 62.2 §4.4).
 * Rulebook ref: R-088 (Acoustic Noise Control Hierarchy)
 */
const RB_044: RuleCheck = {
  id: 'RB-044',
  ruleId: 'R-088',
  title: 'Kitchen Not Adjacent Garage',
  severity: 'warning',
  applies: layout =>
    layout.rooms.some(r => r.type === 'kitchen' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'garage'  && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms    = validRooms(layout);
    const kitchens = rooms.filter(r => r.type === 'kitchen');
    const garages  = rooms.filter(r => r.type === 'garage');
    const violations: Violation[] = [];
    for (const k of kitchens) {
      for (const g of garages) {
        if (roomsAreAdjacent(k, g)) {
          violations.push({
            code: 'RB-044',
            severity: 'warning',
            message: `Kitchen "${roomLabel(k)}" is directly adjacent to garage "${roomLabel(g)}" — fumes and exhaust are a food-safety and health hazard.`,
            roomIds: [k.id, g.id],
            suggestedFixes: [{ type: 'swapRooms', roomIdA: k.id, roomIdB: g.id }],
          });
        }
      }
    }
    return violations;
  },
};

/**
 * RB-045 — ENTRY_ROOM_PRESENT
 * Residential plans should include at least one dedicated entry/foyer room to
 * initiate the public→semi-public→private spatial hierarchy.
 * Rulebook ref: R-032 (Entry Sequence Primacy)
 */
const RB_045: RuleCheck = {
  id: 'RB-045',
  ruleId: 'R-032',
  title: 'Entry Room Present',
  severity: 'info',
  applies: layout => layout.rooms.some(r => r.width > 0 && r.height > 0),
  check(layout) {
    const rooms   = validRooms(layout);
    const entries = rooms.filter(r => r.type === 'entry');
    if (entries.length === 0) {
      return [{
        code: 'RB-045',
        severity: 'info',
        message: 'No entry/foyer room found — a dedicated entry initiates the public-to-private spatial hierarchy.',
        suggestedFixes: [{ type: 'addRoom', roomType: 'entry' }],
      }];
    }
    return [];
  },
};

/**
 * RB-046 — LIVING_MIN_AREA
 * Living room must have ≥ 120 sq ft usable area (warning) or ≥ 180 sq ft (recommended).
 * Supports adequate seating arrangement for social interaction.
 * Rulebook ref: R-026 (Spatial Zone Count Limit)
 */
const RB_046: RuleCheck = {
  id: 'RB-046',
  ruleId: 'R-026',
  title: 'Living Room Minimum Area',
  severity: 'warning',
  applies: layout =>
    layout.rooms.some(r => (r.type === 'living' || r.type === 'living room') && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms      = validRooms(layout);
    const living     = rooms.filter(r => r.type === 'living' || r.type === 'living room');
    const hardMin    = 120; // sq ft — minimum seating group
    const recMin     = 180; // sq ft — comfortable social space
    const factor     = ctx.ftToUnit * ctx.ftToUnit;
    const violations: Violation[] = [];
    for (const r of living) {
      const area = roomArea(r) / factor;
      if (area < hardMin) {
        violations.push({
          code: 'RB-046',
          severity: 'error',
          message: `Living room "${roomLabel(r)}" area ${area.toFixed(0)} sq ft is below the hard minimum of ${hardMin} sq ft.`,
          roomIds: [r.id],
          value: area,
          threshold: hardMin,
          suggestedFixes: [{ type: 'resizeRoom', roomId: r.id, scaleX: 1.3, scaleY: 1.3 }],
        });
      } else if (area < recMin) {
        violations.push({
          code: 'RB-046',
          severity: 'warning',
          message: `Living room "${roomLabel(r)}" area ${area.toFixed(0)} sq ft is below the recommended ${recMin} sq ft for comfortable social seating.`,
          roomIds: [r.id],
          value: area,
          threshold: recMin,
          suggestedFixes: [{ type: 'resizeRoom', roomId: r.id, scaleX: 1.15, scaleY: 1.15 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-047 — NO_ORPHAN_ROOMS
 * Every room in a multi-room plan must have at least one adjacency to another room.
 * Rooms with zero shared walls are topologically disconnected from the plan.
 * Rulebook ref: R-031 (Floor Plan Interconnection Density Limit)
 */
const RB_047: RuleCheck = {
  id: 'RB-047',
  ruleId: 'R-031',
  title: 'No Orphan Rooms',
  severity: 'warning',
  applies: layout => layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 2,
  check(layout) {
    const rooms = validRooms(layout);
    if (rooms.length < 2) return [];
    const violations: Violation[] = [];
    for (const r of rooms) {
      const hasNeighbor = rooms.some(other => other.id !== r.id && roomsAreAdjacent(r, other));
      if (!hasNeighbor) {
        violations.push({
          code: 'RB-047',
          severity: 'warning',
          message: `Room "${roomLabel(r)}" (${r.type}) has no adjacency to any other room — all rooms must share at least one wall with the plan.`,
          roomIds: [r.id],
          suggestedFixes: [{ type: 'moveRoom', roomId: r.id, dx: rooms[0].x + rooms[0].width - r.x, dy: rooms[0].y - r.y }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-048 — GARAGE_EXTERIOR_ACCESS
 * A garage must touch at least one exterior wall — without exterior access a
 * vehicle door is impossible, and fire egress from the garage is blocked.
 * Rulebook ref: R-036 (Exterior Door Count Minimization)
 */
const RB_048: RuleCheck = {
  id: 'RB-048',
  ruleId: 'R-036',
  title: 'Garage Exterior Access',
  severity: 'error',
  applies: layout => layout.rooms.some(r => r.type === 'garage' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms   = validRooms(layout);
    const garages = rooms.filter(r => r.type === 'garage');
    const violations: Violation[] = [];
    for (const g of garages) {
      if (!touchesExterior(g, ctx.dimW, ctx.dimD)) {
        violations.push({
          code: 'RB-048',
          severity: 'error',
          message: `Garage "${roomLabel(g)}" does not touch an exterior wall — a vehicle door and fire egress are impossible without exterior access.`,
          roomIds: [g.id],
          suggestedFixes: [{ type: 'moveRoom', roomId: g.id, dx: -g.x, dy: 0 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-049 — LAUNDRY_NOT_ADJACENT_KITCHEN
 * Laundry rooms should not share a direct wall with the kitchen — detergent
 * chemicals, lint, and moisture are contamination risks in food-prep areas.
 * Rulebook ref: R-088 (Acoustic Noise Control Hierarchy)
 */
const RB_049: RuleCheck = {
  id: 'RB-049',
  ruleId: 'R-088',
  title: 'Laundry Not Adjacent Kitchen',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'laundry' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'kitchen' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms      = validRooms(layout);
    const laundries  = rooms.filter(r => r.type === 'laundry');
    const kitchens   = rooms.filter(r => r.type === 'kitchen');
    const violations: Violation[] = [];
    for (const l of laundries) {
      for (const k of kitchens) {
        if (roomsAreAdjacent(l, k)) {
          violations.push({
            code: 'RB-049',
            severity: 'info',
            message: `Laundry "${roomLabel(l)}" is adjacent to kitchen "${roomLabel(k)}" — detergent chemicals and moisture are contamination risks in food-preparation areas.`,
            roomIds: [l.id, k.id],
            suggestedFixes: [{ type: 'swapRooms', roomIdA: l.id, roomIdB: k.id }],
          });
        }
      }
    }
    return violations;
  },
};

/**
 * RB-050 — MINIMUM_GROSS_AREA
 * Total covered area must be at least 200 sq ft.  Plans below this threshold
 * cannot accommodate required habitable spaces and are non-buildable dwellings.
 * Rulebook ref: null (IRC R304.1 / HUD Minimum Property Standards)
 */
const RB_050: RuleCheck = {
  id: 'RB-050',
  ruleId: null,
  title: 'Minimum Gross Area',
  severity: 'error',
  applies: layout => layout.rooms.some(r => r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const factor = ctx.ftToUnit * ctx.ftToUnit;
    const coveredArea = rooms.reduce((s, r) => s + roomArea(r), 0) / factor;
    const MIN_AREA = 200; // sq ft
    if (coveredArea < MIN_AREA) {
      return [{
        code: 'RB-050',
        severity: 'error',
        message: `Total covered area ${coveredArea.toFixed(0)} sq ft is below the minimum of ${MIN_AREA} sq ft for a habitable dwelling.`,
        value: coveredArea,
        threshold: MIN_AREA,
        suggestedFixes: rooms.map(r => ({ type: 'resizeRoom' as const, roomId: r.id, scaleX: 1.5, scaleY: 1.5 })),
      }];
    }
    return [];
  },
};

/**
 * RB-051 — DINING_MIN_AREA
 * Each dining room must have ≥ 80 sq ft (4-person table + clearances) or
 * ≥ 60 sq ft (minimum 2-person). Below 60 sq ft is an error.
 * Rulebook ref: R-049 (Collaborative Seating Orientation)
 */
const RB_051: RuleCheck = {
  id: 'RB-051',
  ruleId: 'R-049',
  title: 'Dining Room Minimum Area',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'dining' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const dining = rooms.filter(r => r.type === 'dining');
    const factor = ctx.ftToUnit * ctx.ftToUnit;
    const violations: Violation[] = [];
    for (const d of dining) {
      const area = roomArea(d) / factor;
      if (area < 60) {
        violations.push({
          code: 'RB-051',
          severity: 'error',
          message: `Dining room "${roomLabel(d)}" is ${area.toFixed(0)} sq ft — below the 60 sq ft minimum for even a 2-person table with egress clearance.`,
          roomIds: [d.id],
          value: area,
          threshold: 60,
          suggestedFixes: [{ type: 'resizeRoom', roomId: d.id, scaleX: 1.3, scaleY: 1.3 }],
        });
      } else if (area < 80) {
        violations.push({
          code: 'RB-051',
          severity: 'warning',
          message: `Dining room "${roomLabel(d)}" is ${area.toFixed(0)} sq ft — recommend ≥ 80 sq ft for a 4-person table with required clearances.`,
          roomIds: [d.id],
          value: area,
          threshold: 80,
          suggestedFixes: [{ type: 'resizeRoom', roomId: d.id, scaleX: 1.15, scaleY: 1.15 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-052 — OFFICE_MIN_AREA
 * Each office/study must have ≥ 80 sq ft for a functional single-person
 * workspace with desk, chair, and required circulation clearances.
 * Rulebook ref: R-046 (Social-Distance Workstation Compliance)
 */
const RB_052: RuleCheck = {
  id: 'RB-052',
  ruleId: 'R-046',
  title: 'Office Minimum Area',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'office' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const offices = rooms.filter(r => r.type === 'office');
    const factor = ctx.ftToUnit * ctx.ftToUnit;
    const violations: Violation[] = [];
    const MIN_AREA = 80; // sq ft
    for (const o of offices) {
      const area = roomArea(o) / factor;
      if (area < MIN_AREA) {
        violations.push({
          code: 'RB-052',
          severity: 'warning',
          message: `Office "${roomLabel(o)}" is ${area.toFixed(0)} sq ft — recommend ≥ ${MIN_AREA} sq ft for a functional workspace with desk, chair, and circulation clearances.`,
          roomIds: [o.id],
          value: area,
          threshold: MIN_AREA,
          suggestedFixes: [{ type: 'resizeRoom', roomId: o.id, scaleX: 1.2, scaleY: 1.2 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-053 — STAIR_GEOMETRY
 * Stair rooms must be ≥ 3.5 ft in their narrower dimension and ≥ 6 ft
 * in their longer dimension (IRC R311.7.1 minimum 36-in clear width).
 * Rulebook ref: R-014 (Stair Geometry Compliance)
 */
const RB_053: RuleCheck = {
  id: 'RB-053',
  ruleId: 'R-014',
  title: 'Stair Room Geometry',
  severity: 'error',
  applies: layout => layout.rooms.some(r => r.type === 'stair' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const stairs = rooms.filter(r => r.type === 'stair');
    const violations: Violation[] = [];
    const MIN_NARROW = 3.5 * ctx.ftToUnit;  // 3.5 ft
    const MIN_LONG   = 6.0 * ctx.ftToUnit;  // 6 ft
    for (const s of stairs) {
      const narrow = Math.min(s.width, s.height);
      const long   = Math.max(s.width, s.height);
      if (narrow < MIN_NARROW || long < MIN_LONG) {
        const narrowFt = (narrow / ctx.ftToUnit).toFixed(1);
        const longFt   = (long   / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-053',
          severity: 'error',
          message: `Stair room "${roomLabel(s)}" is ${narrowFt} ft × ${longFt} ft — must be at least 3.5 ft wide and 6 ft long for a code-compliant stair (IRC R311.7.1).`,
          roomIds: [s.id],
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: s.id,
            targetW: Math.max(s.width,  MIN_NARROW),
            targetH: Math.max(s.height, MIN_LONG),
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-054 — PRIMARY_BEDROOM_MIN_AREA
 * The primary (master) bedroom — identified by label or as the largest bedroom —
 * must be ≥ 120 sq ft (king/queen bed + bedside clearances + ADA turning radius).
 * Rulebook ref: R-013 (ADA Turning Radius at All Activity Nodes)
 */
const RB_054: RuleCheck = {
  id: 'RB-054',
  ruleId: 'R-013',
  title: 'Primary Bedroom Minimum Area',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const bedrooms = rooms.filter(r => r.type === 'bedroom');
    if (bedrooms.length === 0) return [];
    const factor = ctx.ftToUnit * ctx.ftToUnit;
    const MIN_AREA = 120; // sq ft

    // Identify primary: explicit label match first, otherwise largest bedroom.
    const isPrimary = (r: Room2D) => {
      const lbl = (r.label ?? '').toLowerCase();
      return lbl.includes('primary') || lbl.includes('master');
    };
    let primary = bedrooms.find(isPrimary);
    if (!primary) {
      primary = bedrooms.reduce((best, r) => roomArea(r) > roomArea(best) ? r : best, bedrooms[0]);
    }

    const area = roomArea(primary) / factor;
    if (area < MIN_AREA) {
      return [{
        code: 'RB-054',
        severity: 'warning',
        message: `Primary bedroom "${roomLabel(primary)}" is ${area.toFixed(0)} sq ft — recommend ≥ ${MIN_AREA} sq ft for a king/queen bed, bedside clearances, and ADA turning radius.`,
        roomIds: [primary.id],
        value: area,
        threshold: MIN_AREA,
        suggestedFixes: [{ type: 'resizeRoom', roomId: primary.id, scaleX: 1.2, scaleY: 1.2 }],
      }];
    }
    return [];
  },
};

/**
 * RB-055 — KITCHEN_DINING_ADJACENCY
 * When both a kitchen and a dining room are present, they should share a wall.
 * Separating the two primary food-service workstations increases travel distance.
 * Rulebook ref: R-082 (Repetitive-Task Workstation Hubs)
 */
const RB_055: RuleCheck = {
  id: 'RB-055',
  ruleId: 'R-082',
  title: 'Kitchen-Dining Adjacency',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'kitchen' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'dining'  && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms    = validRooms(layout);
    const kitchens = rooms.filter(r => r.type === 'kitchen');
    const dinings  = rooms.filter(r => r.type === 'dining');
    const violations: Violation[] = [];
    for (const k of kitchens) {
      const adjDining = dinings.some(d => roomsAreAdjacent(k, d));
      if (!adjDining) {
        violations.push({
          code: 'RB-055',
          severity: 'info',
          message: `Kitchen "${roomLabel(k)}" is not adjacent to any dining room — food-service workstations should share a wall to minimize cross-traffic.`,
          roomIds: [k.id, ...dinings.map(d => d.id)],
          suggestedFixes: dinings.map(d => ({ type: 'swapRooms' as const, roomIdA: k.id, roomIdB: d.id })),
        });
      }
    }
    return violations;
  },
};

/**
 * RB-056 — KITCHEN_MIN_WIDTH
 * A kitchen must be ≥ 8 ft in its narrower dimension to accommodate counter
 * depths (2 ft each side) plus a 4-ft aisle for the work triangle.
 * Rulebook ref: R-082 (Repetitive-Task Workstation Hubs)
 */
const RB_056: RuleCheck = {
  id: 'RB-056',
  ruleId: 'R-082',
  title: 'Kitchen Minimum Width',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'kitchen' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const kitchens = rooms.filter(r => r.type === 'kitchen');
    const violations: Violation[] = [];
    const MIN_W = 8 * ctx.ftToUnit; // 8 ft
    for (const k of kitchens) {
      const narrow = Math.min(k.width, k.height);
      if (narrow < MIN_W) {
        const narrowFt = (narrow / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-056',
          severity: 'warning',
          message: `Kitchen "${roomLabel(k)}" is only ${narrowFt} ft wide — must be ≥ 8 ft to fit counter depths (2 ft each side) plus a 4-ft aisle.`,
          roomIds: [k.id],
          value: narrow / ctx.ftToUnit,
          threshold: 8,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: k.id,
            targetW: k.width  < k.height ? MIN_W : k.width,
            targetH: k.height < k.width  ? MIN_W : k.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-057 — LAUNDRY_EXTERIOR_ACCESS
 * A laundry room should touch at least one exterior wall so a dryer vent
 * penetration is possible (IRC M1502.3 requires exterior termination).
 * Rulebook ref: R-036 (Exterior Door Count Minimization)
 */
const RB_057: RuleCheck = {
  id: 'RB-057',
  ruleId: 'R-036',
  title: 'Laundry Exterior Access',
  severity: 'info',
  applies: layout => layout.rooms.some(r => r.type === 'laundry' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const laundries = rooms.filter(r => r.type === 'laundry');
    const violations: Violation[] = [];
    for (const l of laundries) {
      if (!touchesExterior(l, ctx.dimW, ctx.dimD)) {
        violations.push({
          code: 'RB-057',
          severity: 'info',
          message: `Laundry room "${roomLabel(l)}" does not touch an exterior wall — a dryer vent penetration requires exterior wall access (IRC M1502.3).`,
          roomIds: [l.id],
          suggestedFixes: [{ type: 'moveRoom', roomId: l.id, dx: -l.x, dy: 0 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-058 — BATHROOM_MIN_WIDTH
 * Each bathroom must be ≥ 5 ft in its narrower dimension.
 * 5 ft provides the ADA 60-in turning diameter and minimum fixture clearances.
 * Rulebook ref: R-013 (ADA Turning Radius at All Activity Nodes)
 */
const RB_058: RuleCheck = {
  id: 'RB-058',
  ruleId: 'R-013',
  title: 'Bathroom Minimum Width',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'bathroom' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const baths = rooms.filter(r => r.type === 'bathroom');
    const violations: Violation[] = [];
    const MIN_W = 5 * ctx.ftToUnit; // 5 ft
    for (const b of baths) {
      const narrow = Math.min(b.width, b.height);
      if (narrow < MIN_W) {
        const narrowFt = (narrow / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-058',
          severity: 'warning',
          message: `Bathroom "${roomLabel(b)}" is only ${narrowFt} ft wide — must be ≥ 5 ft for ADA turning radius and required fixture clearances (ADA §603; IRC R307.1).`,
          roomIds: [b.id],
          value: narrow / ctx.ftToUnit,
          threshold: 5,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: b.id,
            targetW: b.width  < b.height ? MIN_W : b.width,
            targetH: b.height < b.width  ? MIN_W : b.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-059 — HABITABLE_ROOM_DAYLIGHTING_DEPTH
 * Habitable rooms (bedroom, office, living, dining) whose longer dimension
 * exceeds 2.5× their shorter dimension will have a permanently dark interior
 * zone beyond the daylighting depth limit (R-021).
 * Rulebook ref: R-021 (Daylighting Depth Rule)
 */
const DAYLIGHT_TYPES = new Set(['bedroom', 'office', 'living', 'living room', 'dining']);

const RB_059: RuleCheck = {
  id: 'RB-059',
  ruleId: 'R-021',
  title: 'Habitable Room Daylighting Depth',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => DAYLIGHT_TYPES.has(r.type) && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout).filter(r => DAYLIGHT_TYPES.has(r.type));
    const violations: Violation[] = [];
    const MAX_RATIO = 2.5;
    for (const r of rooms) {
      const long   = Math.max(r.width, r.height);
      const narrow = Math.min(r.width, r.height);
      if (narrow > 0) {
        const ratio = long / narrow;
        if (ratio > MAX_RATIO) {
          violations.push({
            code: 'RB-059',
            severity: 'warning',
            message: `Room "${roomLabel(r)}" (${r.type}) has a depth-to-width ratio of ${ratio.toFixed(1)}:1 — exceeds the 2.5:1 daylighting depth limit; the interior zone beyond 2.5× the room width will not receive natural light.`,
            roomIds: [r.id],
            value: ratio,
            threshold: MAX_RATIO,
            suggestedFixes: [{
              type: 'resizeRoom',
              roomId: r.id,
              targetW: r.width  >= r.height ? r.width  : Math.ceil(long / MAX_RATIO),
              targetH: r.height >= r.width  ? r.height : Math.ceil(long / MAX_RATIO),
            }],
          });
        }
      }
    }
    return violations;
  },
};

/**
 * RB-060 — BEDROOM_MIN_WIDTH
 * Each bedroom must be ≥ 8 ft in its narrower dimension.
 * 8 ft accommodates a twin bed (38 in) with required 30-in circulation clearances
 * on each side and a 5-ft ADA turning radius (R-013).
 * Rulebook ref: R-013 (ADA Turning Radius at All Activity Nodes)
 */
const RB_060: RuleCheck = {
  id: 'RB-060',
  ruleId: 'R-013',
  title: 'Bedroom Minimum Width',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const bedrooms = rooms.filter(r => r.type === 'bedroom');
    const violations: Violation[] = [];
    const MIN_W = 8 * ctx.ftToUnit; // 8 ft
    for (const b of bedrooms) {
      const narrow = Math.min(b.width, b.height);
      if (narrow < MIN_W) {
        const narrowFt = (narrow / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-060',
          severity: 'warning',
          message: `Bedroom "${roomLabel(b)}" is only ${narrowFt} ft wide — must be ≥ 8 ft to fit a twin bed with required circulation clearances and ADA turning radius (Arch. Graphic Standards; ADA §802).`,
          roomIds: [b.id],
          value: narrow / ctx.ftToUnit,
          threshold: 8,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: b.id,
            targetW: b.width  < b.height ? MIN_W : b.width,
            targetH: b.height < b.width  ? MIN_W : b.height,
          }],
        });
      }
    }
    return violations;
  },
};

// ── Next 10 checks (RB-061..RB-070) ──────────────────────────────────────────

/**
 * RB-061 — LIVING_ROOM_MIN_WIDTH
 * The living room must be ≥ 12 ft in its narrower dimension.
 * 12 ft is the minimum to seat a sofa (84–96 in), opposite chairs, and a coffee
 * table while maintaining 36-in circulation clearances on each side.
 * Rulebook ref: R-016 (Living Space Minimum Width Requirement)
 */
const RB_061: RuleCheck = {
  id: 'RB-061',
  ruleId: 'R-016',
  title: 'Living Room Minimum Width',
  severity: 'warning',
  applies: layout => layout.rooms.some(r =>
    (r.type === 'living' || r.type === 'living room') && r.width > 0 && r.height > 0
  ),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const living = rooms.filter(r => r.type === 'living' || r.type === 'living room');
    const violations: Violation[] = [];
    const MIN_W = 12 * ctx.ftToUnit; // 12 ft
    for (const r of living) {
      const narrow = Math.min(r.width, r.height);
      if (narrow < MIN_W) {
        const narrowFt = (narrow / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-061',
          severity: 'warning',
          message: `Living room "${roomLabel(r)}" is only ${narrowFt} ft wide — must be ≥ 12 ft for furniture layout with required circulation clearances.`,
          roomIds: [r.id],
          value: narrow / ctx.ftToUnit,
          threshold: 12,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: r.id,
            targetW: r.width  < r.height ? MIN_W : r.width,
            targetH: r.height < r.width  ? MIN_W : r.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-062 — DINING_ROOM_MIN_WIDTH
 * The dining room must be ≥ 9 ft in its narrower dimension.
 * 9 ft accommodates a 4-person rectangular table (36 × 72 in) plus 36-in
 * pull-out clearance on each long side (Arch. Graphic Standards, Table Spacing).
 * Rulebook ref: R-017 (Dining Space Minimum Width Requirement)
 */
const RB_062: RuleCheck = {
  id: 'RB-062',
  ruleId: 'R-017',
  title: 'Dining Room Minimum Width',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'dining' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const dining = rooms.filter(r => r.type === 'dining');
    const violations: Violation[] = [];
    const MIN_W = 9 * ctx.ftToUnit; // 9 ft
    for (const r of dining) {
      const narrow = Math.min(r.width, r.height);
      if (narrow < MIN_W) {
        const narrowFt = (narrow / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-062',
          severity: 'warning',
          message: `Dining room "${roomLabel(r)}" is only ${narrowFt} ft wide — must be ≥ 9 ft to fit a 4-person table with pull-out clearances (Arch. Graphic Standards).`,
          roomIds: [r.id],
          value: narrow / ctx.ftToUnit,
          threshold: 9,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: r.id,
            targetW: r.width  < r.height ? MIN_W : r.width,
            targetH: r.height < r.width  ? MIN_W : r.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-063 — KITCHEN_MAX_ASPECT_RATIO
 * Kitchen aspect ratio must be ≤ 3:1.
 * Highly elongated kitchens violate the work-triangle geometry (sink–range–
 * refrigerator ≤ 26 ft total; each leg ≥ 4 ft and ≤ 9 ft) per NKBA guidelines.
 * Rulebook ref: R-015 (Kitchen Work-Triangle Geometry)
 */
const RB_063: RuleCheck = {
  id: 'RB-063',
  ruleId: 'R-015',
  title: 'Kitchen Maximum Aspect Ratio',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'kitchen' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const kitchens = rooms.filter(r => r.type === 'kitchen');
    const violations: Violation[] = [];
    const MAX_RATIO = 3;
    for (const k of kitchens) {
      const longer  = Math.max(k.width, k.height);
      const shorter = Math.min(k.width, k.height);
      if (shorter === 0) continue;
      const ratio = longer / shorter;
      if (ratio > MAX_RATIO) {
        violations.push({
          code: 'RB-063',
          severity: 'warning',
          message: `Kitchen "${roomLabel(k)}" has aspect ratio ${ratio.toFixed(1)}:1 — must be ≤ ${MAX_RATIO}:1 to support a valid work triangle (NKBA guidelines).`,
          roomIds: [k.id],
          value: ratio,
          threshold: MAX_RATIO,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: k.id,
            targetW: k.width  > k.height ? k.height * MAX_RATIO : k.width,
            targetH: k.height > k.width  ? k.width  * MAX_RATIO : k.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-064 — PRIMARY_BEDROOM_ADJACENT_BATHROOM
 * At least one bedroom must be directly adjacent to a bathroom (master-suite
 * requirement). Isolated bedrooms with no private or close-proximity bath path
 * are a significant habitability deficiency.
 * Rulebook ref: R-019 (Master Suite Adjacency Requirement)
 */
const RB_064: RuleCheck = {
  id: 'RB-064',
  ruleId: 'R-019',
  title: 'Primary Bedroom Adjacent Bathroom',
  severity: 'warning',
  applies: layout =>
    layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'bathroom' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const bedrooms = rooms.filter(r => r.type === 'bedroom');
    const bathrooms = rooms.filter(r => r.type === 'bathroom');
    const anyAdj = bedrooms.some(bed =>
      bathrooms.some(bath => roomsAreAdjacent(bed, bath))
    );
    if (!anyAdj) {
      return [{
        code: 'RB-064',
        severity: 'warning',
        message: 'No bedroom is adjacent to a bathroom — at least one bedroom should have direct bathroom access (master-suite requirement).',
        roomIds: [...bedrooms.map(r => r.id), ...bathrooms.map(r => r.id)],
        suggestedFixes: bedrooms.slice(0, 1).map(bed => ({
          type: 'moveRoom' as const,
          roomId: bathrooms[0]?.id ?? bed.id,
          dx: bed.x + bed.width - (bathrooms[0]?.x ?? 0),
          dy: 0,
        })),
      }];
    }
    return [];
  },
};

/**
 * RB-065 — OFFICE_MIN_WIDTH
 * Home offices must be ≥ 8 ft in their narrower dimension.
 * 8 ft accommodates a standard desk (60–72 in) plus 36-in chair pull-out and
 * passage clearance (Arch. Graphic Standards — Office Layouts).
 * Rulebook ref: R-027 (Home Office Minimum Dimension)
 */
const RB_065: RuleCheck = {
  id: 'RB-065',
  ruleId: 'R-027',
  title: 'Office Minimum Width',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'office' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const offices = rooms.filter(r => r.type === 'office');
    const violations: Violation[] = [];
    const MIN_W = 8 * ctx.ftToUnit; // 8 ft
    for (const o of offices) {
      const narrow = Math.min(o.width, o.height);
      if (narrow < MIN_W) {
        const narrowFt = (narrow / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-065',
          severity: 'warning',
          message: `Office "${roomLabel(o)}" is only ${narrowFt} ft wide — must be ≥ 8 ft to fit a desk with required chair pull-out and circulation clearance (Arch. Graphic Standards).`,
          roomIds: [o.id],
          value: narrow / ctx.ftToUnit,
          threshold: 8,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: o.id,
            targetW: o.width  < o.height ? MIN_W : o.width,
            targetH: o.height < o.width  ? MIN_W : o.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-066 — HALL_MIN_WIDTH
 * Every hall/corridor must be ≥ 3 ft (36 in) in its narrower dimension.
 * IRC R311.6 and ADA §402 both mandate 36-in minimum clear width for accessible
 * passage. Hallways narrower than 3 ft are non-code-compliant.
 * Rulebook ref: R-028 (Corridor Minimum Width — IRC R311.6 / ADA §402)
 */
const RB_066: RuleCheck = {
  id: 'RB-066',
  ruleId: 'R-028',
  title: 'Hall Minimum Width',
  severity: 'error',
  applies: layout => layout.rooms.some(r => r.type === 'hall' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const halls = rooms.filter(r => r.type === 'hall');
    const violations: Violation[] = [];
    const MIN_W = 3 * ctx.ftToUnit; // 3 ft (IRC / ADA minimum)
    for (const h of halls) {
      const narrow = Math.min(h.width, h.height);
      if (narrow < MIN_W) {
        const narrowFt = (narrow / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-066',
          severity: 'error',
          message: `Hall "${roomLabel(h)}" is only ${narrowFt} ft wide — must be ≥ 3 ft (IRC R311.6 / ADA §402 minimum clear corridor width).`,
          roomIds: [h.id],
          value: narrow / ctx.ftToUnit,
          threshold: 3,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: h.id,
            targetW: h.width  < h.height ? MIN_W : h.width,
            targetH: h.height < h.width  ? MIN_W : h.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-067 — LAUNDRY_MIN_AREA
 * Laundry rooms must have ≥ 30 sq ft of area.
 * 30 sq ft is the minimum to fit a side-by-side washer+dryer (each 27 in wide ×
 * 30 in deep) with 42-in front service clearance (HUD MPS; Arch. Graphic
 * Standards — Laundry).
 * Rulebook ref: R-029 (Laundry Room Minimum Area)
 */
const RB_067: RuleCheck = {
  id: 'RB-067',
  ruleId: 'R-029',
  title: 'Laundry Minimum Area',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'laundry' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const laundries = rooms.filter(r => r.type === 'laundry');
    const violations: Violation[] = [];
    const factor = ctx.ftToUnit * ctx.ftToUnit;
    const MIN_AREA = 30; // sq ft
    for (const l of laundries) {
      const areaSqFt = roomArea(l) / factor;
      if (areaSqFt < MIN_AREA) {
        violations.push({
          code: 'RB-067',
          severity: 'warning',
          message: `Laundry room "${roomLabel(l)}" is only ${areaSqFt.toFixed(0)} sq ft — must be ≥ ${MIN_AREA} sq ft to fit washer, dryer, and required service clearances (HUD MPS).`,
          roomIds: [l.id],
          value: areaSqFt,
          threshold: MIN_AREA,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: l.id,
            scaleX: Math.sqrt(MIN_AREA / areaSqFt) + 0.05,
            scaleY: Math.sqrt(MIN_AREA / areaSqFt) + 0.05,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-068 — CLOSET_MIN_AREA
 * Closets must have ≥ 6 sq ft of floor area.
 * 6 sq ft (e.g., 2 ft deep × 3 ft wide) is the minimum single-rod closet size
 * per Architectural Graphic Standards. Below this, a closet cannot accommodate
 * standard hangers (22-in rod depth + 2-in clearance).
 * Rulebook ref: R-030 (Closet Minimum Area)
 */
const RB_068: RuleCheck = {
  id: 'RB-068',
  ruleId: 'R-030',
  title: 'Closet Minimum Area',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'closet' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const closets = rooms.filter(r => r.type === 'closet');
    const violations: Violation[] = [];
    const factor = ctx.ftToUnit * ctx.ftToUnit;
    const MIN_AREA = 6; // sq ft
    for (const c of closets) {
      const areaSqFt = roomArea(c) / factor;
      if (areaSqFt < MIN_AREA) {
        violations.push({
          code: 'RB-068',
          severity: 'warning',
          message: `Closet "${roomLabel(c)}" is only ${areaSqFt.toFixed(1)} sq ft — must be ≥ ${MIN_AREA} sq ft to fit standard hangers with required rod depth (Arch. Graphic Standards).`,
          roomIds: [c.id],
          value: areaSqFt,
          threshold: MIN_AREA,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: c.id,
            scaleX: Math.sqrt(MIN_AREA / areaSqFt) + 0.05,
            scaleY: Math.sqrt(MIN_AREA / areaSqFt) + 0.05,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-069 — GARAGE_MIN_WIDTH
 * Each garage must be ≥ 10 ft in its narrower dimension.
 * 10 ft is the minimum single-car stall width per IRC Table R309 (10 ft × 20 ft
 * for compact vehicles; 12 ft recommended). A garage narrower than 10 ft cannot
 * safely open a car door.
 * Rulebook ref: R-023 (Garage Stall Minimum Width)
 */
const RB_069: RuleCheck = {
  id: 'RB-069',
  ruleId: 'R-023',
  title: 'Garage Minimum Width',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'garage' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const garages = rooms.filter(r => r.type === 'garage');
    const violations: Violation[] = [];
    const MIN_W = 10 * ctx.ftToUnit; // 10 ft (IRC R309)
    for (const g of garages) {
      const narrow = Math.min(g.width, g.height);
      if (narrow < MIN_W) {
        const narrowFt = (narrow / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-069',
          severity: 'warning',
          message: `Garage "${roomLabel(g)}" is only ${narrowFt} ft wide — must be ≥ 10 ft (IRC R309 single-car minimum stall width).`,
          roomIds: [g.id],
          value: narrow / ctx.ftToUnit,
          threshold: 10,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: g.id,
            targetW: g.width  < g.height ? MIN_W : g.width,
            targetH: g.height < g.width  ? MIN_W : g.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-070 — MAX_SINGLE_ROOM_DOMINANCE
 * No single room may occupy more than 50% of the total plan area.
 * Plans where one room exceeds half the floor area are structurally and
 * programmatically degenerate — they cannot provide the spatial variety required
 * for residential habitability (Architectural Graphic Standards — Space Planning).
 * Rulebook ref: R-034 (Maximum Single-Room Area Dominance)
 */
const RB_070: RuleCheck = {
  id: 'RB-070',
  ruleId: 'R-034',
  title: 'Max Single Room Area Dominance',
  severity: 'warning',
  applies: layout => layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 2,
  check(layout) {
    const rooms = validRooms(layout);
    const totalArea = rooms.reduce((s, r) => s + roomArea(r), 0);
    if (totalArea === 0) return [];
    const MAX_RATIO = 0.5;
    const violations: Violation[] = [];
    for (const r of rooms) {
      const ratio = roomArea(r) / totalArea;
      if (ratio > MAX_RATIO) {
        violations.push({
          code: 'RB-070',
          severity: 'warning',
          message: `Room "${roomLabel(r)}" occupies ${(ratio * 100).toFixed(1)}% of total plan area — no single room should exceed ${MAX_RATIO * 100}% (programmatically degenerate plan).`,
          roomIds: [r.id],
          value: ratio,
          threshold: MAX_RATIO,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: r.id,
            scaleX: Math.sqrt(MAX_RATIO / ratio) - 0.05,
            scaleY: Math.sqrt(MAX_RATIO / ratio) - 0.05,
          }],
        });
      }
    }
    return violations;
  },
};

// ── Next 10 checks (RB-071..RB-080) ──────────────────────────────────────────

/**
 * RB-071 — ENTRY_MIN_AREA
 * Entry/foyer must have ≥ 20 sq ft of floor area.
 * A functional entry requires space to open the door, stand, remove outerwear,
 * and allow two people to pass — Architectural Graphic Standards minimum is
 * 20 sq ft (e.g., 4 × 5 ft). Smaller entries create bottlenecks and cannot
 * accommodate accessible turning approach to the door (ADA §404.2).
 * Rulebook ref: R-032 (Entry Sequence Primacy)
 */
const RB_071: RuleCheck = {
  id: 'RB-071',
  ruleId: 'R-032',
  title: 'Entry Minimum Area',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'entry' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const entries = rooms.filter(r => r.type === 'entry');
    const violations: Violation[] = [];
    const factor   = ctx.ftToUnit * ctx.ftToUnit;
    const MIN_AREA = 20; // sq ft
    for (const e of entries) {
      const areaSqFt = roomArea(e) / factor;
      if (areaSqFt < MIN_AREA) {
        violations.push({
          code: 'RB-071',
          severity: 'warning',
          message: `Entry "${roomLabel(e)}" is only ${areaSqFt.toFixed(0)} sq ft — must be ≥ ${MIN_AREA} sq ft to allow door swing, outerwear removal, and accessible turning approach (Arch. Graphic Standards).`,
          roomIds: [e.id],
          value: areaSqFt,
          threshold: MIN_AREA,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: e.id,
            scaleX: Math.sqrt(MIN_AREA / areaSqFt) + 0.05,
            scaleY: Math.sqrt(MIN_AREA / areaSqFt) + 0.05,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-072 — BATHROOM_ASPECT_RATIO
 * Each bathroom must have an aspect ratio ≤ 3:1.
 * Highly elongated bathrooms cannot simultaneously place a toilet, lavatory,
 * and tub/shower with required clearances while also maintaining a 5-ft ADA
 * turning diameter (R-013). A 3:1 limit is the practical fixture-layout
 * boundary per Architectural Graphic Standards — Bathroom Fixture Clearances.
 * Rulebook ref: R-013 (ADA Turning Radius at All Activity Nodes)
 */
const RB_072: RuleCheck = {
  id: 'RB-072',
  ruleId: 'R-013',
  title: 'Bathroom Aspect Ratio',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'bathroom' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const baths = rooms.filter(r => r.type === 'bathroom');
    const violations: Violation[] = [];
    const MAX_RATIO = 3;
    for (const b of baths) {
      const longer  = Math.max(b.width, b.height);
      const shorter = Math.min(b.width, b.height);
      if (shorter === 0) continue;
      const ratio = longer / shorter;
      if (ratio > MAX_RATIO) {
        violations.push({
          code: 'RB-072',
          severity: 'warning',
          message: `Bathroom "${roomLabel(b)}" has aspect ratio ${ratio.toFixed(1)}:1 — must be ≤ ${MAX_RATIO}:1 to fit fixtures with required clearances and ADA turning radius.`,
          roomIds: [b.id],
          value: ratio,
          threshold: MAX_RATIO,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: b.id,
            targetW: b.width  > b.height ? b.height * MAX_RATIO : b.width,
            targetH: b.height > b.width  ? b.width  * MAX_RATIO : b.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-073 — KITCHEN_MIN_DEPTH
 * Kitchen longer dimension must be ≥ 8 ft.
 * The NKBA work-triangle requires at least one counter run of ≥ 8 ft to
 * accommodate sink, range, and refrigerator with required clearances between
 * them. A kitchen that is narrow in both dimensions cannot fit any valid
 * work-triangle configuration (RB-056 checks width; this checks depth).
 * Rulebook ref: R-082 (Workstation Ergonomic Work-Triangle Optimization)
 */
const RB_073: RuleCheck = {
  id: 'RB-073',
  ruleId: 'R-082',
  title: 'Kitchen Minimum Depth',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'kitchen' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const kitchens = rooms.filter(r => r.type === 'kitchen');
    const violations: Violation[] = [];
    const MIN_D = 8 * ctx.ftToUnit; // 8 ft
    for (const k of kitchens) {
      const longer = Math.max(k.width, k.height);
      if (longer < MIN_D) {
        const longerFt = (longer / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-073',
          severity: 'warning',
          message: `Kitchen "${roomLabel(k)}" is only ${longerFt} ft in its longer dimension — must be ≥ 8 ft to accommodate a valid NKBA work-triangle counter run.`,
          roomIds: [k.id],
          value: longer / ctx.ftToUnit,
          threshold: 8,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: k.id,
            targetW: k.width  > k.height ? MIN_D : k.width,
            targetH: k.height > k.width  ? MIN_D : k.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-074 — LIVING_ROOM_ASPECT_RATIO
 * Living room aspect ratio must be ≤ 2.5:1.
 * A living room wider than 2.5× its shorter dimension cannot support a
 * functional furniture layout — the sofa group cannot face a focal point
 * without one cluster being in a dead zone. R-062 (Spatial Coherence
 * Requirement) mandates an organizing principle legible to occupants;
 * extreme elongation violates this principle.
 * Rulebook ref: R-062 (Spatial Coherence Requirement)
 */
const RB_074: RuleCheck = {
  id: 'RB-074',
  ruleId: 'R-062',
  title: 'Living Room Aspect Ratio',
  severity: 'warning',
  applies: layout => layout.rooms.some(r =>
    (r.type === 'living' || r.type === 'living room') && r.width > 0 && r.height > 0
  ),
  check(layout) {
    const rooms = validRooms(layout);
    const living = rooms.filter(r => r.type === 'living' || r.type === 'living room');
    const violations: Violation[] = [];
    const MAX_RATIO = 2.5;
    for (const l of living) {
      const longer  = Math.max(l.width, l.height);
      const shorter = Math.min(l.width, l.height);
      if (shorter === 0) continue;
      const ratio = longer / shorter;
      if (ratio > MAX_RATIO) {
        violations.push({
          code: 'RB-074',
          severity: 'warning',
          message: `Living room "${roomLabel(l)}" has aspect ratio ${ratio.toFixed(1)}:1 — must be ≤ ${MAX_RATIO}:1 to support a functional seating group around a focal point (Spatial Coherence).`,
          roomIds: [l.id],
          value: ratio,
          threshold: MAX_RATIO,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: l.id,
            targetW: l.width  > l.height ? l.height * MAX_RATIO : l.width,
            targetH: l.height > l.width  ? l.width  * MAX_RATIO : l.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-075 — GARAGE_MIN_DEPTH
 * Each garage must be ≥ 18 ft in its longer dimension.
 * A standard passenger vehicle is 14–17 ft long; 18 ft provides the minimum
 * clear depth with 6 in buffer at each end per IRC Table R309 (20 ft
 * recommended for mid-size vehicles). A garage shorter than 18 ft cannot
 * fully contain a vehicle with the door closed.
 * Rulebook ref: R-023 (Garage Stall Minimum — IRC R309)
 */
const RB_075: RuleCheck = {
  id: 'RB-075',
  ruleId: 'R-023',
  title: 'Garage Minimum Depth',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'garage' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const garages = rooms.filter(r => r.type === 'garage');
    const violations: Violation[] = [];
    const MIN_D = 18 * ctx.ftToUnit; // 18 ft
    for (const g of garages) {
      const longer = Math.max(g.width, g.height);
      if (longer < MIN_D) {
        const longerFt = (longer / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-075',
          severity: 'warning',
          message: `Garage "${roomLabel(g)}" is only ${longerFt} ft deep — must be ≥ 18 ft to contain a standard vehicle with door clearance (IRC R309).`,
          roomIds: [g.id],
          value: longer / ctx.ftToUnit,
          threshold: 18,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: g.id,
            targetW: g.width  > g.height ? MIN_D : g.width,
            targetH: g.height > g.width  ? MIN_D : g.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-076 — STAIR_MIN_AREA
 * Stair rooms must have ≥ 40 sq ft of floor area.
 * A functional residential stair requires a minimum run of 36-in clear width
 * (IRC R311.7.1) × a flight depth of ≥ 9 ft (approx. 9 risers at 7 in each,
 * 9 treads at 10 in each = 90 in). With framing, 40 sq ft is the minimum
 * enclosure to contain a straight-run stair. Below this, the stair cannot
 * meet rise/run geometry or landing requirements.
 * Rulebook ref: R-014 (Stair Geometry Compliance)
 */
const RB_076: RuleCheck = {
  id: 'RB-076',
  ruleId: 'R-014',
  title: 'Stair Minimum Area',
  severity: 'error',
  applies: layout => layout.rooms.some(r => r.type === 'stair' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const stairs = rooms.filter(r => r.type === 'stair');
    const violations: Violation[] = [];
    const factor   = ctx.ftToUnit * ctx.ftToUnit;
    const MIN_AREA = 40; // sq ft
    for (const s of stairs) {
      const areaSqFt = roomArea(s) / factor;
      if (areaSqFt < MIN_AREA) {
        violations.push({
          code: 'RB-076',
          severity: 'error',
          message: `Stair "${roomLabel(s)}" is only ${areaSqFt.toFixed(0)} sq ft — must be ≥ ${MIN_AREA} sq ft to contain a code-compliant straight-run stair with required landings (IRC R311.7).`,
          roomIds: [s.id],
          value: areaSqFt,
          threshold: MIN_AREA,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: s.id,
            scaleX: Math.sqrt(MIN_AREA / areaSqFt) + 0.05,
            scaleY: Math.sqrt(MIN_AREA / areaSqFt) + 0.05,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-077 — MAX_BEDROOMS_PER_BATH
 * The ratio of bedrooms to bathrooms must not exceed 4:1.
 * HUD Minimum Property Standards and Architectural Graphic Standards recommend
 * at most 4 occupants per full bathroom. More than 4 bedrooms sharing a single
 * bathroom creates peak-demand conflicts that are a habitability deficiency.
 * Rulebook ref: null (HUD MPS / Architectural Graphic Standards)
 */
const RB_077: RuleCheck = {
  id: 'RB-077',
  ruleId: null,
  title: 'Max Bedrooms Per Bathroom',
  severity: 'warning',
  applies: layout =>
    layout.rooms.some(r => r.type === 'bedroom'  && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'bathroom' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms    = validRooms(layout);
    const bedCount = rooms.filter(r => r.type === 'bedroom').length;
    const batCount = rooms.filter(r => r.type === 'bathroom').length;
    if (batCount === 0) return [];
    const ratio = bedCount / batCount;
    const MAX   = 4;
    if (ratio > MAX) {
      const bedIds = rooms.filter(r => r.type === 'bedroom').map(r => r.id);
      const batIds = rooms.filter(r => r.type === 'bathroom').map(r => r.id);
      return [{
        code: 'RB-077',
        severity: 'warning',
        message: `${bedCount} bedrooms share ${batCount} bathroom${batCount > 1 ? 's' : ''} — ratio ${ratio.toFixed(1)}:1 exceeds the 4:1 maximum (HUD MPS habitability standard). Add at least one more bathroom.`,
        roomIds: [...bedIds, ...batIds],
        value: ratio,
        threshold: MAX,
      }];
    }
    return [];
  },
};

/**
 * RB-078 — OFFICE_ASPECT_RATIO
 * Home offices must have aspect ratio ≤ 2.5:1.
 * An office wider than 2.5× its shorter dimension cannot simultaneously fit a
 * desk against one wall, chair pull-out, and a 5-ft ADA turning circle without
 * the workspace feeling like a corridor. R-046 (Social-Distance Workstation
 * Compliance) requires adequate personal space geometry around each workstation.
 * Rulebook ref: R-046 (Social-Distance Workstation Compliance)
 */
const RB_078: RuleCheck = {
  id: 'RB-078',
  ruleId: 'R-046',
  title: 'Office Aspect Ratio',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'office' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const offices = rooms.filter(r => r.type === 'office');
    const violations: Violation[] = [];
    const MAX_RATIO = 2.5;
    for (const o of offices) {
      const longer  = Math.max(o.width, o.height);
      const shorter = Math.min(o.width, o.height);
      if (shorter === 0) continue;
      const ratio = longer / shorter;
      if (ratio > MAX_RATIO) {
        violations.push({
          code: 'RB-078',
          severity: 'warning',
          message: `Office "${roomLabel(o)}" has aspect ratio ${ratio.toFixed(1)}:1 — must be ≤ ${MAX_RATIO}:1 to support desk placement with chair pull-out and ADA turning clearance (Arch. Graphic Standards).`,
          roomIds: [o.id],
          value: ratio,
          threshold: MAX_RATIO,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: o.id,
            targetW: o.width  > o.height ? o.height * MAX_RATIO : o.width,
            targetH: o.height > o.width  ? o.width  * MAX_RATIO : o.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-079 — ENTRY_ADJACENT_LIVING
 * When both an entry and a living room are present, the entry should be
 * adjacent to the living room. R-032 (Entry Sequence Primacy) requires the
 * arrival sequence to transition directly into the primary social zone. An
 * entry that bypasses the living room forces occupants and guests through
 * private zones before reaching the public area — a common habitability
 * complaint in residential design.
 * Rulebook ref: R-032 (Entry Sequence Primacy)
 */
const RB_079: RuleCheck = {
  id: 'RB-079',
  ruleId: 'R-032',
  title: 'Entry Adjacent to Living Room',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'entry' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => (r.type === 'living' || r.type === 'living room') && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms   = validRooms(layout);
    const entries = rooms.filter(r => r.type === 'entry');
    const living  = rooms.filter(r => r.type === 'living' || r.type === 'living room');
    const violations: Violation[] = [];
    for (const e of entries) {
      const adjToLiving = living.some(l => roomsAreAdjacent(e, l));
      if (!adjToLiving) {
        violations.push({
          code: 'RB-079',
          severity: 'info',
          message: `Entry "${roomLabel(e)}" is not adjacent to the living room — the arrival sequence should lead directly into the primary social zone (Entry Sequence Primacy).`,
          roomIds: [e.id, ...living.map(l => l.id)],
          suggestedFixes: living.length > 0
            ? [{ type: 'moveRoom' as const, roomId: e.id, dx: living[0].x - e.x, dy: living[0].y + living[0].height - e.y }]
            : [],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-080 — DINING_MIN_DEPTH
 * The dining room must be ≥ 10 ft in its longer dimension.
 * A 4-person rectangular table (36 × 72 in = 3 × 6 ft) plus 36-in chair
 * pull-out on each long side requires 6 + 3 + 3 = 12 ft minimum along the
 * table length, but 10 ft is the hard minimum for a round or square table
 * with two-sided clearance (Architectural Graphic Standards — Dining Room
 * Sizing; R-049 Collaborative Seating Orientation).
 * Rulebook ref: R-049 (Collaborative Seating Orientation)
 */
const RB_080: RuleCheck = {
  id: 'RB-080',
  ruleId: 'R-049',
  title: 'Dining Room Minimum Depth',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'dining' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const dinings = rooms.filter(r => r.type === 'dining');
    const violations: Violation[] = [];
    const MIN_D = 10 * ctx.ftToUnit; // 10 ft
    for (const d of dinings) {
      const longer = Math.max(d.width, d.height);
      if (longer < MIN_D) {
        const longerFt = (longer / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-080',
          severity: 'warning',
          message: `Dining room "${roomLabel(d)}" is only ${longerFt} ft in its longer dimension — must be ≥ 10 ft to fit a table with seating and required pull-out clearances on both sides (Arch. Graphic Standards).`,
          roomIds: [d.id],
          value: longer / ctx.ftToUnit,
          threshold: 10,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: d.id,
            targetW: d.width  > d.height ? MIN_D : d.width,
            targetH: d.height > d.width  ? MIN_D : d.height,
          }],
        });
      }
    }
    return violations;
  },
};

// ── RB-081..RB-090 ────────────────────────────────────────────────────────────

/**
 * RB-081 — BEDROOM_ASPECT_RATIO
 * Each bedroom must have aspect ratio ≤ 2:1.
 * A bedroom longer than 2× its width cannot fit a standard bed (queen 5×7 ft
 * or king 6×7 ft) perpendicular to both walls while maintaining the required
 * 36-in circulation path around the bed. The existing RB-003 only flags extreme
 * cases (> 5:1); RB-081 enforces the functional furniture-placement threshold.
 * Rulebook ref: R-062 (Spatial Coherence Requirement)
 */
const RB_081: RuleCheck = {
  id: 'RB-081',
  ruleId: 'R-062',
  title: 'Bedroom Aspect Ratio',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const beds = rooms.filter(r => r.type === 'bedroom');
    const violations: Violation[] = [];
    const MAX_RATIO = 2;
    for (const b of beds) {
      const longer  = Math.max(b.width, b.height);
      const shorter = Math.min(b.width, b.height);
      if (shorter === 0) continue;
      const ratio = longer / shorter;
      if (ratio > MAX_RATIO) {
        violations.push({
          code: 'RB-081',
          severity: 'warning',
          message: `Bedroom "${roomLabel(b)}" has aspect ratio ${ratio.toFixed(1)}:1 — must be ≤ ${MAX_RATIO}:1 to allow bed placement and required clearance on both sides (Spatial Coherence).`,
          roomIds: [b.id],
          value: ratio,
          threshold: MAX_RATIO,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: b.id,
            targetW: b.width  > b.height ? b.height * MAX_RATIO : b.width,
            targetH: b.height > b.width  ? b.width  * MAX_RATIO : b.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-082 — STAIR_MIN_WIDTH
 * Each stair room must have its shorter dimension ≥ 3 ft (36 in).
 * IRC R311.7.1 mandates a minimum 36-in clear stair width. A stair narrower
 * than 3 ft cannot legally serve as a means of egress for any residential
 * occupancy and cannot accommodate furniture moving or emergency responders.
 * Distinct from RB-076 (minimum area) and RB-053 (rise/run geometry).
 * Rulebook ref: R-014 (Stair Geometry Compliance)
 */
const RB_082: RuleCheck = {
  id: 'RB-082',
  ruleId: 'R-014',
  title: 'Stair Minimum Width',
  severity: 'error',
  applies: layout => layout.rooms.some(r => r.type === 'stair' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const stairs = rooms.filter(r => r.type === 'stair');
    const violations: Violation[] = [];
    const MIN_W = 3 * ctx.ftToUnit; // 3 ft — IRC R311.7.1
    for (const s of stairs) {
      const narrow = Math.min(s.width, s.height);
      if (narrow < MIN_W) {
        const narrowFt = (narrow / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-082',
          severity: 'error',
          message: `Stair "${roomLabel(s)}" is only ${narrowFt} ft wide — must be ≥ 3 ft to provide the minimum clear width for egress compliance (IRC R311.7.1).`,
          roomIds: [s.id],
          value: narrow / ctx.ftToUnit,
          threshold: 3,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: s.id,
            targetW: s.width  < s.height ? MIN_W : s.width,
            targetH: s.height < s.width  ? MIN_W : s.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-083 — DINING_ROOM_ASPECT_RATIO
 * Dining rooms must have aspect ratio ≤ 2.5:1.
 * A dining room more elongated than 2.5:1 cannot accommodate a rectangular
 * table with seating on all four sides and the required 36-in chair pull-out
 * clearance simultaneously. Beyond 2.5:1 the table must be placed diagonally
 * or omit end seating — both are habitability deficiencies (R-049 Collaborative
 * Seating Orientation). Distinct from RB-080 (min depth) and RB-062 (min width).
 * Rulebook ref: R-049 (Collaborative Seating Orientation)
 */
const RB_083: RuleCheck = {
  id: 'RB-083',
  ruleId: 'R-049',
  title: 'Dining Room Aspect Ratio',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'dining' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const dinings = rooms.filter(r => r.type === 'dining');
    const violations: Violation[] = [];
    const MAX_RATIO = 2.5;
    for (const d of dinings) {
      const longer  = Math.max(d.width, d.height);
      const shorter = Math.min(d.width, d.height);
      if (shorter === 0) continue;
      const ratio = longer / shorter;
      if (ratio > MAX_RATIO) {
        violations.push({
          code: 'RB-083',
          severity: 'warning',
          message: `Dining room "${roomLabel(d)}" has aspect ratio ${ratio.toFixed(1)}:1 — must be ≤ ${MAX_RATIO}:1 to seat all sides of a rectangular table with required pull-out clearances (Collaborative Seating Orientation).`,
          roomIds: [d.id],
          value: ratio,
          threshold: MAX_RATIO,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: d.id,
            targetW: d.width  > d.height ? d.height * MAX_RATIO : d.width,
            targetH: d.height > d.width  ? d.width  * MAX_RATIO : d.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-084 — PLAN_ASPECT_RATIO
 * The overall floor plan bounding box (dimensions.width × dimensions.depth)
 * must have an aspect ratio ≤ 3:1.
 * Extremely elongated plans create a perimeter-to-area ratio that inflates
 * envelope cost (walls, roof line length), forces a single-loaded corridor
 * configuration with poor natural-light penetration on interior rooms, and
 * produces wayfinding confusion because the layout lacks a legible second axis
 * (Lynch Legibility — R-004). 3:1 is the practical upper bound for cost-effective
 * residential construction.
 * Rulebook ref: null (architectural proportion convention / Lynch R-004)
 */
const RB_084: RuleCheck = {
  id: 'RB-084',
  ruleId: null,
  title: 'Plan Aspect Ratio',
  severity: 'warning',
  check(layout) {
    const { width, depth } = layout.dimensions;
    if (width <= 0 || depth <= 0) return [];
    const longer  = Math.max(width, depth);
    const shorter = Math.min(width, depth);
    const ratio = longer / shorter;
    const MAX_RATIO = 3;
    if (ratio > MAX_RATIO) {
      return [{
        code: 'RB-084',
        severity: 'warning',
        message: `Floor plan aspect ratio is ${ratio.toFixed(1)}:1 (${width} × ${depth}) — must be ≤ ${MAX_RATIO}:1 to avoid excessive perimeter-to-area ratio and poor wayfinding legibility.`,
        roomIds: [],
        value: ratio,
        threshold: MAX_RATIO,
      }];
    }
    return [];
  },
};

/**
 * RB-085 — LAUNDRY_MIN_WIDTH
 * Laundry rooms must be ≥ 5 ft in their shorter dimension.
 * A standard side-by-side washer + dryer configuration requires at minimum
 * 5 ft of clear interior width (each unit ≈ 2 ft wide × 2.5 ft deep, total
 * width 4 ft + framing tolerance). Narrower laundry rooms force front-loader
 * stacking only, which requires additional structural support and limits
 * accessibility. 5 ft also provides the minimum 18-in front clear access
 * per HUD MPS laundry guidelines. Distinct from RB-067 (minimum area).
 * Rulebook ref: null (HUD MPS / Architectural Graphic Standards)
 */
const RB_085: RuleCheck = {
  id: 'RB-085',
  ruleId: null,
  title: 'Laundry Minimum Width',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'laundry' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const laundries = rooms.filter(r => r.type === 'laundry');
    const violations: Violation[] = [];
    const MIN_W = 5 * ctx.ftToUnit; // 5 ft
    for (const l of laundries) {
      const narrow = Math.min(l.width, l.height);
      if (narrow < MIN_W) {
        const narrowFt = (narrow / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-085',
          severity: 'warning',
          message: `Laundry room "${roomLabel(l)}" is only ${narrowFt} ft wide — must be ≥ 5 ft to accommodate side-by-side washer and dryer with required front clearance (HUD MPS).`,
          roomIds: [l.id],
          value: narrow / ctx.ftToUnit,
          threshold: 5,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: l.id,
            targetW: l.width  < l.height ? MIN_W : l.width,
            targetH: l.height < l.width  ? MIN_W : l.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-086 — OFFICE_MIN_DEPTH
 * Home offices must be ≥ 9 ft in their longer dimension.
 * A desk run (standard desk 5 ft) + ADA turning radius (5 ft diameter = 2.5 ft
 * radius behind the chair) requires at least 5 + 2.5 + 1.5 (wall buffer) ≈ 9 ft
 * effective minimum depth. Below 9 ft, a workstation cannot simultaneously
 * provide a desk surface, chair clearance, and a 3-ft exit path behind the
 * chair (R-046 Social-Distance Workstation Compliance). Distinct from RB-065
 * (min width) and RB-052 (min area).
 * Rulebook ref: R-046 (Social-Distance Workstation Compliance)
 */
const RB_086: RuleCheck = {
  id: 'RB-086',
  ruleId: 'R-046',
  title: 'Office Minimum Depth',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'office' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const offices = rooms.filter(r => r.type === 'office');
    const violations: Violation[] = [];
    const MIN_D = 9 * ctx.ftToUnit; // 9 ft
    for (const o of offices) {
      const longer = Math.max(o.width, o.height);
      if (longer < MIN_D) {
        const longerFt = (longer / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-086',
          severity: 'warning',
          message: `Office "${roomLabel(o)}" is only ${longerFt} ft in its longer dimension — must be ≥ 9 ft to fit desk + chair pull-out + exit clearance (Social-Distance Workstation Compliance).`,
          roomIds: [o.id],
          value: longer / ctx.ftToUnit,
          threshold: 9,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: o.id,
            targetW: o.width  > o.height ? MIN_D : o.width,
            targetH: o.height > o.width  ? MIN_D : o.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-087 — ENTRY_MIN_WIDTH
 * Entry rooms must be ≥ 4 ft in their shorter dimension.
 * ADA §402.3 requires 36-in minimum clear passage; 4 ft provides comfortable
 * two-person pass, furniture-moving clearance, and stroller/wheelchair
 * accessibility. An entry narrower than 4 ft fails this threshold and creates
 * a bottleneck at the primary transition from exterior to interior (R-032 Entry
 * Sequence Primacy). Distinct from RB-071 (minimum entry area).
 * Rulebook ref: R-013 (ADA Turning Radius at All Activity Nodes)
 */
const RB_087: RuleCheck = {
  id: 'RB-087',
  ruleId: 'R-013',
  title: 'Entry Minimum Width',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'entry' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const entries = rooms.filter(r => r.type === 'entry');
    const violations: Violation[] = [];
    const MIN_W = 4 * ctx.ftToUnit; // 4 ft
    for (const e of entries) {
      const narrow = Math.min(e.width, e.height);
      if (narrow < MIN_W) {
        const narrowFt = (narrow / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-087',
          severity: 'warning',
          message: `Entry "${roomLabel(e)}" is only ${narrowFt} ft wide — must be ≥ 4 ft for two-person passing clearance and accessible passage at the entry threshold (ADA §402.3).`,
          roomIds: [e.id],
          value: narrow / ctx.ftToUnit,
          threshold: 4,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: e.id,
            targetW: e.width  < e.height ? MIN_W : e.width,
            targetH: e.height < e.width  ? MIN_W : e.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-088 — CLOSET_MIN_DEPTH
 * Each closet must have its shorter dimension ≥ 2 ft (24 in).
 * Standard clothes hangers require a 22-in hanger rod depth; 24 in (2 ft)
 * provides the minimum clear depth to hang garments without compression against
 * the back wall. A closet shallower than 2 ft cannot function as a hanging
 * closet and reduces to a shallow shelf niche. Distinct from RB-068 (min area).
 * Rulebook ref: null (Architectural Graphic Standards — Closet Dimensions)
 */
const RB_088: RuleCheck = {
  id: 'RB-088',
  ruleId: null,
  title: 'Closet Minimum Depth',
  severity: 'error',
  applies: layout => layout.rooms.some(r => r.type === 'closet' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const closets = rooms.filter(r => r.type === 'closet');
    const violations: Violation[] = [];
    const MIN_D = 2 * ctx.ftToUnit; // 2 ft (24 in)
    for (const c of closets) {
      const narrow = Math.min(c.width, c.height);
      if (narrow < MIN_D) {
        const narrowFt = (narrow / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-088',
          severity: 'error',
          message: `Closet "${roomLabel(c)}" is only ${narrowFt} ft deep — must be ≥ 2 ft (24 in) to accommodate standard clothes hangers (Arch. Graphic Standards — Closet Dimensions).`,
          roomIds: [c.id],
          value: narrow / ctx.ftToUnit,
          threshold: 2,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: c.id,
            targetW: c.width  < c.height ? MIN_D : c.width,
            targetH: c.height < c.width  ? MIN_D : c.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-089 — GARAGE_INTERNAL_ACCESS
 * A garage must be adjacent to at least one interior room (entry, hall,
 * laundry, or kitchen) to provide a direct internal door connection.
 * IRC R309.1 requires a solid-wood or steel door from the garage to the
 * dwelling interior for fire separation; without an interior adjacency this
 * connection cannot exist and occupants must use exterior paths to enter the
 * house from the garage — a significant habitability and safety deficiency.
 * Rulebook ref: null (IRC R309.1 — Garage/Dwelling Separation)
 */
const RB_089: RuleCheck = {
  id: 'RB-089',
  ruleId: null,
  title: 'Garage Internal Access',
  severity: 'warning',
  applies: layout => layout.rooms.some(r => r.type === 'garage' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const garages = rooms.filter(r => r.type === 'garage');
    const internalTypes = new Set(['entry', 'hall', 'laundry', 'kitchen']);
    const violations: Violation[] = [];
    for (const g of garages) {
      const hasInternalAdj = rooms.some(r => internalTypes.has(r.type) && roomsAreAdjacent(g, r));
      if (!hasInternalAdj) {
        violations.push({
          code: 'RB-089',
          severity: 'warning',
          message: `Garage "${roomLabel(g)}" is not adjacent to any interior room (entry/hall/laundry/kitchen) — IRC R309.1 requires an interior door connection between garage and dwelling.`,
          roomIds: [g.id],
          suggestedFixes: [{ type: 'moveRoom', roomId: g.id, dx: 0, dy: 0 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-090 — BEDROOM_CLOSET_COVERAGE
 * When multiple bedrooms are present, each bedroom should have at least one
 * closet directly adjacent to it. RB-006 only requires "at least one closet
 * adjacent to any bedroom" (plan-level minimum). RB-090 enforces the per-
 * bedroom standard: every bedroom is entitled to dedicated storage within the
 * private zone (Architectural Graphic Standards — Bedroom Storage Provision).
 * Severity is info because closets are sometimes placed across a hall in small
 * plans. Rulebook ref: null (Architectural Graphic Standards)
 */
const RB_090: RuleCheck = {
  id: 'RB-090',
  ruleId: null,
  title: 'Bedroom Closet Coverage',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.type === 'bedroom' && r.width > 0 && r.height > 0).length >= 2 &&
    layout.rooms.some(r => r.type === 'closet' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const beds    = rooms.filter(r => r.type === 'bedroom');
    const closets = rooms.filter(r => r.type === 'closet');
    if (beds.length < 2) return [];
    const violations: Violation[] = [];
    for (const b of beds) {
      const hasAdjacentCloset = closets.some(c => roomsAreAdjacent(b, c));
      if (!hasAdjacentCloset) {
        violations.push({
          code: 'RB-090',
          severity: 'info',
          message: `Bedroom "${roomLabel(b)}" has no adjacent closet — each bedroom should have dedicated storage within the private zone (Arch. Graphic Standards — Bedroom Storage Provision).`,
          roomIds: [b.id],
          suggestedFixes: [{ type: 'addRoom', roomType: 'closet' }],
        });
      }
    }
    return violations;
  },
};

// ── RB-091..RB-100 ────────────────────────────────────────────────────────────

/**
 * RB-091 — MBH_COMMUNAL_PROVISION
 * When ≥ 4 bedrooms are present (proxy for a care-facility patient cluster),
 * at least one communal room (living or dining) must exist.
 * R-091 (MBH Small-Unit and Mixed Room-Type Configuration) requires communal
 * areas, interaction furniture, and a public-to-private gradient in MBH
 * inpatient clusters. The layout data model does not distinguish building type,
 * so ≥ 4 bedrooms is used as the care-facility proxy.
 * Rulebook ref: R-091 (MBH Small-Unit and Mixed Room-Type Configuration)
 */
const RB_091: RuleCheck = {
  id: 'RB-091',
  ruleId: 'R-091',
  title: 'MBH Communal Space Provision',
  severity: 'warning',
  applies: layout =>
    layout.rooms.filter(r => r.type === 'bedroom' && r.width > 0 && r.height > 0).length >= 4,
  check(layout) {
    const rooms = validRooms(layout);
    const beds    = rooms.filter(r => r.type === 'bedroom');
    if (beds.length < 4) return [];
    const hasCommunal = rooms.some(
      r => r.type === 'living' || r.type === 'living room' || r.type === 'dining'
    );
    if (!hasCommunal) {
      const bedIds = beds.map(b => b.id);
      return [{
        code: 'RB-091',
        severity: 'warning',
        message: `Plan has ${beds.length} bedrooms but no communal room (living or dining) — MBH clusters require at least one shared social space per patient group (R-091).`,
        roomIds: bedIds,
        suggestedFixes: [{ type: 'addRoom', roomType: 'living' }],
      }];
    }
    return [];
  },
};

/**
 * RB-092 — COMMUNAL_AREA_PER_BEDROOM
 * When ≥ 2 bedrooms and ≥ 1 communal room (living or dining) are present, the
 * combined living+dining area should be ≥ 40 sq ft per bedroom.
 * Trauma-informed design (R-092) requires that communal space scales with
 * resident count. 40 sq ft/bedroom is the minimum for a seat-and-table social
 * grouping per resident (≈ one 20 sq ft armchair zone per person). Distinct from
 * RB-017 (percentage-of-total-area) because this is an absolute per-occupant
 * allocation.
 * Rulebook ref: R-092 (Trauma-Informed Design Environmental Stress Reduction)
 */
const RB_092: RuleCheck = {
  id: 'RB-092',
  ruleId: 'R-092',
  title: 'Communal Area Per Bedroom',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.type === 'bedroom' && r.width > 0 && r.height > 0).length >= 2 &&
    layout.rooms.some(
      r => (r.type === 'living' || r.type === 'living room' || r.type === 'dining') && r.width > 0 && r.height > 0
    ),
  check(layout, ctx) {
    const rooms       = validRooms(layout);
    const beds        = rooms.filter(r => r.type === 'bedroom');
    const communal    = rooms.filter(
      r => r.type === 'living' || r.type === 'living room' || r.type === 'dining'
    );
    if (beds.length < 2 || communal.length === 0) return [];
    const factor      = ctx.ftToUnit * ctx.ftToUnit;
    const communalSqFt = communal.reduce((s, r) => s + roomArea(r) / factor, 0);
    const MIN_PER_BED  = 40; // sq ft
    const required     = beds.length * MIN_PER_BED;
    if (communalSqFt < required) {
      return [{
        code: 'RB-092',
        severity: 'info',
        message: `Combined communal area ${communalSqFt.toFixed(0)} sq ft serves ${beds.length} bedrooms — must be ≥ ${required.toFixed(0)} sq ft (${MIN_PER_BED} sq ft/bedroom) for trauma-informed social space scaling (R-092).`,
        roomIds: communal.map(r => r.id),
        value: communalSqFt / beds.length,
        threshold: MIN_PER_BED,
        suggestedFixes: communal.map(r => ({
          type: 'resizeRoom' as const, roomId: r.id, scaleX: 1.2, scaleY: 1.2,
        })),
      }];
    }
    return [];
  },
};

/**
 * RB-093 — LIVING_DINING_ADJACENCY
 * When both a living room and a dining room are present, they should be
 * adjacent (sharing a wall).
 * R-093 (EmPATH Open Milieu Configuration) requires a continuous open social
 * zone in psychiatric care environments — the dining and lounge areas should
 * flow together without physical separation. In residential plans this is the
 * standard open-plan social zone. Severity is info because some plans
 * intentionally separate formal dining from informal living.
 * Rulebook ref: R-093 (EmPATH Open Milieu Configuration)
 */
const RB_093: RuleCheck = {
  id: 'RB-093',
  ruleId: 'R-093',
  title: 'Living–Dining Adjacency',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => (r.type === 'living' || r.type === 'living room') && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => r.type === 'dining' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms    = validRooms(layout);
    const living   = rooms.filter(r => r.type === 'living' || r.type === 'living room');
    const dining   = rooms.filter(r => r.type === 'dining');
    const anyAdj   = living.some(l => dining.some(d => roomsAreAdjacent(l, d)));
    if (!anyAdj) {
      return [{
        code: 'RB-093',
        severity: 'info',
        message: 'Living room and dining room are not adjacent — an open social zone connecting the two supports EmPATH milieu configuration and general occupant well-being (R-093).',
        roomIds: [...living.map(r => r.id), ...dining.map(r => r.id)],
        suggestedFixes: [{ type: 'swapRooms', roomIdA: living[0].id, roomIdB: dining[0].id }],
      }];
    }
    return [];
  },
};

/**
 * RB-094 — BEDROOM_TO_COMMON_ACCESS
 * When ≥ 3 bedrooms are present and at least one public-zone room (hall, entry,
 * living, or dining) exists, each bedroom should be directly adjacent to at
 * least one public-zone room.
 * R-094 (MBH Nurses' Station Open Integration) requires that all patient spaces
 * be accessible from the shared/monitored zone without passing through other
 * patient rooms. A bedroom with no public-zone adjacency is reachable only
 * through private rooms — an isolation pattern.
 * Rulebook ref: R-094 (MBH Nurses' Station Open Integration)
 */
const RB_094: RuleCheck = {
  id: 'RB-094',
  ruleId: 'R-094',
  title: 'Bedroom to Common Zone Access',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.type === 'bedroom' && r.width > 0 && r.height > 0).length >= 3 &&
    layout.rooms.some(
      r => (r.type === 'hall' || r.type === 'entry' || r.type === 'living' ||
            r.type === 'living room' || r.type === 'dining') && r.width > 0 && r.height > 0
    ),
  check(layout) {
    const rooms       = validRooms(layout);
    const beds        = rooms.filter(r => r.type === 'bedroom');
    if (beds.length < 3) return [];
    const publicZone  = rooms.filter(
      r => r.type === 'hall' || r.type === 'entry' ||
           r.type === 'living' || r.type === 'living room' || r.type === 'dining'
    );
    if (publicZone.length === 0) return [];
    const violations: Violation[] = [];
    for (const b of beds) {
      const adjToPublic = publicZone.some(p => roomsAreAdjacent(b, p));
      if (!adjToPublic) {
        violations.push({
          code: 'RB-094',
          severity: 'info',
          message: `Bedroom "${roomLabel(b)}" has no direct adjacency to a public-zone room (hall/entry/living/dining) — all patient or resident rooms should be accessible from the shared zone without passing through other private rooms (R-094).`,
          roomIds: [b.id],
          suggestedFixes: [{ type: 'addHallwayConnection', nearRoomId: b.id }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-095 — KITCHEN_PRESENCE_MULTI_BEDROOM
 * Plans with ≥ 3 bedrooms must include a kitchen.
 * R-095 (CHIME-Aligned MBH Space Programming) requires that the Empowerment
 * category be represented in care facility space programs — cooking and food
 * preparation are primary Empowerment activities. A residential plan with
 * 3+ bedrooms and no kitchen lacks the functional space for cooking activity,
 * which is both a CHIME deficiency and a basic habitability gap.
 * Rulebook ref: R-095 (CHIME-Aligned MBH Space Programming)
 */
const RB_095: RuleCheck = {
  id: 'RB-095',
  ruleId: 'R-095',
  title: 'Kitchen Presence (Multi-Bedroom)',
  severity: 'warning',
  applies: layout =>
    layout.rooms.filter(r => r.type === 'bedroom' && r.width > 0 && r.height > 0).length >= 3,
  check(layout) {
    const rooms = validRooms(layout);
    const beds  = rooms.filter(r => r.type === 'bedroom');
    if (beds.length < 3) return [];
    const hasKitchen = rooms.some(r => r.type === 'kitchen');
    if (!hasKitchen) {
      return [{
        code: 'RB-095',
        severity: 'warning',
        message: `Plan has ${beds.length} bedrooms but no kitchen — plans with 3+ bedrooms must include a kitchen for basic habitability and CHIME Empowerment (cooking/food activity) provision (R-095).`,
        roomIds: beds.map(b => b.id),
        suggestedFixes: [{ type: 'addRoom', roomType: 'kitchen' }],
      }];
    }
    return [];
  },
};

/**
 * RB-096 — BEDROOM_LONGER_DIM_MIN
 * Each bedroom must have its longer dimension ≥ 10 ft.
 * R-096 (MBH Occupant Environmental Control Provision) operationalises
 * empowerment through room-level environmental controls: a bedside thermostat,
 * nightstand with a tablet control interface, and a dresser all require that
 * the room has a functional length. 10 ft (the longer dim) accommodates a
 * queen bed (7 ft) + 12-in headboard clearance + 18-in footboard/dresser access
 * path. This is distinct from RB-060 (min width ≥ 8 ft, shorter dim) and
 * RB-002 (min area).
 * Rulebook ref: R-096 (MBH Occupant Environmental Control Provision)
 */
const RB_096: RuleCheck = {
  id: 'RB-096',
  ruleId: 'R-096',
  title: 'Bedroom Longer Dimension Minimum',
  severity: 'info',
  applies: layout => layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const beds  = rooms.filter(r => r.type === 'bedroom');
    const violations: Violation[] = [];
    const MIN_L = 10 * ctx.ftToUnit; // 10 ft
    for (const b of beds) {
      const longer = Math.max(b.width, b.height);
      if (longer < MIN_L) {
        const longerFt = (longer / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-096',
          severity: 'info',
          message: `Bedroom "${roomLabel(b)}" is only ${longerFt} ft in its longer dimension — must be ≥ 10 ft to fit a bed, dresser, and bedside controls with required clearances (R-096).`,
          roomIds: [b.id],
          value: longer / ctx.ftToUnit,
          threshold: 10,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: b.id,
            targetW: b.width  > b.height ? MIN_L : b.width,
            targetH: b.height > b.width  ? MIN_L : b.height,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-097 — PLAN_ACTIVITY_SPACE
 * Plans with ≥ 4 bedrooms must include at least one room of type "other"
 * (proxy for an outdoor courtyard, activity room, garden, or multipurpose space).
 * R-097 (Trauma-Informed School Design) and R-057 (Behavioral Health Outdoor
 * Access) both require accessible outdoor or activity space as part of a
 * trauma-sensitive environment. The "other" room type is the closest available
 * proxy in the layout data model; generation/review tools should interpret it
 * as a non-assigned activity or outdoor space.
 * Assumption: "other" room type = outdoor courtyard / activity area proxy.
 * Rulebook ref: R-097 (Trauma-Informed School Design)
 */
const RB_097: RuleCheck = {
  id: 'RB-097',
  ruleId: 'R-097',
  title: 'Activity Space Provision',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.type === 'bedroom' && r.width > 0 && r.height > 0).length >= 4,
  check(layout) {
    const rooms = validRooms(layout);
    const beds  = rooms.filter(r => r.type === 'bedroom');
    if (beds.length < 4) return [];
    const hasActivity = rooms.some(r => r.type === 'other');
    if (!hasActivity) {
      return [{
        code: 'RB-097',
        severity: 'info',
        message: `Plan has ${beds.length} bedrooms but no activity/outdoor space ("other" room) — trauma-informed and MBH design requires accessible activity or outdoor space for recovery (R-097).`,
        roomIds: beds.map(b => b.id),
        suggestedFixes: [{ type: 'addRoom', roomType: 'other' }],
      }];
    }
    return [];
  },
};

/**
 * RB-098 — ROOM_TYPE_DIVERSITY
 * Plans with ≥ 5 rooms should have ≥ 4 distinct room-type categories.
 * R-098 (Mixed-Use Walkability Density Standard) promotes mixed land uses
 * and diverse destinations. At floor-plan scale, diversity of room types is
 * the closest proxy: a plan with 5+ rooms but only 1–2 types (e.g. all
 * bedrooms and bathrooms) lacks the variety of activities — cooking, working,
 * socialising — that define a livable mixed-use environment.
 * Rulebook ref: R-098 (Mixed-Use Walkability Density Standard)
 */
const RB_098: RuleCheck = {
  id: 'RB-098',
  ruleId: 'R-098',
  title: 'Room Type Diversity',
  severity: 'info',
  applies: layout => layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 5,
  check(layout) {
    const rooms    = validRooms(layout);
    if (rooms.length < 5) return [];
    const types    = new Set(rooms.map(r => r.type));
    const MIN_TYPES = 4;
    if (types.size < MIN_TYPES) {
      return [{
        code: 'RB-098',
        severity: 'info',
        message: `Plan has ${rooms.length} rooms but only ${types.size} distinct room type${types.size > 1 ? 's' : ''} — plans with ≥ 5 rooms should include ≥ ${MIN_TYPES} distinct types (bedroom, bathroom, kitchen, living/dining, etc.) for programmatic diversity (R-098).`,
        roomIds: [],
        value: types.size,
        threshold: MIN_TYPES,
      }];
    }
    return [];
  },
};

/**
 * RB-099 — HALL_HUB_CONNECTIVITY
 * In plans with ≥ 4 rooms, each hall should be adjacent to ≥ 3 other rooms
 * (functioning as a distribution hub rather than a dead-end corridor appendage).
 * R-099 (Complete Sidewalk Connectivity Requirement) demands complete,
 * connected path networks. At floor-plan scale, a hall with only 1–2
 * adjacencies is a stub corridor — it serves only the rooms immediately beside
 * it and creates dead-end circulation. A hall adjacent to ≥ 3 rooms anchors a
 * true branching circulation network (hub connectivity).
 * Rulebook ref: R-099 (Complete Sidewalk Connectivity Requirement)
 */
const RB_099: RuleCheck = {
  id: 'RB-099',
  ruleId: 'R-099',
  title: 'Hall Hub Connectivity',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 4 &&
    layout.rooms.some(r => r.type === 'hall' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms   = validRooms(layout);
    if (rooms.length < 4) return [];
    const halls   = rooms.filter(r => r.type === 'hall');
    const violations: Violation[] = [];
    const MIN_ADJ = 3;
    for (const h of halls) {
      const adjCount = rooms.filter(r => r.id !== h.id && roomsAreAdjacent(h, r)).length;
      if (adjCount < MIN_ADJ) {
        violations.push({
          code: 'RB-099',
          severity: 'info',
          message: `Hall "${roomLabel(h)}" is adjacent to only ${adjCount} room${adjCount !== 1 ? 's' : ''} — must connect to ≥ ${MIN_ADJ} rooms to function as a circulation hub rather than a dead-end stub (R-099).`,
          roomIds: [h.id],
          value: adjCount,
          threshold: MIN_ADJ,
        });
      }
    }
    return violations;
  },
};

/**
 * RB-100 — LIVING_ROOM_LONGER_DIM_MIN
 * Each living room must have its longer dimension ≥ 14 ft.
 * R-100 (Park Proximity Standard) promotes on-site recreation as a compensating
 * provision when no park is within range. The living room is the primary on-site
 * recreation and social space. 14 ft in the longer dimension is the minimum for
 * a functional furniture arrangement: sofa (84 in) + coffee table (24 in) +
 * facing chairs (30 in) + 12-in wall clearance on each end = ~13.5 ft. This is
 * distinct from RB-061 (min width ≥ 12 ft, shorter dim) and RB-046 (min area).
 * Rulebook ref: R-100 (Park Proximity Standard)
 */
const RB_100: RuleCheck = {
  id: 'RB-100',
  ruleId: 'R-100',
  title: 'Living Room Longer Dimension Minimum',
  severity: 'info',
  applies: layout => layout.rooms.some(
    r => (r.type === 'living' || r.type === 'living room') && r.width > 0 && r.height > 0
  ),
  check(layout, ctx) {
    const rooms   = validRooms(layout);
    const living  = rooms.filter(r => r.type === 'living' || r.type === 'living room');
    const violations: Violation[] = [];
    const MIN_L   = 14 * ctx.ftToUnit; // 14 ft
    for (const r of living) {
      const longer = Math.max(r.width, r.height);
      if (longer < MIN_L) {
        const longerFt = (longer / ctx.ftToUnit).toFixed(1);
        violations.push({
          code: 'RB-100',
          severity: 'info',
          message: `Living room "${roomLabel(r)}" is only ${longerFt} ft in its longer dimension — must be ≥ 14 ft for a full sofa-and-seating arrangement with required clearances (R-100 on-site recreation provision).`,
          roomIds: [r.id],
          value: longer / ctx.ftToUnit,
          threshold: 14,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: r.id,
            targetW: r.width  > r.height ? MIN_L : r.width,
            targetH: r.height > r.width  ? MIN_L : r.height,
          }],
        });
      }
    }
    return violations;
  },
};

// ── RB-101..RB-110 ────────────────────────────────────────────────────────────

/**
 * RB-101 — HALL_AT_PRIMARY_CIRCULATION
 * In plans with ≥ 5 rooms, at least one hall room must be adjacent to an entry
 * room OR touch the exterior boundary. This proxies for R-101's requirement
 * that stairs be "prominently located" at the main circulation path rather than
 * hidden in a back corridor. A hall reachable only through interior rooms lacks
 * the direct stairwell-at-entry visibility that drives increased stair use.
 * Rulebook ref: R-101 (Workplace Active Design Features)
 */
const RB_101: RuleCheck = {
  id: 'RB-101',
  ruleId: 'R-101',
  title: 'Hall at Primary Circulation',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 5 &&
    layout.rooms.some(r => r.type === 'hall' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms  = validRooms(layout);
    if (rooms.length < 5) return [];
    const halls  = rooms.filter(r => r.type === 'hall');
    if (halls.length === 0) return [];
    const entries = rooms.filter(r => r.type === 'entry');
    const anyHallAtPrimary = halls.some(h =>
      touchesExterior(h, ctx.dimW, ctx.dimD) ||
      entries.some(e => roomsAreAdjacent(h, e))
    );
    if (!anyHallAtPrimary) {
      const hallIds = halls.map(h => h.id);
      return [{
        code: 'RB-101',
        severity: 'info',
        message: `No hall is adjacent to an entry or touches the exterior boundary — the primary circulation spine should reach the main entry so stairs remain visible and accessible (R-101 Active Design).`,
        roomIds: hallIds,
        suggestedFixes: [{ type: 'moveRoom', roomId: halls[0].id, dx: -halls[0].x, dy: 0 }],
      }];
    }
    return [];
  },
};

/**
 * RB-102 — OUTDOOR_ROOM_EXTERIOR_ACCESS
 * When ≥ 3 bedrooms and ≥ 1 'other' room are present, at least one 'other' room
 * must touch the exterior boundary. R-102 (School Outdoor Physical Activity
 * Priority) identifies outdoor environments as the highest-impact activity scale.
 * 'other' is the model's proxy for outdoor courtyards, playgrounds, and activity
 * areas; an 'other' room with no exterior contact cannot function as outdoor space.
 * Distinct from RB-097 (which checks that 'other' is present); this checks that
 * it is accessible from the building perimeter.
 * Rulebook ref: R-102 (School Outdoor Physical Activity Priority)
 */
const RB_102: RuleCheck = {
  id: 'RB-102',
  ruleId: 'R-102',
  title: 'Outdoor Room Exterior Access',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.type === 'bedroom' && r.width > 0 && r.height > 0).length >= 3 &&
    layout.rooms.some(r => r.type === 'other' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms  = validRooms(layout);
    const beds   = rooms.filter(r => r.type === 'bedroom');
    if (beds.length < 3) return [];
    const others = rooms.filter(r => r.type === 'other');
    if (others.length === 0) return [];
    const anyExterior = others.some(o => touchesExterior(o, ctx.dimW, ctx.dimD));
    if (!anyExterior) {
      return [{
        code: 'RB-102',
        severity: 'info',
        message: `No 'other' room (outdoor/activity space proxy) touches the exterior boundary — outdoor activity areas must be accessible from the building perimeter to serve as effective physical activity environments (R-102).`,
        roomIds: others.map(o => o.id),
        suggestedFixes: others.map(o => ({ type: 'moveRoom' as const, roomId: o.id, dx: -o.x, dy: 0 })),
      }];
    }
    return [];
  },
};

/**
 * RB-103 — THREE_DOMAIN_PROGRAM_PRESENCE
 * Plans with ≥ 6 rooms should contain at least one room from each of the three
 * health co-benefit domains required by R-103 (Active Living Co-Benefits
 * Documentation): (1) social health — living or dining room; (2) physical
 * activity — 'other' room (gym/activity/courtyard proxy); (3) economic/
 * productivity — office room. At the Mueller Community scale, all three domains
 * must be represented for multi-domain co-benefits framing to hold. A plan
 * missing any one domain lacks the full programmatic basis for that claim.
 * Distinct from RB-098 (counts distinct types ≥ 4, regardless of category).
 * Rulebook ref: R-103 (Active Living Co-Benefits Documentation)
 */
const RB_103: RuleCheck = {
  id: 'RB-103',
  ruleId: 'R-103',
  title: 'Three-Domain Program Presence',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 6,
  check(layout) {
    const rooms = validRooms(layout);
    if (rooms.length < 6) return [];
    const hasSocial   = rooms.some(r => r.type === 'living' || r.type === 'living room' || r.type === 'dining');
    const hasActivity = rooms.some(r => r.type === 'other');
    const hasWork     = rooms.some(r => r.type === 'office');
    const missing: string[] = [];
    if (!hasSocial)   missing.push('social health space (living or dining)');
    if (!hasActivity) missing.push('physical activity space (other/gym/courtyard)');
    if (!hasWork)     missing.push('work/productivity space (office)');
    if (missing.length === 0) return [];
    return [{
      code: 'RB-103',
      severity: 'info',
      message: `Large plan (${rooms.length} rooms) is missing program from ${missing.length} health co-benefit domain(s): ${missing.join('; ')}. All three domains (social, physical, economic) are needed for multi-domain co-benefits framing (R-103).`,
      roomIds: [],
      suggestedFixes: missing.map(m => ({ type: 'addRoom' as const, roomType: !hasSocial && m.startsWith('social') ? 'living' : !hasActivity && m.startsWith('physical') ? 'other' : 'office' })),
    }];
  },
};

/**
 * RB-104 — PLAN_FORM_COMPACTNESS
 * The floor plan's longer dimension should not exceed 3× the shorter dimension
 * (aspect ratio ≤ 3:1). R-104 (Near-Zero Carbon Building Pathway) mandates that
 * passive design load reduction comes first in the decarbonisation hierarchy, and
 * compact building form is the primary passive measure: it minimises the
 * surface-to-volume ratio and therefore both heating and cooling loads. An
 * elongated plan with aspect ratio > 3:1 has disproportionate exposed surface
 * area and defeats passive load reduction before any systems are sized.
 * Rulebook ref: R-104 (Near-Zero Carbon Building Pathway)
 */
const RB_104: RuleCheck = {
  id: 'RB-104',
  ruleId: 'R-104',
  title: 'Plan Form Compactness',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 3 &&
    layout.dimensions.width > 0 && layout.dimensions.depth > 0,
  check(layout) {
    const { width, depth } = layout.dimensions;
    if (width <= 0 || depth <= 0) return [];
    const rooms = validRooms(layout);
    if (rooms.length < 3) return [];
    const longer  = Math.max(width, depth);
    const shorter = Math.min(width, depth);
    const MAX_RATIO = 3;
    const ratio = longer / shorter;
    if (ratio > MAX_RATIO) {
      return [{
        code: 'RB-104',
        severity: 'info',
        message: `Floor plan aspect ratio is ${ratio.toFixed(1)}:1 — must be ≤ ${MAX_RATIO}:1 to maintain a compact form that minimises surface-to-volume ratio and passive heating/cooling loads (R-104 Near-Zero Carbon hierarchy).`,
        roomIds: [],
        value: ratio,
        threshold: MAX_RATIO,
      }];
    }
    return [];
  },
};

/**
 * RB-105 — DOMINANT_ROOM_AREA_BALANCE
 * In plans with ≥ 4 rooms, no single room should occupy > 35% of the total room
 * area. R-105 (Embodied Carbon Assessment) requires that material selection
 * consider embodied carbon alongside first cost; a room that dominates the
 * program at > 35% of total area creates a disproportionate structural bay that
 * requires oversized members and connections — a proxy for unchecked embodied
 * carbon concentration in a single element. Balanced room sizing distributes
 * structural loads more efficiently and reduces peak embodied carbon per sq ft.
 * Rulebook ref: R-105 (Embodied Carbon Assessment)
 */
const RB_105: RuleCheck = {
  id: 'RB-105',
  ruleId: 'R-105',
  title: 'Dominant Room Area Balance',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 4,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 4) return [];
    const factor   = ctx.ftToUnit * ctx.ftToUnit;
    const totalSqFt = rooms.reduce((s, r) => s + roomArea(r) / factor, 0);
    if (totalSqFt === 0) return [];
    const MAX_FRAC = 0.35;
    const violations: Violation[] = [];
    for (const r of rooms) {
      const areaSqFt = roomArea(r) / factor;
      const frac = areaSqFt / totalSqFt;
      if (frac > MAX_FRAC) {
        violations.push({
          code: 'RB-105',
          severity: 'info',
          message: `Room "${roomLabel(r)}" (${r.type}) occupies ${(frac * 100).toFixed(0)}% of total room area — must be ≤ ${MAX_FRAC * 100}% to maintain balanced structural distribution and limit embodied carbon concentration (R-105).`,
          roomIds: [r.id],
          value: frac,
          threshold: MAX_FRAC,
          suggestedFixes: [{
            type: 'resizeRoom',
            roomId: r.id,
            scaleX: Math.sqrt(MAX_FRAC / frac) - 0.05,
            scaleY: Math.sqrt(MAX_FRAC / frac) - 0.05,
          }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-106 — INTERIOR_BUFFER_ROOM_PRESENT
 * In plans with ≥ 5 rooms, at least one room should NOT touch any exterior wall
 * (serving as an interior thermal buffer zone). R-106 (Dual Climate Strategy)
 * requires both mitigation (carbon reduction) and adaptation (climate resilience)
 * strategies. At the floor-plan scale, a plan where every room directly borders
 * the exterior has no thermal buffer — all spaces are exposed to peak summer heat
 * or winter cold with no interior zone providing temperature moderation. An
 * interior room (hall, closet, bathroom, laundry) acts as a buffer between
 * conditioned habitable spaces and the exterior envelope, reducing thermal load
 * volatility during grid-outage events and extreme weather conditions.
 * Rulebook ref: R-106 (Dual Climate Strategy: Adaptation and Mitigation)
 */
const RB_106: RuleCheck = {
  id: 'RB-106',
  ruleId: 'R-106',
  title: 'Interior Buffer Room Present',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 5,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 5) return [];
    const hasInterior = rooms.some(r => !touchesExterior(r, ctx.dimW, ctx.dimD));
    if (!hasInterior) {
      return [{
        code: 'RB-106',
        severity: 'info',
        message: `Every room in this plan touches an exterior wall — include at least one interior buffer room (hall, closet, or bathroom) to provide thermal buffering between the habitable spaces and the building envelope (R-106 Climate Adaptation).`,
        roomIds: rooms.map(r => r.id),
        suggestedFixes: [{ type: 'addRoom', roomType: 'hall' }],
      }];
    }
    return [];
  },
};

/**
 * RB-107 — LAUNDRY_INTERIOR_ADJACENCY
 * Laundry rooms should be adjacent to at least one interior room (hall or
 * bathroom). R-107 (Flood Resilience Ground-Floor Design) requires that
 * mechanical equipment and vulnerable program not be placed at maximum flood
 * exposure. A laundry room isolated at the building perimeter with no interior
 * adjacency is at maximum flood risk: it sits directly at the building envelope
 * with no interior buffer between it and exterior flood ingress. Adjacency to
 * a hall or bathroom ensures the laundry is within the protected interior zone.
 * Distinct from RB-089 (garage internal access for fire separation per IRC R309).
 * Rulebook ref: R-107 (Flood Resilience Ground-Floor Design)
 */
const RB_107: RuleCheck = {
  id: 'RB-107',
  ruleId: 'R-107',
  title: 'Laundry Interior Adjacency',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'laundry' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms   = validRooms(layout);
    const laundry = rooms.filter(r => r.type === 'laundry');
    const interior = new Set(['hall', 'bathroom']);
    const violations: Violation[] = [];
    for (const l of laundry) {
      const hasAdj = rooms.some(r => interior.has(r.type) && roomsAreAdjacent(l, r));
      if (!hasAdj) {
        violations.push({
          code: 'RB-107',
          severity: 'info',
          message: `Laundry room "${roomLabel(l)}" is not adjacent to any hall or bathroom — mechanical equipment should be within the protected interior zone, not isolated at the building perimeter (R-107 Flood Resilience).`,
          roomIds: [l.id],
          suggestedFixes: [{ type: 'moveRoom', roomId: l.id, dx: 0, dy: 0 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-108 — TWO_BATHROOMS_FOR_THREE_BEDROOMS
 * Plans with ≥ 3 bedrooms must include ≥ 2 bathrooms. R-108 (Passive
 * Survivability: 72-Hour Habitability Standard) requires that buildings remain
 * habitable without active systems, including "access to potable water." Water
 * access for sanitation requires sufficient bathroom facilities — a 3+ bedroom
 * plan with only 1 bathroom creates a sanitation bottleneck during grid-outage
 * events when occupants cannot leave the building. The 2-bathroom minimum for
 * 3+ bedroom plans is also the HUD Minimum Property Standards sanitation
 * requirement for multi-bedroom residential occupancy.
 * Distinct from RB-064 (per-bedroom adjacency) and RB-018 (circulation access).
 * Rulebook ref: R-108 (Passive Survivability: 72-Hour Habitability Standard)
 */
const RB_108: RuleCheck = {
  id: 'RB-108',
  ruleId: 'R-108',
  title: 'Two Bathrooms for Three Bedrooms',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.type === 'bedroom' && r.width > 0 && r.height > 0).length >= 3,
  check(layout) {
    const rooms    = validRooms(layout);
    const beds     = rooms.filter(r => r.type === 'bedroom');
    const baths    = rooms.filter(r => r.type === 'bathroom');
    if (beds.length < 3) return [];
    const MIN_BATHS = 2;
    if (baths.length < MIN_BATHS) {
      const bedIds = beds.map(b => b.id);
      return [{
        code: 'RB-108',
        severity: 'info',
        message: `Plan has ${beds.length} bedrooms but only ${baths.length} bathroom(s) — at least ${MIN_BATHS} bathrooms are required for a ${beds.length}-bedroom plan to maintain sanitation access during passive-survivability conditions (R-108).`,
        roomIds: bedIds,
        value: baths.length,
        threshold: MIN_BATHS,
        suggestedFixes: [{ type: 'addRoom', roomType: 'bathroom' }],
      }];
    }
    return [];
  },
};

/**
 * RB-109 — OFFICE_EXTERIOR_ACCESS
 * Office rooms should touch the exterior boundary (natural daylighting access).
 * R-109 (Net Zero Carbon Verification Requirement) notes that the performance gap
 * between designed and actual energy use averages 1.5–2× across the industry.
 * Daylit offices are a primary driver of this gap: an interior office defaults
 * entirely to artificial lighting during occupied hours, consuming 2–3× the
 * energy of a daylit workspace. Placing office rooms at the exterior boundary is
 * the most effective passive daylighting measure and must precede commissioning
 * and metering plans (the M&V pathway of R-109) to be credible.
 * Distinct from RB-004 (living), RB-005 (kitchen), RB-011 (bedrooms), RB-043.
 * Rulebook ref: R-109 (Net Zero Carbon Verification Requirement)
 */
const RB_109: RuleCheck = {
  id: 'RB-109',
  ruleId: 'R-109',
  title: 'Office Exterior Access',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'office' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms   = validRooms(layout);
    const offices = rooms.filter(r => r.type === 'office');
    const violations: Violation[] = [];
    for (const o of offices) {
      if (!touchesExterior(o, ctx.dimW, ctx.dimD)) {
        violations.push({
          code: 'RB-109',
          severity: 'info',
          message: `Office "${roomLabel(o)}" does not touch an exterior wall — interior offices rely entirely on artificial lighting, significantly increasing lighting energy load and widening the actual-vs-designed performance gap (R-109 Net Zero Verification).`,
          roomIds: [o.id],
          suggestedFixes: [{ type: 'moveRoom', roomId: o.id, dx: -o.x, dy: 0 }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-110 — ALL_FACADES_ACTIVATED
 * In plans with ≥ 6 rooms, rooms should touch all 4 exterior boundary segments
 * (left, right, top, bottom edges of the floor plan). R-110 (Site Microclimate
 * Analysis Precondition) requires that solar access at all facades and prevailing
 * wind direction be understood before massing decisions are made. A plan where
 * rooms occupy only 2–3 sides of the floor plate implies the remaining facade(s)
 * are entirely unused — the solar and wind conditions on those faces were not
 * considered in the design. Full four-facade activation is the floor-plan proxy
 * for a site-microclimate-informed massing that distributes programme around all
 * cardinal orientations.
 * Rulebook ref: R-110 (Site Microclimate Analysis Precondition)
 */
const RB_110: RuleCheck = {
  id: 'RB-110',
  ruleId: 'R-110',
  title: 'All Facades Activated',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 6,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 6) return [];
    const tol = 0.5;
    const { dimW, dimD } = ctx;
    const touchLeft   = rooms.some(r => r.x <= tol);
    const touchRight  = rooms.some(r => r.x + r.width  >= dimW - tol);
    const touchTop    = rooms.some(r => r.y <= tol);
    const touchBottom = rooms.some(r => r.y + r.height >= dimD - tol);
    const inactive: string[] = [];
    if (!touchLeft)   inactive.push('left');
    if (!touchRight)  inactive.push('right');
    if (!touchTop)    inactive.push('top');
    if (!touchBottom) inactive.push('bottom');
    if (inactive.length === 0) return [];
    return [{
      code: 'RB-110',
      severity: 'info',
      message: `${inactive.length} facade(s) have no adjacent room — inactive faces: ${inactive.join(', ')}. In a ≥ 6-room plan, all four building faces should have rooms to ensure solar and wind microclimate conditions on every facade were considered in the massing (R-110).`,
      roomIds: [],
      value: inactive.length,
      threshold: 0,
    }];
  },
};

// ── RB-111..RB-120 ────────────────────────────────────────────────────────────

/**
 * RB-111 — PRIMARY_ROOMS_SOUTH_FACING
 * In plans with ≥ 3 rooms, at least one primary habitable room (living, dining,
 * bedroom, or kitchen) must touch the bottom edge of the floor plan (south facade
 * proxy). R-111 (Heating Climate South Glazing) states that heating-dominated
 * buildings must maximise south-facing solar gain; primary rooms placed entirely
 * on north/east/west faces miss the primary passive solar opportunity.
 * Assumption: bottom edge = south facade; 'living room' alias normalised to 'living'.
 * Rulebook ref: R-111 (Heating Climate / South Glazing)
 */
const RB_111: RuleCheck = {
  id: 'RB-111',
  ruleId: 'R-111',
  title: 'Primary Rooms South Facing',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 3,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 3) return [];
    const PRIMARY = new Set(['living', 'living room', 'dining', 'bedroom', 'kitchen']);
    const primary = rooms.filter(r => PRIMARY.has(r.type.toLowerCase()));
    if (primary.length === 0) return [];
    const tol = 0.5;
    const anySouth = primary.some(r => r.y + r.height >= ctx.dimD - tol);
    if (anySouth) return [];
    return [{
      code: 'RB-111',
      severity: 'info',
      message: `No primary habitable room (living, dining, bedroom, kitchen) touches the south facade (bottom edge). In a heating-dominated climate, primary rooms should face south to benefit from passive solar gain (R-111).`,
      roomIds: primary.map(r => r.id),
      value: 0,
      threshold: 1,
    }];
  },
};

/**
 * RB-112 — CROSS_VENTILATION_PAIR
 * In plans with ≥ 4 rooms, rooms must occupy at least one pair of opposite facades
 * — either left+right or top+bottom. R-112 (Passive Cooling / Cross Ventilation)
 * states that natural cross-ventilation requires openings on opposing building faces;
 * a plan where all rooms cluster on only one lateral half cannot achieve a cross-
 * ventilation path regardless of window placement.
 * Assumption: left/right = east-west pair; top/bottom = north-south pair.
 * Rulebook ref: R-112 (Passive Cooling / Natural Ventilation)
 */
const RB_112: RuleCheck = {
  id: 'RB-112',
  ruleId: 'R-112',
  title: 'Cross-Ventilation Pair',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 4,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 4) return [];
    const tol = 0.5;
    const touchLeft   = rooms.some(r => r.x <= tol);
    const touchRight  = rooms.some(r => r.x + r.width  >= ctx.dimW - tol);
    const touchTop    = rooms.some(r => r.y <= tol);
    const touchBottom = rooms.some(r => r.y + r.height >= ctx.dimD - tol);
    const hasEWPair = touchLeft && touchRight;
    const hasNSPair = touchTop  && touchBottom;
    if (hasEWPair || hasNSPair) return [];
    return [{
      code: 'RB-112',
      severity: 'info',
      message: `Rooms do not occupy any pair of opposite facades (left+right or top+bottom). Cross-ventilation requires openings on opposing faces — at least one opposing facade pair must have adjacent rooms (R-112).`,
      roomIds: [],
      value: 0,
      threshold: 1,
    }];
  },
};

/**
 * RB-113 — SOUTH_ZONE_AREA_LIMIT
 * In plans with ≥ 3 rooms, rooms touching the south (bottom) facade should not
 * exceed 70% of total room area. R-113 (Overhang Sizing / Solar Shading) warns
 * that over-glazed or over-exposed south facades require critically precise overhang
 * sizing; when the majority of floor area abuts the south face the building becomes
 * a south-facing slab with no interior thermal buffer, making passive shading control
 * technically difficult. A ≤ 70% south-zone limit ensures at least 30% of the plan
 * is in an interior or non-south zone providing thermal inertia depth.
 * Rulebook ref: R-113 (Overhang Sizing / Fixed Shading Devices)
 */
const RB_113: RuleCheck = {
  id: 'RB-113',
  ruleId: 'R-113',
  title: 'South Zone Area Limit',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 3,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 3) return [];
    const tol = 0.5;
    const southRooms = rooms.filter(r => r.y + r.height >= ctx.dimD - tol);
    if (southRooms.length === 0) return [];
    const totalArea = rooms.reduce((s, r) => s + roomArea(r), 0);
    const southArea = southRooms.reduce((s, r) => s + roomArea(r), 0);
    const ratio = totalArea > 0 ? southArea / totalArea : 0;
    if (ratio <= 0.70) return [];
    return [{
      code: 'RB-113',
      severity: 'info',
      message: `South-facing rooms (bottom edge) account for ${Math.round(ratio * 100)}% of total room area (threshold: ≤ 70%). An over-exposed south zone leaves insufficient interior buffer for passive shading control; relocate some program away from the south face (R-113).`,
      roomIds: southRooms.map(r => r.id),
      value: Math.round(ratio * 100),
      threshold: 70,
    }];
  },
};

/**
 * RB-114 — VENTILATION_PLAN_DEPTH
 * The floor plan depth (dimD) must be ≥ 20 ft (6 m for metric layouts).
 * R-114 (Natural Ventilation Stack Effect) states that natural ventilation requires
 * adequate separation between inlet and outlet openings; at floor-plan scale, a
 * building depth < 20 ft (< 6 m) provides insufficient path length for effective
 * cross-ventilation (ASHRAE 62.1 recommends a minimum ~20 ft cross-ventilation
 * flow path for single-sided and cross-ventilation strategies in residential buildings).
 * Assumption: plan depth = cross-ventilation flow path proxy.
 * Rulebook ref: R-114 (Natural Ventilation / Stack Effect Separation)
 */
const RB_114: RuleCheck = {
  id: 'RB-114',
  ruleId: 'R-114',
  title: 'Ventilation Plan Depth',
  severity: 'info',
  applies: () => true,
  check(layout, ctx) {
    const minDepth = ctx.units === 'meters' ? 6 : 20;
    if (ctx.dimD >= minDepth) return [];
    return [{
      code: 'RB-114',
      severity: 'info',
      message: `Floor plan depth is ${ctx.dimD} ${ctx.units} — below the ${minDepth} ${ctx.units} minimum for effective natural cross-ventilation. A plan shallower than ${minDepth} ${ctx.units} cannot develop a sufficient inlet-to-outlet flow path for passive ventilation (R-114).`,
      roomIds: [],
      value: ctx.dimD,
      threshold: minDepth,
    }];
  },
};

/**
 * RB-115 — DAYLIGHTING_DEPTH_LIMIT
 * No room's shorter dimension should exceed 25 ft (7.5 m for metric). R-115
 * (Daylighting Autonomy / Workstation Distance from Window) states that spaces
 * deeper than 1.5–2.5× ceiling height from a perimeter window cannot rely on
 * daylight for task lighting; at a typical 10 ft ceiling, 25 ft is the outer limit
 * of useful daylighting depth. Rooms wider than 25 ft in their shorter dimension
 * require supplementary artificial lighting for the interior zone regardless of
 * window area, increasing lighting energy use.
 * Distinct from RB-003 (aspect ratio) which catches elongated rooms, not deep ones.
 * Rulebook ref: R-115 (Daylighting Autonomy / Distance from Window)
 */
const RB_115: RuleCheck = {
  id: 'RB-115',
  ruleId: 'R-115',
  title: 'Daylighting Depth Limit',
  severity: 'info',
  applies: () => true,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const maxDepth = ctx.units === 'meters' ? 7.5 : 25;
    const violations: Violation[] = [];
    for (const r of rooms) {
      const shorter = Math.min(r.width, r.height);
      if (shorter > maxDepth) {
        violations.push({
          code: 'RB-115',
          severity: 'info',
          message: `${roomLabel(r)} has a shorter dimension of ${shorter.toFixed(1)} ${ctx.units}, exceeding the ${maxDepth} ${ctx.units} daylighting depth limit. Interior areas beyond ${maxDepth} ${ctx.units} from a perimeter window cannot be adequately daylit (R-115).`,
          roomIds: [r.id],
          value: shorter,
          threshold: maxDepth,
        });
      }
    }
    return violations;
  },
};

/**
 * RB-116 — THERMAL_MASS_BALANCE
 * When rooms touch the south (bottom) facade, the total area of north-facing
 * (top-touching) rooms must be ≥ 25% of south-facing room area. R-116 (Passive
 * Solar Overheating / Thermal Mass) states that passive solar plans require
 * sufficient thermal mass to absorb peak solar gain; at floor-plan scale, a plan
 * with a large south zone and minimal north zone has no interior mass depth to
 * buffer daytime overheating. The 25% north-to-south area ratio is the minimum
 * proxy for a balanced plan with adequate thermal inertia on the shaded (north)
 * side to re-radiate heat overnight.
 * Rulebook ref: R-116 (Passive Solar / Thermal Mass Ratio)
 */
const RB_116: RuleCheck = {
  id: 'RB-116',
  ruleId: 'R-116',
  title: 'Thermal Mass Balance',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 3,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 3) return [];
    const tol = 0.5;
    const southRooms = rooms.filter(r => r.y + r.height >= ctx.dimD - tol);
    if (southRooms.length === 0) return [];
    const northRooms = rooms.filter(r => r.y <= tol);
    const southArea = southRooms.reduce((s, r) => s + roomArea(r), 0);
    const northArea = northRooms.reduce((s, r) => s + roomArea(r), 0);
    const ratio = southArea > 0 ? northArea / southArea : 1;
    if (ratio >= 0.25) return [];
    return [{
      code: 'RB-116',
      severity: 'info',
      message: `North-zone area (${northArea.toFixed(0)} sq ${ctx.units === 'meters' ? 'm' : 'ft'}) is only ${Math.round(ratio * 100)}% of south-zone area — below the 25% minimum. A plan dominated by south-facing rooms has insufficient north-zone thermal mass to buffer passive solar overheating (R-116).`,
      roomIds: southRooms.map(r => r.id),
      value: Math.round(ratio * 100),
      threshold: 25,
    }];
  },
};

/**
 * RB-117 — PLAN_EFFICIENCY_RATIO
 * In plans with ≥ 4 rooms, the sum of room areas must be ≥ 55% of the total floor
 * plate area (dimW × dimD). R-117 (Energy Benchmarking / Decarbonisation Pathway)
 * requires that buildings be benchmarked against a whole-system efficiency target,
 * not just code minimums. At floor-plan scale, a plan where rooms account for < 55%
 * of the floor plate has excessive void/circulation area — an inherently inefficient
 * layout that inflates gross area, structural cost, and embodied carbon per net
 * programme square foot. The 55% net-to-gross threshold corresponds to standard
 * residential efficiency expectations (HUD guideline: ≥ 60%; 55% flags outliers).
 * Rulebook ref: R-117 (Energy Efficiency / Plan Spatial Efficiency)
 */
const RB_117: RuleCheck = {
  id: 'RB-117',
  ruleId: 'R-117',
  title: 'Plan Efficiency Ratio',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 4,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 4) return [];
    const plateArea = ctx.dimW * ctx.dimD;
    const roomTotal = rooms.reduce((s, r) => s + roomArea(r), 0);
    const ratio = plateArea > 0 ? roomTotal / plateArea : 1;
    if (ratio >= 0.55) return [];
    return [{
      code: 'RB-117',
      severity: 'info',
      message: `Room area covers ${Math.round(ratio * 100)}% of the floor plate (threshold: ≥ 55%). Excessive circulation voids reduce plan efficiency and increase gross area, embodied carbon, and heating/cooling loads per net programme square foot (R-117).`,
      roomIds: [],
      value: Math.round(ratio * 100),
      threshold: 55,
    }];
  },
};

/**
 * RB-118 — DUAL_ORIENTATION_HABITABLE
 * In plans with ≥ 5 rooms, at least one primary habitable room (living, dining,
 * bedroom, kitchen) must touch the top (north) edge AND at least one must touch the
 * bottom (south) edge. R-118 (Climate Adaptability / Future Weather Resilience)
 * states that buildings modelled only on historical weather data miss projected
 * future climate shifts; at floor-plan level, a plan with primary habitable rooms
 * on only one solar orientation cannot adapt occupant behaviour to variable climate
 * conditions (shifting rooms, shading strategies) across heating and cooling seasons.
 * Assumption: top = north, bottom = south.
 * Rulebook ref: R-118 (Climate Adaptability / Dual Orientation)
 */
const RB_118: RuleCheck = {
  id: 'RB-118',
  ruleId: 'R-118',
  title: 'Dual Orientation Habitable',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 5,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 5) return [];
    const PRIMARY = new Set(['living', 'living room', 'dining', 'bedroom', 'kitchen']);
    const primary = rooms.filter(r => PRIMARY.has(r.type.toLowerCase()));
    if (primary.length === 0) return [];
    const tol = 0.5;
    const hasNorth = primary.some(r => r.y <= tol);
    const hasSouth = primary.some(r => r.y + r.height >= ctx.dimD - tol);
    if (hasNorth && hasSouth) return [];
    const missing = !hasNorth ? 'north (top)' : 'south (bottom)';
    return [{
      code: 'RB-118',
      severity: 'info',
      message: `No primary habitable room touches the ${missing} facade. A plan with habitable rooms on only one solar orientation cannot adapt to variable climate conditions across heating and cooling seasons (R-118).`,
      roomIds: primary.map(r => r.id),
      value: hasNorth && hasSouth ? 2 : 1,
      threshold: 2,
    }];
  },
};

/**
 * RB-119 — GREEN_BUFFER_AREA
 * In plans with ≥ 6 rooms, 'other' rooms (outdoor courtyard / green space proxy)
 * must be present and constitute ≥ 5% of total room area. R-119 (Heat Island /
 * Permeable Surface) requires that urban buildings provide permeable surfaces and
 * vegetative cover to mitigate heat-island effects; at floor-plan scale, a ≥ 6-room
 * plan with no outdoor/green buffer space (or a token space < 5% of area) makes no
 * provision for on-site permeable or vegetated area, directly contributing to
 * localised heat-island amplification. The 5% minimum is derived from LEED
 * Sustainable Sites credit thresholds for on-site open space.
 * Distinct from RB-097 (presence check for ≥ 5-room plans with ≥ 2 bedrooms).
 * Rulebook ref: R-119 (Heat Island / Green Buffer)
 */
const RB_119: RuleCheck = {
  id: 'RB-119',
  ruleId: 'R-119',
  title: 'Green Buffer Area',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 6,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 6) return [];
    const otherRooms = rooms.filter(r => r.type === 'other');
    const totalArea = rooms.reduce((s, r) => s + roomArea(r), 0);
    const otherArea = otherRooms.reduce((s, r) => s + roomArea(r), 0);
    const ratio = totalArea > 0 ? otherArea / totalArea : 0;
    if (ratio >= 0.05) return [];
    return [{
      code: 'RB-119',
      severity: 'info',
      message: `'Other' (outdoor/green buffer) rooms account for ${Math.round(ratio * 100)}% of total room area (threshold: ≥ 5%). A ≥ 6-room plan with insufficient permeable/vegetated space contributes to heat-island amplification — include at least 5% of plan area as outdoor/green buffer (R-119).`,
      roomIds: otherRooms.map(r => r.id),
      value: Math.round(ratio * 100),
      threshold: 5,
    }];
  },
};

/**
 * RB-120 — MODULAR_DIMENSION_ALIGNMENT
 * Every room's width and height should be within 0.25 ft (0.075 m for metric) of
 * a whole-unit value. R-120 (Construction Documents / Nominal Lumber Dimensions)
 * requires that CDs use standard modular dimensions to avoid field substitutions;
 * non-modular room dimensions (e.g. 10.33 ft, 9.67 ft) indicate residual division
 * artifacts that are not aligned to standard framing modules (1-ft stud spacing,
 * 2-ft panel multiples, 8-in masonry coursing) and will cause coordination issues
 * between structural drawings and shop drawings. The 0.25 ft (3 inch) tolerance
 * allows for standard tolerances in layout dimensions.
 * Rulebook ref: R-120 (Construction Documents / Dimensional Coordination)
 */
const RB_120: RuleCheck = {
  id: 'RB-120',
  ruleId: 'R-120',
  title: 'Modular Dimension Alignment',
  severity: 'warning',
  applies: () => true,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const tol = ctx.units === 'meters' ? 0.075 : 0.25;
    const violations: Violation[] = [];
    for (const r of rooms) {
      const wDev = Math.abs(r.width  - Math.round(r.width));
      const hDev = Math.abs(r.height - Math.round(r.height));
      if (wDev > tol || hDev > tol) {
        const bad: string[] = [];
        if (wDev > tol) bad.push(`width ${r.width.toFixed(2)}`);
        if (hDev > tol) bad.push(`height ${r.height.toFixed(2)}`);
        violations.push({
          code: 'RB-120',
          severity: 'warning',
          message: `${roomLabel(r)} has non-modular dimension(s): ${bad.join(', ')} ${ctx.units}. Room dimensions should be within 0.25 ${ctx.units === 'meters' ? 'm' : 'ft'} of a whole-unit value to align with standard framing and masonry modules (R-120).`,
          roomIds: [r.id],
          value: Math.max(wDev, hDev),
          threshold: tol,
        });
      }
    }
    return violations;
  },
};

// ── RB-121..RB-130 ────────────────────────────────────────────────────────────

/**
 * RB-121 — SUBMITTAL_SERVICE_SPACE
 * In plans with ≥ 5 rooms and ≥ 4 distinct room types, at least one room of
 * type utility, storage, or laundry must be present. R-121 (Shop Drawing
 * Substantive Review) requires that MEP shop drawings be reviewed against a
 * documented design intent. Without a dedicated service space in the plan, MEP
 * systems are retrofitted into habitable rooms, making it impossible to track
 * submittals against a defined service zone. Distinct from RB-097 ('other'
 * presence) and RB-098 (room type diversity count).
 * Rulebook ref: R-121 (Construction Administration / Shop Drawing Review)
 */
const RB_121: RuleCheck = {
  id: 'RB-121',
  ruleId: 'R-121',
  title: 'Submittal Service Space',
  severity: 'info',
  applies: layout => {
    const valid = layout.rooms.filter(r => r.width > 0 && r.height > 0);
    const types = new Set(valid.map(r => r.type));
    return valid.length >= 5 && types.size >= 4;
  },
  check(layout) {
    const rooms = validRooms(layout);
    if (rooms.length < 5) return [];
    const types = new Set(rooms.map(r => r.type));
    if (types.size < 4) return [];
    const SERVICE = new Set(['utility', 'storage', 'laundry']);
    const hasService = rooms.some(r => SERVICE.has(r.type));
    if (hasService) return [];
    return [{
      code: 'RB-121',
      severity: 'info',
      message: `Plan has ${rooms.length} rooms and ${types.size} distinct types but no service room (utility, storage, or laundry). A dedicated service space is required for MEP shop drawing coordination in complex plans (R-121).`,
      roomIds: [],
      suggestedFixes: [{ type: 'addRoom', roomType: 'utility' }],
    }];
  },
};

/**
 * RB-122 — MAX_MEDIAN_ROOM_RATIO
 * In plans with ≥ 4 rooms, the largest room area must be ≤ 5.0× the median
 * room area. R-122 (Value Engineering Timing Constraint) requires VE before
 * CDs are complete. A plan where the largest room exceeds 5× the median is a
 * signal that one over-programmed space was never rationalized against the rest
 * of the program — the condition VE is designed to catch in SD/DD. The 5:1
 * limit reflects typical residential programs where the living area (largest
 * habitable room) is ≤ 4–5× a bedroom (median room). Distinct from RB-105
 * (max-to-total area ratio ≤ 35%).
 * Rulebook ref: R-122 (Value Engineering / Program Rationalization)
 */
const RB_122: RuleCheck = {
  id: 'RB-122',
  ruleId: 'R-122',
  title: 'Max Median Room Ratio',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 4,
  check(layout) {
    const rooms = validRooms(layout);
    if (rooms.length < 4) return [];
    const areas = rooms.map(roomArea).sort((a, b) => a - b);
    const mid = Math.floor(areas.length / 2);
    const median = areas.length % 2 === 0
      ? (areas[mid - 1] + areas[mid]) / 2
      : areas[mid];
    const maxArea = areas[areas.length - 1];
    const ratio = median > 0 ? maxArea / median : 1;
    if (ratio <= 5.0) return [];
    const largest = rooms.reduce((a, b) => roomArea(a) >= roomArea(b) ? a : b);
    return [{
      code: 'RB-122',
      severity: 'info',
      message: `Largest room (${roomLabel(largest)}, ${maxArea.toFixed(0)} sq ft) is ${ratio.toFixed(1)}× the median room area (${median.toFixed(0)} sq ft) — exceeds 5:1 max/median ratio. An over-programmed room that dominates the plan signals a program that was not value-engineered before CDs (R-122).`,
      roomIds: [largest.id],
      value: Math.round(ratio * 10) / 10,
      threshold: 5.0,
    }];
  },
};

/**
 * RB-123 — PROGRAM_TYPE_CONCENTRATION
 * In plans with ≥ 5 rooms, no single room type may account for > 60% of the
 * total room count. R-123 (Long-Lead Item Procurement Planning) requires that
 * all project systems be identified during design development — this requires a
 * complete, diverse room program. A plan where > 60% of rooms share a single
 * type (e.g., all bedrooms) represents an incomplete DD program; without a
 * complete room mix, the structural, MEP, and specialty systems that drive
 * long-lead procurement cannot be identified. The 60% threshold allows
 * residential plans with multiple bedrooms while flagging degenerate
 * single-type plans. Distinct from RB-098 (requires ≥ 4 distinct types).
 * Rulebook ref: R-123 (Construction / Long-Lead Item Procurement)
 */
const RB_123: RuleCheck = {
  id: 'RB-123',
  ruleId: 'R-123',
  title: 'Program Type Concentration',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 5,
  check(layout) {
    const rooms = validRooms(layout);
    if (rooms.length < 5) return [];
    const counts = new Map<string, number>();
    for (const r of rooms) counts.set(r.type, (counts.get(r.type) ?? 0) + 1);
    let maxType = '';
    let maxCount = 0;
    for (const [type, count] of counts) {
      if (count > maxCount) { maxCount = count; maxType = type; }
    }
    const pct = maxCount / rooms.length;
    if (pct <= 0.6) return [];
    return [{
      code: 'RB-123',
      severity: 'info',
      message: `Room type '${maxType}' accounts for ${maxCount} of ${rooms.length} rooms (${Math.round(pct * 100)}% > 60% threshold). A program dominated by a single room type is incomplete — long-lead structural and MEP systems cannot be identified without a diverse room program (R-123).`,
      roomIds: rooms.filter(r => r.type === maxType).map(r => r.id),
      value: Math.round(pct * 100),
      threshold: 60,
    }];
  },
};

/**
 * RB-124 — LONG_SPAN_ROOM_FLAG
 * Any room with a longer dimension > 22 ft (6.7 m) requires structural
 * specification beyond standard dimensional lumber. R-124 (Wood Specification:
 * Species, Grade, Treatment) requires that all structural wood elements be
 * specified with species, grade, and treatment. Rooms spanning > 22 ft exceed
 * the clear-span limit for No. 2 Douglas Fir-Larch 2×12 floor joists at
 * standard spacing, implying engineered lumber (LVL, PSL) or mass timber
 * (glulam) — members that require explicit species, grade, and treatment
 * equivalents. The 22 ft / 6.7 m threshold is the outer limit for standard
 * dimensional lumber at typical residential loading. Distinct from RB-115
 * (shorter dimension ≤ 25 ft for daylighting).
 * Rulebook ref: R-124 (Wood / Species-Grade-Treatment Specification)
 */
const RB_124: RuleCheck = {
  id: 'RB-124',
  ruleId: 'R-124',
  title: 'Long Span Room Flag',
  severity: 'info',
  applies: () => true,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const maxSpan = ctx.units === 'meters' ? 6.7 : 22;
    const violations: Violation[] = [];
    for (const r of rooms) {
      const longer = Math.max(r.width, r.height);
      if (longer > maxSpan) {
        violations.push({
          code: 'RB-124',
          severity: 'info',
          message: `${roomLabel(r)} has a longer dimension of ${longer.toFixed(1)} ${ctx.units}, exceeding the ${maxSpan} ${ctx.units} standard-lumber span limit. Rooms this wide require engineered lumber or mass timber members that must be specified with species, grade, and treatment (R-124).`,
          roomIds: [r.id],
          value: longer,
          threshold: maxSpan,
        });
      }
    }
    return violations;
  },
};

/**
 * RB-125 — INTERIOR_ROOM_MIN_ADJACENCY
 * In plans with ≥ 4 rooms, every interior room (a room not touching any
 * exterior boundary) must be adjacent to ≥ 2 other rooms. R-125 (Lumber
 * Moisture Content: KD Specification) requires that framing lumber arrive and
 * remain at MC ≤ 19%. An interior room with only 1 adjacency (dead-end pocket)
 * cannot be cross-ventilated during construction or occupancy — trapped
 * humidity prevents framing lumber from drying to equilibrium MC, amplifying
 * post-installation shrinkage defects. Minimum 2 adjacencies ensures each
 * interior room has multiple openings for moisture management. Distinct from
 * RB-099 (hall hub connectivity ≥ 3) and RB-114 (minimum plan depth).
 * Rulebook ref: R-125 (Lumber / Moisture Content and KD Specification)
 */
const RB_125: RuleCheck = {
  id: 'RB-125',
  ruleId: 'R-125',
  title: 'Interior Room Min Adjacency',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 4,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 4) return [];
    const violations: Violation[] = [];
    for (const r of rooms) {
      if (touchesExterior(r, ctx.dimW, ctx.dimD)) continue;
      const adjCount = rooms.filter(other => other.id !== r.id && roomsAreAdjacent(r, other)).length;
      if (adjCount < 2) {
        violations.push({
          code: 'RB-125',
          severity: 'info',
          message: `${roomLabel(r)} is an interior room with only ${adjCount} adjacenc${adjCount === 1 ? 'y' : 'ies'} — interior rooms need ≥ 2 adjacencies to allow cross-ventilation and prevent moisture accumulation in framing lumber (R-125).`,
          roomIds: [r.id],
          value: adjCount,
          threshold: 2,
        });
      }
    }
    return violations;
  },
};

/**
 * RB-126 — PERIMETER_SERVICE_ISOLATION
 * A storage or utility room that touches the exterior boundary must be adjacent
 * to ≥ 2 other rooms. R-126 (Pressure Treatment for Hazardous Contact
 * Conditions) requires wood in ground-contact or weather-exposed conditions to
 * be pressure-treated. At floor-plan scale, a storage or utility room that
 * touches the exterior boundary but has ≤ 1 room adjacency is analogous to a
 * standalone outbuilding — it has direct exposure to moisture and temperature
 * gradients without the insulating buffer of adjacent conditioned spaces. At
 * least 2 room adjacencies provide the surrounding conditioned-space buffer
 * that reduces ground-contact moisture risk. Distinct from RB-106 (interior
 * buffer room at any facade) and RB-102 (outdoor room exterior access).
 * Rulebook ref: R-126 (Wood / Pressure Treatment for Hazardous Conditions)
 */
const RB_126: RuleCheck = {
  id: 'RB-126',
  ruleId: 'R-126',
  title: 'Perimeter Service Isolation',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r =>
      (r.type === 'storage' || r.type === 'utility') && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const SERVICE = new Set(['storage', 'utility']);
    const violations: Violation[] = [];
    for (const r of rooms) {
      if (!SERVICE.has(r.type)) continue;
      if (!touchesExterior(r, ctx.dimW, ctx.dimD)) continue;
      const adjCount = rooms.filter(other => other.id !== r.id && roomsAreAdjacent(r, other)).length;
      if (adjCount < 2) {
        violations.push({
          code: 'RB-126',
          severity: 'info',
          message: `${roomLabel(r)} (${r.type}) touches the exterior boundary with only ${adjCount} room adjacenc${adjCount === 1 ? 'y' : 'ies'}. An isolated perimeter service room has direct moisture exposure without a conditioned-space buffer — wood at this location must be pressure-treated or the room must be flanked by at least 2 conditioned rooms (R-126).`,
          roomIds: [r.id],
          value: adjCount,
          threshold: 2,
        });
      }
    }
    return violations;
  },
};

/**
 * RB-127 — SHORT_DIM_RANGE_LIMIT
 * In plans with ≥ 3 rooms, the difference between the largest and smallest
 * shorter-dimension across all rooms must be ≤ 15 ft (4.6 m). R-127 (Wood
 * Shrinkage Detailing at Cross-Grain Connections) warns that differential
 * shrinkage at cross-grain connections causes joint gaps, nail pops, and
 * out-of-plumb conditions. A floor plan with extreme variation in room depths
 * (short dimensions) packs structural bays of wildly different depths side by
 * side — the cross-grain wood at the shallower-to-deeper transitions
 * experiences the greatest differential shrinkage. The 15 ft / 4.6 m range
 * limit flags plans where structural bay depth variation creates high-risk
 * shrinkage joints. Distinct from RB-104 (plan form aspect ratio).
 * Rulebook ref: R-127 (Wood / Shrinkage Detailing at Cross-Grain Connections)
 */
const RB_127: RuleCheck = {
  id: 'RB-127',
  ruleId: 'R-127',
  title: 'Short Dim Range Limit',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 3,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 3) return [];
    const shortDims = rooms.map(r => Math.min(r.width, r.height));
    const maxShort = Math.max(...shortDims);
    const minShort = Math.min(...shortDims);
    const range = maxShort - minShort;
    const maxRange = ctx.units === 'meters' ? 4.6 : 15;
    if (range <= maxRange) return [];
    const deepest  = rooms[shortDims.indexOf(maxShort)];
    const shallowest = rooms[shortDims.indexOf(minShort)];
    return [{
      code: 'RB-127',
      severity: 'info',
      message: `Room short-dimension range is ${range.toFixed(1)} ${ctx.units} (from ${minShort.toFixed(1)} to ${maxShort.toFixed(1)} ${ctx.units}), exceeding the ${maxRange} ${ctx.units} limit. Extreme variation in structural bay depths amplifies differential wood shrinkage at cross-grain connections across the plan (R-127).`,
      roomIds: [deepest.id, shallowest.id],
      value: range,
      threshold: maxRange,
    }];
  },
};

/**
 * RB-128 — THREE_FACADE_COVERAGE
 * In plans with ≥ 4 rooms, rooms must touch ≥ 3 of the 4 exterior boundary
 * segments (left, right, top, bottom). R-128 (Shear Wall Nailing Schedule
 * Specification) requires distributed shear walls specified on the drawings.
 * At floor-plan scale, shear walls are located at room perimeter boundaries;
 * a plan where rooms contact only 1–2 exterior edges concentrates all lateral
 * resistance on those faces, creating an unbalanced diaphragm. Rooms on ≥ 3
 * faces indicate that perimeter structural walls are distributed around the
 * plan for balanced shear resistance. Distinct from RB-110 (all 4 faces,
 * ≥ 6 rooms) and RB-112 (one opposing pair, ≥ 4 rooms).
 * Rulebook ref: R-128 (Wood / Shear Wall Nailing Schedule)
 */
const RB_128: RuleCheck = {
  id: 'RB-128',
  ruleId: 'R-128',
  title: 'Three Facade Coverage',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 4,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 4) return [];
    const tol = 0.5;
    const hasLeft   = rooms.some(r => r.x <= tol);
    const hasRight  = rooms.some(r => r.x + r.width  >= ctx.dimW - tol);
    const hasTop    = rooms.some(r => r.y <= tol);
    const hasBottom = rooms.some(r => r.y + r.height >= ctx.dimD - tol);
    const facadeCount = [hasLeft, hasRight, hasTop, hasBottom].filter(Boolean).length;
    if (facadeCount >= 3) return [];
    const missing: string[] = [];
    if (!hasLeft)   missing.push('left');
    if (!hasRight)  missing.push('right');
    if (!hasTop)    missing.push('top');
    if (!hasBottom) missing.push('bottom');
    return [{
      code: 'RB-128',
      severity: 'info',
      message: `Rooms touch only ${facadeCount} of 4 exterior edges (missing: ${missing.join(', ')}). A ≥ 4-room plan with rooms on < 3 facades concentrates lateral resistance on too few faces — shear walls should be distributed on at least 3 sides for balanced diaphragm loading (R-128).`,
      roomIds: [],
      value: facadeCount,
      threshold: 3,
    }];
  },
};

/**
 * RB-129 — MINIMUM_ROOM_SHORT_DIM
 * No room should have a shorter dimension < 6 ft (1.8 m). R-129 (Mass Timber
 * Minimum Member Dimensions for Code Fire Resistance) specifies a minimum
 * 6-in cross-section for exposed heavy-timber members (IBC Chapter 23). At
 * floor-plan scale, a room with a shorter dimension < 6 ft cannot accommodate
 * standard mass timber or heavy timber framing — the minimum structural bay
 * clear dimension for heavy timber construction is 6 ft. Rooms narrower than
 * this imply light-frame conditions where mass timber fire-resistance
 * provisions do not apply, creating a dimensional mismatch with any mass
 * timber specification on the drawings. Distinct from RB-060 (bedroom min
 * width ≥ 8 ft) and RB-003 (aspect ratio sliver ≥ 5:1).
 * Rulebook ref: R-129 (Mass Timber / Minimum Member Dimensions for Fire Resistance)
 */
const RB_129: RuleCheck = {
  id: 'RB-129',
  ruleId: 'R-129',
  title: 'Minimum Room Short Dim',
  severity: 'info',
  applies: () => true,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const minShort = ctx.units === 'meters' ? 1.8 : 6;
    const violations: Violation[] = [];
    for (const r of rooms) {
      const shorter = Math.min(r.width, r.height);
      if (shorter < minShort) {
        violations.push({
          code: 'RB-129',
          severity: 'info',
          message: `${roomLabel(r)} has a shorter dimension of ${shorter.toFixed(1)} ${ctx.units}, below the ${minShort} ${ctx.units} minimum structural bay dimension for heavy timber / mass timber framing. Rooms narrower than this cannot accommodate code-compliant mass timber members (R-129).`,
          roomIds: [r.id],
          value: shorter,
          threshold: minShort,
        });
      }
    }
    return violations;
  },
};

/**
 * RB-130 — BEDROOM_LIVING_ACOUSTIC_BUFFER
 * When a plan contains at least one bedroom and at least one living or dining
 * room, no bedroom may be directly adjacent to a living or dining room. R-130
 * (Mass Timber Floor Assembly Acoustic Mitigation) identifies the direct
 * adjacency of acoustically incompatible spaces — lively hard-surface rooms
 * (living, dining) next to quiet sleeping rooms (bedroom) — as the primary
 * floor-plan condition that drives IIC/STC failures in mass timber
 * construction. A bathroom, hall, storage, or laundry room between them acts
 * as the acoustic buffer analogous to the concrete topping or resilient
 * underlayment required by R-130. Distinct from RB-013 (bedroom not adjacent
 * to kitchen).
 * Rulebook ref: R-130 (Mass Timber / Floor Assembly Acoustic Mitigation)
 */
const RB_130: RuleCheck = {
  id: 'RB-130',
  ruleId: 'R-130',
  title: 'Bedroom Living Acoustic Buffer',
  severity: 'info',
  applies: layout =>
    layout.rooms.some(r => r.type === 'bedroom' && r.width > 0 && r.height > 0) &&
    layout.rooms.some(r => (r.type === 'living' || r.type === 'living room' || r.type === 'dining') && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const beds = rooms.filter(r => r.type === 'bedroom');
    const LIVING_DINING = new Set(['living', 'living room', 'dining']);
    const liveRooms = rooms.filter(r => LIVING_DINING.has(r.type));
    if (beds.length === 0 || liveRooms.length === 0) return [];
    const violations: Violation[] = [];
    for (const b of beds) {
      for (const l of liveRooms) {
        if (roomsAreAdjacent(b, l)) {
          violations.push({
            code: 'RB-130',
            severity: 'info',
            message: `${roomLabel(b)} is directly adjacent to ${roomLabel(l)} (${l.type}) — a quiet sleeping room next to a lively living/dining room without an acoustic buffer (bathroom, hall, or storage) replicates the IIC/STC failure condition identified for mass timber floor assemblies (R-130).`,
            roomIds: [b.id, l.id],
            suggestedFixes: [{ type: 'swapRooms', roomIdA: b.id, roomIdB: l.id }],
          });
        }
      }
    }
    return violations;
  },
};

/**
 * RB-131 — JOIST_SPAN_SHORT_DIM
 * No room shorter dimension should exceed 14 ft (4.3 m). In light wood frame
 * platform construction, standard 2×12 dimensional lumber floor joists at 16"
 * on-center (No. 2 Douglas Fir-Larch) reach their allowable span limit at
 * approximately 14 ft under 40-psf live load (L/360 deflection criterion).
 * Beyond this, engineered joists (TJI, LVL) are required — a change of
 * framing system beyond basic platform frame. The room shorter dimension
 * approximates the dominant joist span direction. Applies unconditionally.
 * Distinct from RB-124 (longer dimension > 22 ft triggering structural spec)
 * and RB-115 (shorter dimension ≤ 25 ft for daylighting).
 * Rulebook ref: R-131 (Light Wood Frame / Floor Joist Span Limits)
 */
const RB_131: RuleCheck = {
  id: 'RB-131',
  ruleId: 'R-131',
  title: 'Joist Span Short Dim',
  severity: 'info',
  applies: () => true,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const maxShort = ctx.units === 'meters' ? 4.3 : 14;
    const violations: Violation[] = [];
    for (const r of rooms) {
      const shorter = Math.min(r.width, r.height);
      if (shorter > maxShort) {
        violations.push({
          code: 'RB-131',
          severity: 'info',
          message: `${roomLabel(r)} has a shorter dimension of ${shorter.toFixed(1)} ${ctx.units}, exceeding the ${maxShort} ${ctx.units} standard floor joist span limit for light wood frame construction. Beyond this span, engineered joists (TJI, LVL) are required — a change of framing system beyond basic platform frame (R-131).`,
          roomIds: [r.id],
          value: shorter,
          threshold: maxShort,
        });
      }
    }
    return violations;
  },
};

/**
 * RB-132 — BIDIRECTIONAL_PARTITIONS
 * In plans with ≥ 4 rooms, interior partitions must run in both principal
 * directions (at least one vertical shared edge and one horizontal shared edge
 * between rooms). R-132 (Light Wood Frame / Interior Bearing Wall Layout)
 * specifies that platform-frame bearing walls must be present in both
 * directions to create a two-way load path. A plan where all room boundaries
 * share only one axis results in a one-way spanning floor system that exceeds
 * the capacity of standard dimensional lumber in the unsupported direction.
 * Distinct from RB-128 (exterior facade coverage).
 * Rulebook ref: R-132 (Light Wood Frame / Interior Bearing Wall Layout)
 */
const RB_132: RuleCheck = {
  id: 'RB-132',
  ruleId: 'R-132',
  title: 'Bidirectional Partitions',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 4,
  check(layout) {
    const rooms = validRooms(layout);
    if (rooms.length < 4) return [];
    const tol = 0.5;
    let hasVertical = false;
    let hasHorizontal = false;
    outer:
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i], b = rooms[j];
        if (!hasVertical) {
          const vertEdge =
            (Math.abs(a.x + a.width - b.x) <= tol || Math.abs(b.x + b.width - a.x) <= tol) &&
            a.y < b.y + b.height - tol && a.y + a.height > b.y + tol;
          if (vertEdge) hasVertical = true;
        }
        if (!hasHorizontal) {
          const horizEdge =
            (Math.abs(a.y + a.height - b.y) <= tol || Math.abs(b.y + b.height - a.y) <= tol) &&
            a.x < b.x + b.width - tol && a.x + a.width > b.x + tol;
          if (horizEdge) hasHorizontal = true;
        }
        if (hasVertical && hasHorizontal) break outer;
      }
    }
    if (hasVertical && hasHorizontal) return [];
    const missing: string[] = [];
    if (!hasVertical) missing.push('vertical (left/right)');
    if (!hasHorizontal) missing.push('horizontal (top/bottom)');
    return [{
      code: 'RB-132',
      severity: 'info',
      message: `Plan has ≥ 4 rooms but interior partitions run in only one principal direction (missing: ${missing.join(', ')} shared walls). Platform-frame bearing walls must be present in both directions to create a two-way load path; a single-axis partition layout produces a one-way spanning floor system beyond standard dimensional lumber capacity in the unsupported direction (R-132).`,
      roomIds: [],
    }];
  },
};

/**
 * RB-133 — UTILITY_PLUMBING_CLUSTER
 * When a plan contains a kitchen and at least one bathroom, laundry, or
 * utility room, the kitchen must be adjacent to at least one of those wet
 * rooms. R-133 (Light Wood Frame / Plumbing Stack Consolidation) requires
 * that plumbing fixtures share a single stack (or as few stacks as possible)
 * within platform-frame cost and structural limits. Adjacent wet rooms share
 * a single wet wall — a framed cavity containing back-to-back supply and
 * drain lines on a single stack. Non-adjacent kitchen and bath layouts force
 * a second independent stack, adding cost and structural penetrations.
 * Distinct from RB-013 (kitchen not adjacent to bedroom) and RB-126
 * (perimeter service room isolation).
 * Rulebook ref: R-133 (Light Wood Frame / Plumbing Stack Consolidation)
 */
const RB_133: RuleCheck = {
  id: 'RB-133',
  ruleId: 'R-133',
  title: 'Utility Plumbing Cluster',
  severity: 'info',
  applies: layout => {
    const vr = layout.rooms.filter(r => r.width > 0 && r.height > 0);
    const WET = new Set(['bathroom', 'laundry', 'utility']);
    return vr.some(r => r.type === 'kitchen') && vr.some(r => WET.has(r.type));
  },
  check(layout) {
    const rooms = validRooms(layout);
    const WET = new Set(['bathroom', 'laundry', 'utility']);
    const kitchens = rooms.filter(r => r.type === 'kitchen');
    const wetRooms = rooms.filter(r => WET.has(r.type));
    if (kitchens.length === 0 || wetRooms.length === 0) return [];
    const violations: Violation[] = [];
    for (const k of kitchens) {
      const adjacentToWet = wetRooms.some(w => roomsAreAdjacent(k, w));
      if (!adjacentToWet) {
        violations.push({
          code: 'RB-133',
          severity: 'info',
          message: `${roomLabel(k)} is not adjacent to any bathroom, laundry, or utility room. In platform-frame construction, kitchen and wet rooms must share a common wet wall to consolidate plumbing onto a single stack; non-adjacent wet rooms require a second independent stack, adding framing penetrations and cost (R-133).`,
          roomIds: [k.id],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-134 — CLOSET_MIN_AREA
 * Closet rooms must have an area ≥ 16 sq ft (1.5 m²). R-134 (Light Wood
 * Frame / Built-In Storage Sizing) specifies the minimum closet area for
 * standard 24-inch-deep rod-and-shelf systems. A 4 ft × 4 ft (16 sq ft)
 * closet is the smallest configuration that accommodates a rod-and-shelf
 * unit on one wall with a 24-inch-deep shelf plus a 24-inch clear access
 * aisle — the minimum functional walk-in in platform-frame residential
 * construction. Closets smaller than this are wall niches, not framed rooms,
 * and are structurally inefficient within a stud-bay layout.
 * Distinct from RB-129 (mass timber minimum short dim 6 ft).
 * Rulebook ref: R-134 (Light Wood Frame / Built-In Storage Sizing)
 */
const RB_134: RuleCheck = {
  id: 'RB-134',
  ruleId: 'R-134',
  title: 'Closet Min Area',
  severity: 'info',
  applies: layout => layout.rooms.some(r => r.type === 'closet' && r.width > 0 && r.height > 0),
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const closets = rooms.filter(r => r.type === 'closet');
    if (closets.length === 0) return [];
    const minArea = ctx.units === 'meters' ? 1.5 : 16;
    const violations: Violation[] = [];
    for (const c of closets) {
      const area = roomArea(c);
      if (area < minArea) {
        violations.push({
          code: 'RB-134',
          severity: 'info',
          message: `${roomLabel(c)} has an area of ${area.toFixed(1)} sq ${ctx.units} (${c.width.toFixed(1)} × ${c.height.toFixed(1)}), below the ${minArea} sq ${ctx.units} minimum for a functional rod-and-shelf closet in platform-frame construction. Closets smaller than 4 × 4 ft cannot accommodate standard 24-in-deep built-in storage and a clear access aisle (R-134).`,
          roomIds: [c.id],
          value: area,
          threshold: minArea,
        });
      }
    }
    return violations;
  },
};

/**
 * RB-135 — BEDROOM_BATH_RATIO
 * In plans with ≥ 2 bedrooms and ≥ 1 bathroom, the number of bathrooms must
 * not exceed the number of bedrooms + 1. R-135 (Light Wood Frame / Residential
 * Program Balance) reflects standard residential platform-frame programming:
 * the maximum is one bathroom per bedroom plus one shared/powder room.
 * Exceeding this ratio forces additional plumbing stacks, increasing structural
 * penetrations beyond the capacity of a standard platform-frame floor/ceiling
 * assembly. Distinct from RB-097 (room type count thresholds) and RB-133
 * (plumbing stack consolidation).
 * Rulebook ref: R-135 (Light Wood Frame / Residential Program Balance)
 */
const RB_135: RuleCheck = {
  id: 'RB-135',
  ruleId: 'R-135',
  title: 'Bedroom Bath Ratio',
  severity: 'info',
  applies: layout => {
    const vr = layout.rooms.filter(r => r.width > 0 && r.height > 0);
    return (
      vr.filter(r => r.type === 'bedroom').length >= 2 &&
      vr.some(r => r.type === 'bathroom')
    );
  },
  check(layout) {
    const rooms = validRooms(layout);
    const bedCount  = rooms.filter(r => r.type === 'bedroom').length;
    const bathCount = rooms.filter(r => r.type === 'bathroom').length;
    if (bedCount < 2 || bathCount === 0) return [];
    if (bathCount <= bedCount + 1) return [];
    return [{
      code: 'RB-135',
      severity: 'info',
      message: `Plan has ${bathCount} bathroom(s) and ${bedCount} bedroom(s); bathrooms exceed the maximum of bedrooms + 1 (${bedCount + 1}). Over-programming wet areas forces additional plumbing stacks beyond the capacity of a standard platform-frame floor-ceiling assembly (R-135).`,
      roomIds: rooms.filter(r => r.type === 'bathroom').map(r => r.id),
      value: bathCount,
      threshold: bedCount + 1,
    }];
  },
};

/**
 * RB-136 — ENTRY_REQUIRED
 * Plans with ≥ 5 rooms must include at least one room of type 'entry',
 * 'foyer', 'vestibule', or 'hall'. R-136 (Light Wood Frame / Entry and
 * Threshold Design) requires a dedicated transition space at the primary
 * building entrance. Without a separate entry or hall, the building envelope
 * cannot achieve the air-lock effect that limits conditioned-air loss during
 * door operation — a baseline requirement for the thermal performance of a
 * platform-frame exterior wall assembly. In plans with ≥ 5 rooms, program
 * complexity implies a full residential occupancy where this transition is
 * required. Distinct from RB-099 (hall hub connectivity ≥ 3) and RB-121
 * (service space requirement).
 * Rulebook ref: R-136 (Light Wood Frame / Entry and Threshold Design)
 */
const RB_136: RuleCheck = {
  id: 'RB-136',
  ruleId: 'R-136',
  title: 'Entry Required',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 5,
  check(layout) {
    const rooms = validRooms(layout);
    if (rooms.length < 5) return [];
    const ENTRY_TYPES = new Set(['entry', 'foyer', 'vestibule', 'hall']);
    if (rooms.some(r => ENTRY_TYPES.has(r.type))) return [];
    return [{
      code: 'RB-136',
      severity: 'info',
      message: `Plan has ${rooms.length} rooms but no dedicated entry, foyer, vestibule, or hall. In platform-frame residential construction, a ≥ 5-room program requires a transition space at the main entry to maintain the air-lock effect of the exterior wall assembly and prevent conditioned-air loss during door operation (R-136).`,
      roomIds: [],
    }];
  },
};

/**
 * RB-137 — GARAGE_FIRE_SEPARATION
 * When a garage room is present, it must be adjacent to at least one
 * non-garage room. R-137 (Light Wood Frame / Garage Fire Separation) requires
 * a rated fire-separation wall between an attached garage and habitable space.
 * The fire-separation wall is always a shared wall between the garage and an
 * adjacent room within the plan. A garage with no adjacent rooms cannot define
 * this fire wall and does not meet the platform-frame residential fire
 * separation requirement. Distinct from RB-001 (garage area ratio ≤ 25%)
 * and RB-126 (perimeter service room isolation).
 * Rulebook ref: R-137 (Light Wood Frame / Garage Fire Separation)
 */
const RB_137: RuleCheck = {
  id: 'RB-137',
  ruleId: 'R-137',
  title: 'Garage Fire Separation',
  severity: 'warning',
  applies: layout =>
    layout.rooms.some(r => r.type === 'garage' && r.width > 0 && r.height > 0),
  check(layout) {
    const rooms = validRooms(layout);
    const garages    = rooms.filter(r => r.type === 'garage');
    const nonGarages = rooms.filter(r => r.type !== 'garage');
    if (garages.length === 0) return [];
    const violations: Violation[] = [];
    for (const g of garages) {
      const hasAdjacentRoom = nonGarages.some(r => roomsAreAdjacent(g, r));
      if (!hasAdjacentRoom) {
        violations.push({
          code: 'RB-137',
          severity: 'warning',
          message: `${roomLabel(g)} is not adjacent to any non-garage room. An attached garage requires a rated fire-separation wall shared with an adjacent habitable space; a garage with no adjacency in the plan cannot define this fire wall and does not meet the platform-frame residential fire separation requirement (R-137).`,
          roomIds: [g.id],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-138 — INTERIOR_ROOM_SHARE_MAX
 * In plans with ≥ 4 rooms, interior rooms (not touching any exterior boundary)
 * must not exceed 50% of the total room count. R-138 (Light Wood Frame /
 * Natural Light Distribution) requires that platform-frame residential
 * buildings provide natural light to the majority of habitable rooms through
 * exterior windows. An interior room can only borrow daylight through adjacent
 * exterior rooms; if more than half the rooms are interior, the exterior rooms
 * cannot distribute sufficient natural light to all interior spaces.
 * Distinct from RB-119 (green buffer area 5%) and RB-106 (interior buffer
 * at facade).
 * Rulebook ref: R-138 (Light Wood Frame / Natural Light Distribution)
 */
const RB_138: RuleCheck = {
  id: 'RB-138',
  ruleId: 'R-138',
  title: 'Interior Room Share Max',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 4,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 4) return [];
    const interiorRooms = rooms.filter(r => !touchesExterior(r, ctx.dimW, ctx.dimD));
    const interiorShare = interiorRooms.length / rooms.length;
    if (interiorShare <= 0.5) return [];
    return [{
      code: 'RB-138',
      severity: 'info',
      message: `${interiorRooms.length} of ${rooms.length} rooms (${Math.round(interiorShare * 100)}%) are interior rooms with no exterior boundary exposure. When more than 50% of rooms are interior, the exterior rooms cannot distribute sufficient natural light to all interior spaces under platform-frame window sizing — a platform-frame daylighting baseline violation (R-138).`,
      roomIds: interiorRooms.map(r => r.id),
      value: interiorShare,
      threshold: 0.5,
    }];
  },
};

/**
 * RB-139 — KITCHEN_LIVING_ADJACENCY
 * In plans with ≥ 4 rooms that include both a kitchen and a living or dining
 * room, the kitchen must be adjacent to at least one living or dining room.
 * R-139 (Light Wood Frame / Open-Plan Living Zone) establishes the kitchen-
 * living adjacency as the baseline spatial organization for platform-frame
 * residential construction, enabling shared HVAC returns, range exhaust
 * routing, and reducing load-bearing partitions between kitchen and living
 * areas. A kitchen isolated from the living zone requires additional
 * independent MEP routing and partitions, increasing cost and structural
 * complexity. Distinct from RB-133 (plumbing cluster / wet wall) and RB-013
 * (kitchen not adjacent to bedroom).
 * Rulebook ref: R-139 (Light Wood Frame / Open-Plan Living Zone)
 */
const RB_139: RuleCheck = {
  id: 'RB-139',
  ruleId: 'R-139',
  title: 'Kitchen Living Adjacency',
  severity: 'info',
  applies: layout => {
    const vr = layout.rooms.filter(r => r.width > 0 && r.height > 0);
    const LIVE_DINING = new Set(['living', 'living room', 'dining']);
    return (
      vr.length >= 4 &&
      vr.some(r => r.type === 'kitchen') &&
      vr.some(r => LIVE_DINING.has(r.type))
    );
  },
  check(layout) {
    const rooms = validRooms(layout);
    if (rooms.length < 4) return [];
    const LIVE_DINING = new Set(['living', 'living room', 'dining']);
    const kitchens  = rooms.filter(r => r.type === 'kitchen');
    const liveRooms = rooms.filter(r => LIVE_DINING.has(r.type));
    if (kitchens.length === 0 || liveRooms.length === 0) return [];
    const violations: Violation[] = [];
    for (const k of kitchens) {
      const adjacentToLiving = liveRooms.some(l => roomsAreAdjacent(k, l));
      if (!adjacentToLiving) {
        violations.push({
          code: 'RB-139',
          severity: 'info',
          message: `${roomLabel(k)} is not adjacent to any living or dining room. Platform-frame residential construction uses the open kitchen-living zone as a baseline spatial strategy to share HVAC returns, range exhaust, and reduce load-bearing partitions; an isolated kitchen requires additional independent MEP routing (R-139).`,
          roomIds: [k.id],
          suggestedFixes: [{ type: 'swapRooms', roomIdA: k.id, roomIdB: liveRooms[0].id }],
        });
      }
    }
    return violations;
  },
};

/**
 * RB-140 — PLAN_COVERAGE_RATIO
 * In plans with ≥ 3 rooms, total room area must be ≥ 70% of the plan bounding
 * box area (dimensions.width × dimensions.depth). R-140 (Light Wood Frame /
 * Net-to-Gross Efficiency) specifies that the net-to-gross ratio for
 * platform-frame residential construction must be ≥ 0.70 — a standard
 * residential programming threshold. Plans with total room area below 70% of
 * the gross plan area contain excessive void space that cannot be explained by
 * standard platform-frame corridor allowances (typically 10–15% of gross
 * area), signalling room layout misalignment with the structural grid.
 * Distinct from RB-119 (green buffer area 5%) and RB-105 (max room 35% of
 * total room area).
 * Rulebook ref: R-140 (Light Wood Frame / Net-to-Gross Efficiency)
 */
const RB_140: RuleCheck = {
  id: 'RB-140',
  ruleId: 'R-140',
  title: 'Plan Coverage Ratio',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 3,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 3) return [];
    const planArea = ctx.dimW * ctx.dimD;
    if (planArea <= 0) return [];
    const totalRoomArea = rooms.reduce((sum, r) => sum + roomArea(r), 0);
    const coverage = totalRoomArea / planArea;
    if (coverage >= 0.70) return [];
    return [{
      code: 'RB-140',
      severity: 'info',
      message: `Total room area (${totalRoomArea.toFixed(1)} sq ${ctx.units}) is ${Math.round(coverage * 100)}% of the ${planArea.toFixed(1)} sq ${ctx.units} plan bounding box, below the 70% net-to-gross efficiency minimum for platform-frame residential construction. Plans with < 70% coverage contain excessive unaccounted void space beyond standard corridor allowances (10–15%) (R-140).`,
      roomIds: [],
      value: coverage,
      threshold: 0.70,
    }];
  },
};

// ── RB-141..RB-145 ────────────────────────────────────────────────────────────

/**
 * RB-141 — COMMERCIAL_MEP_ZONE
 * In plans with 'office' rooms and a gross plan area ≥ 2,000 sq ft (186 m²),
 * at least one room of type 'mechanical', 'mep', or 'utility' must be present
 * to represent the MEP zone allocation required by R-141 (Floor-to-Floor Height
 * Minimum for Structural, MEP, and Finish Assembly). Commercial floor-to-floor
 * heights must budget an explicit structural zone + MEP zone (≥ 18 in for
 * standard office ductwork; 24–30 in for hospital/data-center densities).
 * Without a dedicated mechanical/MEP room in the plan, the MEP zone is
 * unaccounted in the program — the most common cause of floor-to-floor budget
 * overruns discovered at DD. Distinct from RB-121 (service space in complex
 * residential plans) and RB-144 (mechanical room area allowance sizing).
 * Rulebook ref: R-141 (Building Systems / Floor-to-Floor Height Minimum)
 */
const RB_141: RuleCheck = {
  id: 'RB-141',
  ruleId: 'R-141',
  title: 'Commercial MEP Zone',
  severity: 'info',
  applies: layout => {
    const vr = layout.rooms.filter(r => r.width > 0 && r.height > 0);
    const hasOffice = vr.some(r => r.type === 'office');
    const planArea = layout.dimensions.width * layout.dimensions.depth;
    const threshold = layout.units === 'meters' ? 186 : 2000;
    return hasOffice && planArea >= threshold;
  },
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const hasOffice = rooms.some(r => r.type === 'office');
    const planArea = ctx.dimW * ctx.dimD;
    const threshold = ctx.units === 'meters' ? 186 : 2000;
    if (!hasOffice || planArea < threshold) return [];
    const MEP_TYPES = new Set(['mechanical', 'mep', 'utility']);
    if (rooms.some(r => MEP_TYPES.has(r.type))) return [];
    return [{
      code: 'RB-141',
      severity: 'info',
      message: `Commercial plan (${planArea.toFixed(0)} sq ${ctx.units}, office occupancy) has no dedicated mechanical, mep, or utility room. Commercial floor-to-floor heights must budget an explicit MEP zone (≥ 18 in for standard office ductwork); without a service room in the program, the MEP zone is unaccounted and will force floor-to-floor revisions at DD (R-141).`,
      roomIds: [],
      suggestedFixes: [{ type: 'addRoom', roomType: 'mechanical' }],
    }];
  },
};

/**
 * RB-142 — LATERAL_SYSTEM_CORE
 * In plans with a gross area ≥ 15,000 sq ft (1,394 m²) — a scale implying
 * multi-story commercial construction — at least one room of type 'stair',
 * 'stairwell', 'elevator', 'core', or 'circulation core' must be present.
 * R-142 (Lateral System Height Limits by System Type) requires that the
 * lateral load-resisting system be matched to building height. For large
 * floor-plate buildings, the structural core (housing stairs, elevators, and
 * braced frames or shear walls) is the primary lateral system. A large-scale
 * plan without a defined core cannot be assessed for lateral system adequacy —
 * a critical SD-stage structural decision. Distinct from RB-145 (elevator
 * count threshold) and RB-127 (exterior structural module).
 * Rulebook ref: R-142 (Structural Systems / Lateral System Height Limits)
 */
const RB_142: RuleCheck = {
  id: 'RB-142',
  ruleId: 'R-142',
  title: 'Lateral System Core',
  severity: 'info',
  applies: layout => {
    const planArea = layout.dimensions.width * layout.dimensions.depth;
    const threshold = layout.units === 'meters' ? 1394 : 15000;
    return planArea >= threshold;
  },
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const planArea = ctx.dimW * ctx.dimD;
    const threshold = ctx.units === 'meters' ? 1394 : 15000;
    if (planArea < threshold) return [];
    const CORE_TYPES = new Set(['stair', 'stairwell', 'elevator', 'core', 'circulation core']);
    if (rooms.some(r => CORE_TYPES.has(r.type))) return [];
    return [{
      code: 'RB-142',
      severity: 'info',
      message: `Plan area is ${planArea.toFixed(0)} sq ${ctx.units} (≥ ${threshold.toLocaleString()} sq ${ctx.units} commercial scale) but no structural core room (stair, stairwell, elevator, or core) is present. At this scale the core is the primary lateral load-resisting element; a plan without a defined core cannot be assessed for lateral system adequacy — a critical SD-stage structural risk (R-142).`,
      roomIds: [],
      suggestedFixes: [{ type: 'addRoom', roomType: 'stair' }],
    }];
  },
};

/**
 * RB-143 — GROSS_TO_NET_EFFICIENCY
 * In plans with ≥ 3 rooms, the ratio of total room area to the gross plan
 * bounding-box area must fall within the occupancy-specific efficiency band:
 * 0.75–0.90 for commercial office plans (containing 'office' rooms);
 * 0.80–0.90 for residential plans (containing 'bedroom' rooms, no 'office');
 * 0.70–0.90 for other mixed plans. R-143 (Gross-to-Net Efficiency Targets by
 * Occupancy Type) establishes these bands as standard SD programming benchmarks.
 * Plans outside the lower bound over-allocate circulation or structural void;
 * plans above the upper bound under-allocate circulation, leaving no room for
 * walls and corridors. Distinct from RB-140 (Plan Coverage Ratio ≥ 70%
 * generic lower bound), which applies only the 70% floor; RB-143 applies
 * occupancy-specific calibration to both the lower and upper bounds.
 * Rulebook ref: R-143 (Building Systems / Gross-to-Net Efficiency Targets)
 */
const RB_143: RuleCheck = {
  id: 'RB-143',
  ruleId: 'R-143',
  title: 'Gross To Net Efficiency',
  severity: 'info',
  applies: layout =>
    layout.rooms.filter(r => r.width > 0 && r.height > 0).length >= 3,
  check(layout, ctx) {
    const rooms = validRooms(layout);
    if (rooms.length < 3) return [];
    const planArea = ctx.dimW * ctx.dimD;
    if (planArea <= 0) return [];
    const totalRoomArea = rooms.reduce((sum, r) => sum + roomArea(r), 0);
    const gtn = totalRoomArea / planArea;
    const hasOffice = rooms.some(r => r.type === 'office');
    const hasBedroom = rooms.some(r => r.type === 'bedroom');
    let loMin: number, hiMax: number, occupancy: string;
    if (hasOffice) {
      loMin = 0.75; hiMax = 0.90; occupancy = 'commercial office';
    } else if (hasBedroom) {
      loMin = 0.80; hiMax = 0.90; occupancy = 'residential';
    } else {
      loMin = 0.70; hiMax = 0.90; occupancy = 'mixed';
    }
    if (gtn >= loMin && gtn <= hiMax) return [];
    const tooLow = gtn < loMin;
    const bound = tooLow ? loMin : hiMax;
    return [{
      code: 'RB-143',
      severity: 'info',
      message: `Gross-to-net efficiency is ${Math.round(gtn * 100)}% (${tooLow ? 'below' : 'above'} the ${occupancy} target of ${Math.round(loMin * 100)}–${Math.round(hiMax * 100)}%). ${tooLow ? 'Over-allocated circulation or structural void signals a program that needs rationalization before client confirmation of rentable area.' : 'Under-allocated circulation leaves insufficient space for walls, corridors, and structure.'} (R-143)`,
      roomIds: [],
      value: Math.round(gtn * 100),
      threshold: Math.round(bound * 100),
    }];
  },
};

/**
 * RB-144 — MECH_ROOM_AREA_ALLOWANCE
 * When a plan contains at least one room of type 'mechanical', 'mep', or
 * 'utility', the combined area of those rooms must equal 3–8% of the gross
 * plan bounding-box area. R-144 (Mechanical Room Area Allowance in Program)
 * documents that mechanical room area is a consistent source of late-stage
 * redesign conflict: the room is omitted or undersized in early programming
 * because it is non-revenue space, and the conflict surfaces when the
 * mechanical engineer provides an equipment room layout. The 3% lower bound
 * applies to simple single-use buildings; 8% applies to hospitals and data
 * centers. Distinct from RB-121 (service space presence in complex plans) and
 * RB-141 (commercial MEP zone requirement in office-occupancy plans).
 * Rulebook ref: R-144 (Building Systems / Mechanical Room Area Allowance)
 */
const RB_144: RuleCheck = {
  id: 'RB-144',
  ruleId: 'R-144',
  title: 'Mech Room Area Allowance',
  severity: 'info',
  applies: layout => {
    const MEP = new Set(['mechanical', 'mep', 'utility']);
    return layout.rooms.some(r => r.width > 0 && r.height > 0 && MEP.has(r.type));
  },
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const MEP = new Set(['mechanical', 'mep', 'utility']);
    const mechRooms = rooms.filter(r => MEP.has(r.type));
    if (mechRooms.length === 0) return [];
    const planArea = ctx.dimW * ctx.dimD;
    if (planArea <= 0) return [];
    const mechArea = mechRooms.reduce((sum, r) => sum + roomArea(r), 0);
    const ratio = mechArea / planArea;
    if (ratio >= 0.03 && ratio <= 0.08) return [];
    const tooLow = ratio < 0.03;
    const bound = tooLow ? 0.03 : 0.08;
    return [{
      code: 'RB-144',
      severity: 'info',
      message: `Mechanical/utility rooms total ${mechArea.toFixed(1)} sq ${ctx.units} (${Math.round(ratio * 100)}% of ${planArea.toFixed(1)} sq ${ctx.units} plan area), ${tooLow ? 'below' : 'above'} the 3–8% target. ${tooLow ? 'Under-allocated mechanical space will require redesign when the MEP engineer provides an equipment schedule.' : 'Over-allocated mechanical space reduces rentable area beyond typical allowances.'} (R-144)`,
      roomIds: mechRooms.map(r => r.id),
      value: Math.round(ratio * 100),
      threshold: Math.round(bound * 100),
    }];
  },
};

/**
 * RB-145 — ELEVATOR_COUNT_MIN
 * In plans with a gross area ≥ 45,000 sq ft (4,181 m²), at least one room of
 * type 'elevator', 'lift', or 'elevator shaft' must be present; one additional
 * elevator room is required per 47,500 sq ft (4,413 m²) of gross area beyond
 * the first threshold (rounded up). R-145 (Elevator Count Rule of Thumb for
 * Commercial Office) establishes that commercial office buildings must provide
 * one elevator per 45,000–50,000 sq ft of gross building area. Under-
 * provisioned elevator banks are discovered at DD when the consultant confirms
 * unacceptable wait times — at which point adding a core bay requires
 * significant floor plan revision. Distinct from RB-142 (lateral system core
 * presence) and RB-099 (hall hub connectivity).
 * Rulebook ref: R-145 (Building Systems / Elevator Count Rule of Thumb)
 */
const RB_145: RuleCheck = {
  id: 'RB-145',
  ruleId: 'R-145',
  title: 'Elevator Count Min',
  severity: 'info',
  applies: layout => {
    const planArea = layout.dimensions.width * layout.dimensions.depth;
    const threshold = layout.units === 'meters' ? 4181 : 45000;
    return planArea >= threshold;
  },
  check(layout, ctx) {
    const rooms = validRooms(layout);
    const planArea = ctx.dimW * ctx.dimD;
    const perElevator = ctx.units === 'meters' ? 4413 : 47500;
    const baseThreshold = ctx.units === 'meters' ? 4181 : 45000;
    if (planArea < baseThreshold) return [];
    const requiredElevators = Math.ceil(planArea / perElevator);
    const ELEV_TYPES = new Set(['elevator', 'lift', 'elevator shaft']);
    const elevCount = rooms.filter(r => ELEV_TYPES.has(r.type)).length;
    if (elevCount >= requiredElevators) return [];
    const fixes: RepairAction[] = Array.from(
      { length: requiredElevators - elevCount },
      () => ({ type: 'addRoom' as const, roomType: 'elevator' }),
    );
    return [{
      code: 'RB-145',
      severity: 'info',
      message: `Plan area ${planArea.toFixed(0)} sq ${ctx.units} requires ${requiredElevators} elevator(s) (1 per ${perElevator.toLocaleString()} sq ${ctx.units}), but only ${elevCount} elevator room(s) found. Under-provisioned elevator banks are discovered at DD when the consultant confirms unacceptable wait times — adding a core bay then requires major floor plan revision (R-145).`,
      roomIds: [],
      value: elevCount,
      threshold: requiredElevators,
      suggestedFixes: fixes,
    }];
  },
};

// ── Auto-register all built-in checks ─────────────────────────────────────────

registerChecks(
  RB_001, RB_002, RB_003, RB_004, RB_005,
  RB_006, RB_007, RB_008, RB_009, RB_010,
  RB_011, RB_012, RB_013, RB_014, RB_015,
  RB_016, RB_017, RB_018, RB_019, RB_020,
  RB_021, RB_022, RB_023, RB_024, RB_025,
  RB_026, RB_027, RB_028, RB_029, RB_030,
  RB_031, RB_032, RB_033, RB_034, RB_035,
  RB_036, RB_037, RB_038, RB_039, RB_040,
  RB_041, RB_042, RB_043, RB_044, RB_045,
  RB_046, RB_047, RB_048, RB_049, RB_050,
  RB_051, RB_052, RB_053, RB_054, RB_055,
  RB_056, RB_057, RB_058, RB_059, RB_060,
  RB_061, RB_062, RB_063, RB_064, RB_065,
  RB_066, RB_067, RB_068, RB_069, RB_070,
  RB_071, RB_072, RB_073, RB_074, RB_075,
  RB_076, RB_077, RB_078, RB_079, RB_080,
  RB_081, RB_082, RB_083, RB_084, RB_085,
  RB_086, RB_087, RB_088, RB_089, RB_090,
  RB_091, RB_092, RB_093, RB_094, RB_095,
  RB_096, RB_097, RB_098, RB_099, RB_100,
  RB_101, RB_102, RB_103, RB_104, RB_105,
  RB_106, RB_107, RB_108, RB_109, RB_110,
  RB_111, RB_112, RB_113, RB_114, RB_115,
  RB_116, RB_117, RB_118, RB_119, RB_120,
  RB_121, RB_122, RB_123, RB_124, RB_125,
  RB_126, RB_127, RB_128, RB_129, RB_130,
  RB_131, RB_132, RB_133, RB_134, RB_135,
  RB_136, RB_137, RB_138, RB_139, RB_140,
  RB_141, RB_142, RB_143, RB_144, RB_145,
);
