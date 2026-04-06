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

import { LayoutV1, Room2D } from './layout.js';
import { Violation, RepairAction } from './validator.js';

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
);
