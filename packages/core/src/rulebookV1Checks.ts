/**
 * ArchiVox Rule Book v1 Validator — Phase 3
 * ==========================================
 * Full implementation of R-001–R-103 (103 residential floor plan rules).
 * Source: archivox-rule-book-v1.md (vault: 20-projects/archivox/)
 * Manifest: rules/rulebook/archivox-rulebook-v1-manifest.json
 *
 * Phase 2 (2026-04-15 cc-004): All 40 previously stubbed checks implemented using
 * new LayoutV1 schema elements: DoorElement[], WallSegment[], WindowElement[],
 * FloorLevelElement[], StairElement[], RampElement[], siteOrientation,
 * KitchenFixtureElement[], BathroomFixtureElement[], DimensionAnnotationElement[],
 * FireplaceElement[].
 *
 * Phase 3 (2026-04-15 cc-005):
 * - R-095: stub upgraded to differentiated soft warning (0.60m ideal depth vs R-049
 *   hard minimum 0.55m). Now warns on closets that pass R-049 but fall below ideal.
 * - R-102: implemented using new ViewportLabelElement[] schema element. Checks for
 *   label-geometry overlap (label bounding box vs other room bounding boxes) and
 *   label-label overlap (two labels occupying the same canvas area). Zero stubs remain.
 *
 * All new schema elements are optional on LayoutV1 — backward compatible.
 * Checks that require absent schema elements return [] and are skipped.
 *
 * Call registerRulebookV1Checks() once at startup to include all 103 checks
 * in runChecks(). Already called from packages/core/src/index.ts.
 */

import {
  LayoutV1, Room2D,
  SiteOrientation,
  DoorElement, WallSegment, WindowElement,
  ViewportLabelElement,
} from './layout';
import { Violation, RepairAction } from './validator';
import { RuleCheck, CheckContext, registerChecks } from './ruleChecks';

// ── Geometry helpers ──────────────────────────────────────────────────────────

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

function roomsByType(layout: LayoutV1, ...types: string[]): Room2D[] {
  const set = new Set(types);
  return validRooms(layout).filter(r => set.has(r.type));
}

function roomLabel(r: Room2D): string {
  return r.label ?? r.id;
}

function isMasterBedroom(r: Room2D): boolean {
  const s = (r.label ?? r.type).toLowerCase();
  return s.includes('master') || s.includes('main bed');
}

/** Convert an m² threshold to layout units (feet² when units='feet'). */
function areaM2(m2: number, ctx: CheckContext): number {
  return ctx.units === 'meters' ? m2 : m2 / (0.3048 * 0.3048);
}

/** Convert a metre linear threshold to layout units. */
function lenM(m: number, ctx: CheckContext): number {
  return ctx.units === 'meters' ? m : m / 0.3048;
}

// ── Phase 2 helpers ───────────────────────────────────────────────────────────

/** Build a room-to-room adjacency graph from DoorElement[]. */
function buildDoorGraph(layout: LayoutV1): Map<string, Set<string>> {
  const graph = new Map<string, Set<string>>();
  for (const room of validRooms(layout)) graph.set(room.id, new Set());
  for (const door of (layout.doors ?? [])) {
    if (door.fromRoomId && door.toRoomId) {
      graph.get(door.fromRoomId)?.add(door.toRoomId);
      graph.get(door.toRoomId)?.add(door.fromRoomId);
    }
  }
  return graph;
}

/** BFS from `startIds`; only traverses rooms whose IDs are in `allowed`. Returns visited set. */
function bfs(startIds: string[], graph: Map<string, Set<string>>, allowed: Set<string>): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [];
  for (const id of startIds) {
    if (allowed.has(id) && !visited.has(id)) { visited.add(id); queue.push(id); }
  }
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const n of (graph.get(curr) ?? [])) {
      if (allowed.has(n) && !visited.has(n)) { visited.add(n); queue.push(n); }
    }
  }
  return visited;
}

/**
 * True if a horizontal wall segment (axis-aligned) covers the full extent of
 * the given side of a room's bounding box.
 */
function wallCoversSide(
  wall: WallSegment,
  sideStart: { x: number; y: number },
  sideEnd: { x: number; y: number },
  tol = 0.1,
): boolean {
  const wallIsH = Math.abs(wall.start.y - wall.end.y) < tol;
  const wallIsV = Math.abs(wall.start.x - wall.end.x) < tol;
  const sideIsH = Math.abs(sideStart.y - sideEnd.y) < tol;
  const sideIsV = Math.abs(sideStart.x - sideEnd.x) < tol;
  if (wallIsH && sideIsH) {
    if (Math.abs(wall.start.y - sideStart.y) > tol) return false;
    const wMin = Math.min(wall.start.x, wall.end.x);
    const wMax = Math.max(wall.start.x, wall.end.x);
    const sMin = Math.min(sideStart.x, sideEnd.x);
    const sMax = Math.max(sideStart.x, sideEnd.x);
    return wMin <= sMin + tol && wMax >= sMax - tol;
  }
  if (wallIsV && sideIsV) {
    if (Math.abs(wall.start.x - sideStart.x) > tol) return false;
    const wMin = Math.min(wall.start.y, wall.end.y);
    const wMax = Math.max(wall.start.y, wall.end.y);
    const sMin = Math.min(sideStart.y, sideEnd.y);
    const sMax = Math.max(sideStart.y, sideEnd.y);
    return wMin <= sMin + tol && wMax >= sMax - tol;
  }
  return false;
}

/** True if point lies on an axis-aligned wall segment (within tolerance). */
function pointIsOnWall(pt: { x: number; y: number }, wall: WallSegment, tol = 0.1): boolean {
  const wallIsH = Math.abs(wall.start.y - wall.end.y) < tol;
  const wallIsV = Math.abs(wall.start.x - wall.end.x) < tol;
  if (wallIsH) {
    if (Math.abs(pt.y - wall.start.y) > tol) return false;
    return pt.x >= Math.min(wall.start.x, wall.end.x) - tol &&
           pt.x <= Math.max(wall.start.x, wall.end.x) + tol;
  }
  if (wallIsV) {
    if (Math.abs(pt.x - wall.start.x) > tol) return false;
    return pt.y >= Math.min(wall.start.y, wall.end.y) - tol &&
           pt.y <= Math.max(wall.start.y, wall.end.y) + tol;
  }
  return false;
}

/**
 * Returns the set of compass directions this room faces (i.e. sides touching
 * the plan boundary), resolved from siteOrientation.
 * Convention: when orientation='N', north is up (y=0).
 */
function roomFacingDirections(
  r: Room2D,
  orientation: SiteOrientation,
  dimW: number,
  dimD: number,
  tol = 0.5,
): Set<string> {
  type EM = { top: string; bottom: string; left: string; right: string };
  const maps: Record<string, EM> = {
    N:  { top: 'N',  bottom: 'S',  left: 'W',  right: 'E'  },
    S:  { top: 'S',  bottom: 'N',  left: 'E',  right: 'W'  },
    E:  { top: 'E',  bottom: 'W',  left: 'N',  right: 'S'  },
    W:  { top: 'W',  bottom: 'E',  left: 'S',  right: 'N'  },
    NE: { top: 'NE', bottom: 'SW', left: 'NW', right: 'SE' },
    NW: { top: 'NW', bottom: 'SE', left: 'SW', right: 'NE' },
    SE: { top: 'SE', bottom: 'NW', left: 'NE', right: 'SW' },
    SW: { top: 'SW', bottom: 'NE', left: 'SE', right: 'NW' },
  };
  const em = maps[orientation] ?? maps.N;
  const dirs = new Set<string>();
  if (r.y <= tol)                   dirs.add(em.top);
  if (r.y + r.height >= dimD - tol) dirs.add(em.bottom);
  if (r.x <= tol)                   dirs.add(em.left);
  if (r.x + r.width  >= dimW - tol) dirs.add(em.right);
  return dirs;
}

/** Entrance detection shared by several rules. */
function getEntrances(layout: LayoutV1): Room2D[] {
  const entryTypes = new Set(['entry', 'entrance', 'foyer', 'vestibule']);
  return validRooms(layout).filter(
    r => entryTypes.has(r.type) || entryTypes.has((r.label ?? '').toLowerCase())
  );
}

// ── HARD CONSTRAINTS ──────────────────────────────────────────────────────────
// ── Group 1: Connectivity and Access (R-001–R-010) ───────────────────────────

// IMPLEMENTED (door-graph BFS — requires DoorElement[])
const RBv1_001: RuleCheck = {
  id: 'RBv1-001', ruleId: 'R-001',
  title: 'Room connectivity: no private-room traversal required',
  severity: 'error',
  check(layout): Violation[] {
    const doors = layout.doors;
    if (!doors || doors.length === 0) return [];
    const entrances = getEntrances(layout);
    if (entrances.length === 0) return []; // R-002 handles missing entrance
    const privateTypes = new Set(['bedroom', 'bathroom']);
    const graph = buildDoorGraph(layout);
    const rooms = validRooms(layout);
    // BFS from entrances through non-private rooms only
    const publicIds = new Set(rooms.filter(r => !privateTypes.has(r.type)).map(r => r.id));
    const visited = bfs(entrances.map(e => e.id), graph, publicIds);
    return rooms
      .filter(r => !privateTypes.has(r.type) && !visited.has(r.id))
      .map(r => ({
        code: 'RBv1-001', severity: 'error' as const,
        message: `Room "${roomLabel(r)}" (${r.type}) cannot be reached from the entrance without passing through a bedroom or bathroom (R-001).`,
        roomIds: [r.id],
      }));
  },
};

// IMPLEMENTED
const RBv1_002: RuleCheck = {
  id: 'RBv1-002', ruleId: 'R-002',
  title: 'Plan must contain at least one entrance',
  severity: 'error',
  check(layout): Violation[] {
    const entranceTypes = new Set(['entry', 'entrance', 'foyer']);
    const entranceLabels = new Set([
      'entrance', 'entry', 'foyer', 'main entrance', 'vestibule', 'porch',
    ]);
    const hasEntrance = validRooms(layout).some(
      r => entranceTypes.has(r.type) || entranceLabels.has((r.label ?? '').toLowerCase())
    );
    if (hasEntrance) return [];
    return [{
      code: 'RBv1-002', severity: 'error',
      message: 'No entrance or entry space found in plan. Every residential plan must have a designated entrance (R-002).',
      suggestedFixes: [{ type: 'addRoom', roomType: 'entry' }],
    }];
  },
};

// IMPLEMENTED (door-graph — requires DoorElement[])
const RBv1_003: RuleCheck = {
  id: 'RBv1-003', ruleId: 'R-003',
  title: 'Bedroom door opens to corridor/hall/living area',
  severity: 'error',
  applies: layout => (layout.doors?.length ?? 0) > 0,
  check(layout): Violation[] {
    const doors = layout.doors;
    if (!doors || doors.length === 0) return [];
    const privateTypes = new Set(['bedroom', 'bathroom']);
    const roomMap = new Map(validRooms(layout).map(r => [r.id, r]));
    return roomsByType(layout, 'bedroom').flatMap(bed => {
      const connected = doors
        .filter(d => d.fromRoomId === bed.id || d.toRoomId === bed.id)
        .map(d => d.fromRoomId === bed.id ? d.toRoomId : d.fromRoomId)
        .filter((id): id is string => id != null);
      const hasPublicDoor = connected.some(id => {
        const r = roomMap.get(id);
        return r && !privateTypes.has(r.type);
      });
      if (hasPublicDoor) return [];
      return [{
        code: 'RBv1-003', severity: 'error' as const,
        message: `Bedroom "${roomLabel(bed)}" has no door opening to a corridor, hall, or common area — only private-room connections found (R-003).`,
        roomIds: [bed.id],
      }];
    });
  },
};

// IMPLEMENTED (door-graph articulation check — requires DoorElement[])
const RBv1_004: RuleCheck = {
  id: 'RBv1-004', ruleId: 'R-004',
  title: 'No bathroom as sole circulation route between two rooms',
  severity: 'error',
  applies: layout => (layout.doors?.length ?? 0) > 0 && roomsByType(layout, 'bathroom').length > 0,
  check(layout): Violation[] {
    const doors = layout.doors;
    if (!doors || doors.length === 0) return [];
    const graph = buildDoorGraph(layout);
    const nonBathIds = new Set(
      validRooms(layout).filter(r => r.type !== 'bathroom').map(r => r.id)
    );
    const violations: Violation[] = [];
    for (const bath of roomsByType(layout, 'bathroom')) {
      // Build reduced graph without this bathroom
      const reducedAllowed = new Set(nonBathIds);
      // BFS from first non-bathroom room in reduced graph
      const nonBathRooms = [...nonBathIds];
      if (nonBathRooms.length < 2) continue;
      const visited = bfs([nonBathRooms[0]], graph, reducedAllowed);
      const unreachable = nonBathRooms.filter(id => !visited.has(id));
      if (unreachable.length > 0) {
        const unreachableRooms = validRooms(layout).filter(r => unreachable.includes(r.id));
        violations.push({
          code: 'RBv1-004', severity: 'error',
          message: `Bathroom "${roomLabel(bath)}" is the sole circulation route to ${unreachableRooms.map(r => `"${roomLabel(r)}"`).join(', ')} — removing it disconnects those rooms (R-004).`,
          roomIds: [bath.id, ...unreachable],
        });
      }
    }
    return violations;
  },
};

// IMPLEMENTED (door-graph BFS from common areas — requires DoorElement[])
const RBv1_005: RuleCheck = {
  id: 'RBv1-005', ruleId: 'R-005',
  title: 'Bathrooms accessible without crossing non-en-suite bedroom',
  severity: 'error',
  applies: layout => (layout.doors?.length ?? 0) > 0 && roomsByType(layout, 'bathroom').length > 0,
  check(layout): Violation[] {
    const doors = layout.doors;
    if (!doors || doors.length === 0) return [];
    const graph = buildDoorGraph(layout);
    const bedroomIds = new Set(roomsByType(layout, 'bedroom').map(r => r.id));
    // Non-bedroom rooms (can traverse freely)
    const nonBedroomIds = new Set(
      validRooms(layout).filter(r => !bedroomIds.has(r.id)).map(r => r.id)
    );
    const violations: Violation[] = [];
    for (const bath of roomsByType(layout, 'bathroom')) {
      // BFS from bathroom through non-bedroom rooms to find common-area access
      const reachable = bfs([bath.id], graph, nonBedroomIds);
      const hasCommonAccess = [...reachable].some(id => id !== bath.id && nonBedroomIds.has(id));
      if (hasCommonAccess) continue;
      // Check en-suite exception: bathroom connected to exactly one bedroom only
      const directBedConnections = [...(graph.get(bath.id) ?? [])].filter(id => bedroomIds.has(id));
      if (directBedConnections.length === 1) continue; // en-suite — allowed
      violations.push({
        code: 'RBv1-005', severity: 'error',
        message: `Bathroom "${roomLabel(bath)}" can only be accessed by crossing a bedroom and is not a private en-suite (R-005).`,
        roomIds: [bath.id],
      });
    }
    return violations;
  },
};

// IMPLEMENTED (requires DoorElement[])
const RBv1_006: RuleCheck = {
  id: 'RBv1-006', ruleId: 'R-006',
  title: 'Interior door clear width minimum 0.70m',
  severity: 'error',
  applies: layout => (layout.doors?.length ?? 0) > 0,
  check(layout, ctx): Violation[] {
    const doors = layout.doors;
    if (!doors || doors.length === 0) return [];
    const threshold = lenM(0.70, ctx);
    return doors
      .filter(d => d.type !== 'entrance' && d.clearWidth < threshold)
      .map(d => ({
        code: 'RBv1-006', severity: 'error' as const,
        message: `Door "${d.id}" clear width ${d.clearWidth.toFixed(2)}${ctx.units} < 0.70m minimum for interior doors (R-006).`,
        value: d.clearWidth, threshold,
      }));
  },
};

// IMPLEMENTED (requires DoorElement[])
const RBv1_007: RuleCheck = {
  id: 'RBv1-007', ruleId: 'R-007',
  title: 'Main entrance door clear width minimum 0.90m',
  severity: 'error',
  applies: layout => (layout.doors ?? []).some(d => d.type === 'entrance'),
  check(layout, ctx): Violation[] {
    const doors = layout.doors;
    if (!doors || doors.length === 0) return [];
    const threshold = lenM(0.90, ctx);
    return doors
      .filter(d => d.type === 'entrance' && d.clearWidth < threshold)
      .map(d => ({
        code: 'RBv1-007', severity: 'error' as const,
        message: `Entrance door "${d.id}" clear width ${d.clearWidth.toFixed(2)}${ctx.units} < 0.90m minimum for main entrance (R-007).`,
        value: d.clearWidth, threshold,
      }));
  },
};

// IMPLEMENTED — surfaces R-008 ruleId on overlap pairs
const RBv1_008: RuleCheck = {
  id: 'RBv1-008', ruleId: 'R-008',
  title: 'No room footprint overlap',
  severity: 'error',
  // NOTE: base validator.ts already emits ROOM_OVERLAP / ROOM_CONTAINMENT.
  // This check re-surfaces violations with the R-008 ruleId for traceability.
  check(layout): Violation[] {
    const rooms = validRooms(layout);
    const violations: Violation[] = [];
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i];
        const b = rooms[j];
        const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        const oa = ox > 0 && oy > 0 ? ox * oy : 0;
        if (oa > 0) {
          violations.push({
            code: 'RBv1-008', severity: 'error',
            message: `Room "${roomLabel(a)}" overlaps "${roomLabel(b)}" — plan rejected (R-008).`,
            roomIds: [a.id, b.id], value: oa, ruleId: 'R-008',
          });
        }
      }
    }
    return violations;
  },
};

// IMPLEMENTED (requires WallSegment[])
const RBv1_009: RuleCheck = {
  id: 'RBv1-009', ruleId: 'R-009',
  title: 'All room boundaries enclosed by wall segments',
  severity: 'error',
  applies: layout => (layout.walls?.length ?? 0) > 0,
  check(layout): Violation[] {
    const walls = layout.walls;
    if (!walls || walls.length === 0) return [];
    const violations: Violation[] = [];
    for (const room of validRooms(layout)) {
      const sides = [
        { label: 'top',    s: { x: room.x,              y: room.y              }, e: { x: room.x + room.width, y: room.y              } },
        { label: 'bottom', s: { x: room.x,              y: room.y + room.height }, e: { x: room.x + room.width, y: room.y + room.height } },
        { label: 'left',   s: { x: room.x,              y: room.y              }, e: { x: room.x,              y: room.y + room.height } },
        { label: 'right',  s: { x: room.x + room.width, y: room.y              }, e: { x: room.x + room.width, y: room.y + room.height } },
      ];
      for (const side of sides) {
        if (!walls.some(w => wallCoversSide(w, side.s, side.e))) {
          violations.push({
            code: 'RBv1-009', severity: 'error',
            message: `Room "${roomLabel(room)}" has an uncovered boundary on the ${side.label} side — all room boundaries must be enclosed by wall segments (R-009).`,
            roomIds: [room.id],
          });
          break; // one violation per room is enough
        }
      }
    }
    return violations;
  },
};

// IMPLEMENTED
const RBv1_010: RuleCheck = {
  id: 'RBv1-010', ruleId: 'R-010',
  title: 'Plan must contain bedroom, bathroom/WC, and kitchen',
  severity: 'error',
  check(layout): Violation[] {
    const rooms = validRooms(layout);
    const violations: Violation[] = [];
    const fixes = (t: string): RepairAction[] => [{ type: 'addRoom', roomType: t }];
    if (!rooms.some(r => r.type === 'bedroom'))
      violations.push({ code: 'RBv1-010-bed',  severity: 'error', message: 'Plan has no bedroom — required by R-010.',  suggestedFixes: fixes('bedroom') });
    if (!rooms.some(r => r.type === 'bathroom'))
      violations.push({ code: 'RBv1-010-bath', severity: 'error', message: 'Plan has no bathroom or WC — required by R-010.', suggestedFixes: fixes('bathroom') });
    if (!rooms.some(r => r.type === 'kitchen'))
      violations.push({ code: 'RBv1-010-kit',  severity: 'error', message: 'Plan has no kitchen — required by R-010.',  suggestedFixes: fixes('kitchen') });
    return violations;
  },
};

// ── Group 2: Room Area Minimums (R-011–R-020) ────────────────────────────────

// IMPLEMENTED
const RBv1_011: RuleCheck = {
  id: 'RBv1-011', ruleId: 'R-011', title: 'Bedroom minimum floor area 9m²', severity: 'error',
  check(layout, ctx): Violation[] {
    const threshold = areaM2(9, ctx);
    return roomsByType(layout, 'bedroom')
      .filter(r => !isMasterBedroom(r))
      .flatMap(r => {
        const area = roomArea(r);
        if (area >= threshold) return [];
        return [{ code: 'RBv1-011', severity: 'error' as const,
          message: `Bedroom "${roomLabel(r)}" area ${area.toFixed(1)} ${ctx.units}² < 9m² minimum (R-011).`,
          roomIds: [r.id], value: area, threshold,
          suggestedFixes: [{ type: 'resizeRoom' as const, roomId: r.id, scaleX: 1.2, scaleY: 1.2 }],
        }];
      });
  },
};

// IMPLEMENTED
const RBv1_012: RuleCheck = {
  id: 'RBv1-012', ruleId: 'R-012', title: 'Master bedroom minimum floor area 10m²', severity: 'error',
  applies: layout => roomsByType(layout, 'bedroom').some(isMasterBedroom),
  check(layout, ctx): Violation[] {
    const threshold = areaM2(10, ctx);
    return roomsByType(layout, 'bedroom').filter(isMasterBedroom).flatMap(r => {
      const area = roomArea(r);
      if (area >= threshold) return [];
      return [{ code: 'RBv1-012', severity: 'error' as const,
        message: `Master bedroom "${roomLabel(r)}" area ${area.toFixed(1)} ${ctx.units}² < 10m² minimum (R-012).`,
        roomIds: [r.id], value: area, threshold }];
    });
  },
};

// IMPLEMENTED
const RBv1_013: RuleCheck = {
  id: 'RBv1-013', ruleId: 'R-013', title: 'Kitchen minimum floor area 5m²', severity: 'error',
  check(layout, ctx): Violation[] {
    const threshold = areaM2(5, ctx);
    return roomsByType(layout, 'kitchen').flatMap(r => {
      const area = roomArea(r);
      if (area >= threshold) return [];
      return [{ code: 'RBv1-013', severity: 'error' as const,
        message: `Kitchen "${roomLabel(r)}" area ${area.toFixed(1)} ${ctx.units}² < 5m² minimum (R-013).`,
        roomIds: [r.id], value: area, threshold }];
    });
  },
};

// IMPLEMENTED
const RBv1_014: RuleCheck = {
  id: 'RBv1-014', ruleId: 'R-014', title: 'Living room minimum floor area 12m²', severity: 'error',
  check(layout, ctx): Violation[] {
    const threshold = areaM2(12, ctx);
    return roomsByType(layout, 'living', 'living room').flatMap(r => {
      const area = roomArea(r);
      if (area >= threshold) return [];
      return [{ code: 'RBv1-014', severity: 'error' as const,
        message: `Living room "${roomLabel(r)}" area ${area.toFixed(1)} ${ctx.units}² < 12m² minimum (R-014).`,
        roomIds: [r.id], value: area, threshold }];
    });
  },
};

// IMPLEMENTED
const RBv1_015: RuleCheck = {
  id: 'RBv1-015', ruleId: 'R-015', title: 'Bathroom/WC minimum floor area 2m²', severity: 'error',
  check(layout, ctx): Violation[] {
    const threshold = areaM2(2, ctx);
    return roomsByType(layout, 'bathroom').flatMap(r => {
      const area = roomArea(r);
      if (area >= threshold) return [];
      return [{ code: 'RBv1-015', severity: 'error' as const,
        message: `Bathroom "${roomLabel(r)}" area ${area.toFixed(1)} ${ctx.units}² < 2m² minimum (R-015).`,
        roomIds: [r.id], value: area, threshold }];
    });
  },
};

// IMPLEMENTED (approximate via min dim of hall rooms)
const RBv1_016: RuleCheck = {
  id: 'RBv1-016', ruleId: 'R-016', title: 'Corridor clear width minimum 0.90m', severity: 'error',
  applies: layout => roomsByType(layout, 'hall').length > 0,
  check(layout, ctx): Violation[] {
    const threshold = lenM(0.9, ctx);
    return roomsByType(layout, 'hall').flatMap(r => {
      const minDim = Math.min(r.width, r.height);
      if (minDim >= threshold) return [];
      return [{ code: 'RBv1-016', severity: 'error' as const,
        message: `Corridor/hall "${roomLabel(r)}" clear width ${minDim.toFixed(2)} ${ctx.units} < 0.90m minimum (R-016).`,
        roomIds: [r.id], value: minDim, threshold }];
    });
  },
};

// IMPLEMENTED
const RBv1_017: RuleCheck = {
  id: 'RBv1-017', ruleId: 'R-017', title: 'Habitable room minimum clear dimension 1.80m', severity: 'error',
  check(layout, ctx): Violation[] {
    const threshold = lenM(1.8, ctx);
    const habitable = new Set(['bedroom', 'bathroom', 'kitchen', 'living', 'living room', 'dining', 'office']);
    return validRooms(layout).filter(r => habitable.has(r.type)).flatMap(r => {
      const minDim = Math.min(r.width, r.height);
      if (minDim >= threshold) return [];
      return [{ code: 'RBv1-017', severity: 'error' as const,
        message: `Room "${roomLabel(r)}" (${r.type}) min dimension ${minDim.toFixed(2)} ${ctx.units} < 1.80m habitable minimum (R-017).`,
        roomIds: [r.id], value: minDim, threshold }];
    });
  },
};

// IMPLEMENTED (requires WallSegment[])
const RBv1_018: RuleCheck = {
  id: 'RBv1-018', ruleId: 'R-018', title: 'Exterior wall thickness minimum 0.15m', severity: 'error',
  applies: layout => (layout.walls ?? []).some(w => w.type === 'exterior'),
  check(layout, ctx): Violation[] {
    const walls = layout.walls;
    if (!walls || walls.length === 0) return [];
    const threshold = lenM(0.15, ctx);
    return walls
      .filter(w => w.type === 'exterior' && w.thickness < threshold)
      .map(w => ({
        code: 'RBv1-018', severity: 'error' as const,
        message: `Exterior wall "${w.id}" thickness ${w.thickness.toFixed(3)}${ctx.units} < 0.15m minimum (R-018).`,
        value: w.thickness, threshold,
      }));
  },
};

// IMPLEMENTED (requires WallSegment[])
const RBv1_019: RuleCheck = {
  id: 'RBv1-019', ruleId: 'R-019', title: 'Interior partition wall thickness minimum 0.10m', severity: 'error',
  applies: layout => (layout.walls ?? []).some(w => w.type === 'interior'),
  check(layout, ctx): Violation[] {
    const walls = layout.walls;
    if (!walls || walls.length === 0) return [];
    const threshold = lenM(0.10, ctx);
    return walls
      .filter(w => w.type === 'interior' && w.thickness < threshold)
      .map(w => ({
        code: 'RBv1-019', severity: 'error' as const,
        message: `Interior wall "${w.id}" thickness ${w.thickness.toFixed(3)}${ctx.units} < 0.10m minimum (R-019).`,
        value: w.thickness, threshold,
      }));
  },
};

// IMPLEMENTED
const RBv1_020: RuleCheck = {
  id: 'RBv1-020', ruleId: 'R-020',
  title: 'Garage minimum internal clear dimensions 2.80m × 5.00m (single-car)',
  severity: 'error',
  applies: layout => roomsByType(layout, 'garage').length > 0,
  check(layout, ctx): Violation[] {
    const minShort = lenM(2.8, ctx);
    const minLong  = lenM(5.0, ctx);
    return roomsByType(layout, 'garage').flatMap(r => {
      const short = Math.min(r.width, r.height);
      const long  = Math.max(r.width, r.height);
      if (short >= minShort && long >= minLong) return [];
      return [{ code: 'RBv1-020', severity: 'error' as const,
        message: `Garage "${roomLabel(r)}" ${r.width.toFixed(1)}×${r.height.toFixed(1)} ${ctx.units} < 2.80×5.00m single-car minimum (R-020).`,
        roomIds: [r.id] }];
    });
  },
};

// ── Group 3: Structural and Geometric Integrity (R-021–R-025) ────────────────

// IMPLEMENTED
const RBv1_021: RuleCheck = {
  id: 'RBv1-021', ruleId: 'R-021',
  title: 'No two rooms share identical bounding-box coordinates',
  severity: 'error',
  check(layout): Violation[] {
    const rooms = validRooms(layout);
    const violations: Violation[] = [];
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i]; const b = rooms[j];
        if (a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height) {
          violations.push({ code: 'RBv1-021', severity: 'error',
            message: `Rooms "${roomLabel(a)}" and "${roomLabel(b)}" share identical bounding-box coordinates (R-021).`,
            roomIds: [a.id, b.id] });
        }
      }
    }
    return violations;
  },
};

// IMPLEMENTED (requires DoorElement[] + WallSegment[])
const RBv1_022: RuleCheck = {
  id: 'RBv1-022', ruleId: 'R-022', title: 'Door openings must fall within a wall segment', severity: 'error',
  applies: layout => (layout.doors?.length ?? 0) > 0 && (layout.walls?.length ?? 0) > 0,
  check(layout): Violation[] {
    const doors = layout.doors;
    const walls = layout.walls;
    if (!doors || doors.length === 0 || !walls || walls.length === 0) return [];
    return doors.flatMap(door => {
      if (door.wallSegmentId) {
        const wallExists = walls.some(w => w.id === door.wallSegmentId);
        if (!wallExists) return [{
          code: 'RBv1-022', severity: 'error' as const,
          message: `Door "${door.id}" references wall segment "${door.wallSegmentId}" which does not exist in walls[] (R-022).`,
        }];
        return [];
      }
      if (!door.position) return []; // can't validate without position
      if (walls.some(w => pointIsOnWall(door.position!, w))) return [];
      return [{
        code: 'RBv1-022', severity: 'error' as const,
        message: `Door "${door.id}" at (${door.position.x}, ${door.position.y}) does not fall within any wall segment — doors must be placed in walls (R-022).`,
      }];
    });
  },
};

// IMPLEMENTED (requires WindowElement[] + WallSegment[])
const RBv1_023: RuleCheck = {
  id: 'RBv1-023', ruleId: 'R-023', title: 'Window openings must fall within a wall segment', severity: 'error',
  applies: layout => (layout.windows?.length ?? 0) > 0 && (layout.walls?.length ?? 0) > 0,
  check(layout): Violation[] {
    const windows = layout.windows;
    const walls = layout.walls;
    if (!windows || windows.length === 0 || !walls || walls.length === 0) return [];
    return windows.flatMap(win => {
      if (win.wallSegmentId) {
        const wallExists = walls.some(w => w.id === win.wallSegmentId);
        if (!wallExists) return [{
          code: 'RBv1-023', severity: 'error' as const,
          message: `Window "${win.id}" references wall segment "${win.wallSegmentId}" which does not exist in walls[] (R-023).`,
        }];
        return [];
      }
      if (!win.position) return [];
      if (walls.some(w => pointIsOnWall(win.position!, w))) return [];
      return [{
        code: 'RBv1-023', severity: 'error' as const,
        message: `Window "${win.id}" at (${win.position.x}, ${win.position.y}) does not fall within any wall segment — windows must be placed in walls (R-023).`,
      }];
    });
  },
};

// IMPLEMENTED (requires WallSegment[])
const RBv1_024: RuleCheck = {
  id: 'RBv1-024', ruleId: 'R-024',
  title: 'Wall segments connect at vertices with no unresolved gaps > 0.05m',
  severity: 'error',
  applies: layout => (layout.walls?.length ?? 0) > 1,
  check(layout): Violation[] {
    const walls = layout.walls;
    if (!walls || walls.length < 2) return [];
    const MAX_GAP = 0.05;
    const violations: Violation[] = [];
    // Collect all endpoints
    const endpoints = walls.flatMap(w => [w.start, w.end]);
    // For each endpoint, find the minimum distance to any other wall endpoint
    for (let i = 0; i < walls.length; i++) {
      for (const pt of [walls[i].start, walls[i].end]) {
        const closestGap = Math.min(
          ...walls
            .filter((_, j) => j !== i)
            .flatMap(w => [w.start, w.end])
            .map(other => Math.hypot(pt.x - other.x, pt.y - other.y))
        );
        if (closestGap > MAX_GAP) {
          violations.push({
            code: 'RBv1-024', severity: 'error',
            message: `Wall "${walls[i].id}" has an endpoint at (${pt.x.toFixed(3)}, ${pt.y.toFixed(3)}) with a ${closestGap.toFixed(3)}m gap to the nearest wall vertex — maximum allowed is 0.05m (R-024).`,
            value: closestGap, threshold: MAX_GAP,
          });
          break; // one violation per wall is enough
        }
      }
    }
    return violations;
  },
};

// IMPLEMENTED (requires FloorLevelElement[])
const RBv1_025: RuleCheck = {
  id: 'RBv1-025', ruleId: 'R-025', title: 'Floor level changes must be annotated', severity: 'error',
  applies: layout => (layout.floorLevels?.length ?? 0) > 1,
  check(layout): Violation[] {
    const levels = layout.floorLevels;
    if (!levels || levels.length < 2) return [];
    // There are multiple floor levels — verify every level has an annotation
    return levels
      .filter(fl => fl.type !== 'NPT' && fl.type !== 'FFL' && !fl.annotation)
      .map(fl => ({
        code: 'RBv1-025', severity: 'error' as const,
        message: `Floor level "${fl.id}" (value: ${fl.value}) has no annotation — floor level changes must be annotated with step height or ramp notation (R-025).`,
      }));
  },
};

// ── Group 4: Room Adjacency and Zoning Requirements (R-026–R-050) ────────────

// IMPLEMENTED
const RBv1_026: RuleCheck = {
  id: 'RBv1-026', ruleId: 'R-026', title: 'Kitchen and dining room must be adjacent', severity: 'error',
  applies: layout => roomsByType(layout, 'kitchen').length > 0 && roomsByType(layout, 'dining').length > 0,
  check(layout): Violation[] {
    const kitchens = roomsByType(layout, 'kitchen');
    const dinings  = roomsByType(layout, 'dining');
    const anyAdj = kitchens.some(k => dinings.some(d => roomsAreAdjacent(k, d)));
    if (anyAdj) return [];
    return [{ code: 'RBv1-026', severity: 'error',
      message: 'Kitchen and dining room are not adjacent (R-026). They must share a wall or direct doorway.',
      roomIds: [...kitchens.map(r => r.id), ...dinings.map(r => r.id)] }];
  },
};

// IMPLEMENTED (adjacency proxy — full check needs door graph)
// Proxy: entry must be adjacent to at least one non-private room (hall, living, dining, kitchen).
// Flags only when entry is surrounded exclusively by bedrooms/bathrooms — a clear hard-constraint breach.
const RBv1_027: RuleCheck = {
  id: 'RBv1-027', ruleId: 'R-027',
  title: 'Entrance gives direct access to living room without bedroom/bathroom traversal',
  severity: 'error',
  applies: layout => {
    const entryTypes = new Set(['entry', 'entrance', 'foyer', 'vestibule']);
    return validRooms(layout).some(r => entryTypes.has(r.type) || entryTypes.has((r.label ?? '').toLowerCase()));
  },
  check(layout): Violation[] {
    const entryTypes = new Set(['entry', 'entrance', 'foyer', 'vestibule']);
    const entries = validRooms(layout).filter(
      r => entryTypes.has(r.type) || entryTypes.has((r.label ?? '').toLowerCase())
    );
    const privateTypes = new Set(['bedroom', 'bathroom']);
    return entries.flatMap(e => {
      const adjacent = validRooms(layout).filter(r => r.id !== e.id && roomsAreAdjacent(e, r));
      if (adjacent.length === 0) return []; // isolated entry — handled by R-002 / geometry checks
      const hasPublicAccess = adjacent.some(r => !privateTypes.has(r.type));
      if (hasPublicAccess) return [];
      return [{
        code: 'RBv1-027', severity: 'error',
        message: `Entrance "${roomLabel(e)}" is only accessible through private rooms (bedrooms/bathrooms) — must provide direct access to a common area (R-027).`,
        roomIds: [e.id, ...adjacent.map(r => r.id)],
      }];
    });
  },
};

// IMPLEMENTED
const RBv1_028: RuleCheck = {
  id: 'RBv1-028', ruleId: 'R-028',
  title: 'Bathroom count minimum: 1 per every 2 bedrooms (rounded up)',
  severity: 'error',
  check(layout): Violation[] {
    const beds  = roomsByType(layout, 'bedroom').length;
    const baths = roomsByType(layout, 'bathroom').length;
    if (beds === 0) return [];
    const required = Math.ceil(beds / 2);
    if (baths >= required) return [];
    return [{ code: 'RBv1-028', severity: 'error',
      message: `Plan has ${beds} bedroom(s) but only ${baths} bathroom(s); minimum is ${required} (R-028).`,
      value: baths, threshold: required,
      suggestedFixes: Array.from({ length: required - baths }, () =>
        ({ type: 'addRoom' as const, roomType: 'bathroom' })
      ),
    }];
  },
};

// IMPLEMENTED (adjacency proxy; full check needs door graph)
const RBv1_029: RuleCheck = {
  id: 'RBv1-029', ruleId: 'R-029',
  title: 'Master bedroom must have dedicated or directly accessible bathroom',
  severity: 'error',
  applies: layout =>
    roomsByType(layout, 'bedroom').some(isMasterBedroom) &&
    roomsByType(layout, 'bathroom').length > 0,
  check(layout): Violation[] {
    const masters = roomsByType(layout, 'bedroom').filter(isMasterBedroom);
    const baths   = roomsByType(layout, 'bathroom');
    return masters.flatMap(m => {
      if (baths.some(b => roomsAreAdjacent(m, b))) return [];
      return [{ code: 'RBv1-029', severity: 'error' as const,
        message: `Master bedroom "${roomLabel(m)}" has no adjacent bathroom (R-029).`,
        roomIds: [m.id, ...baths.map(b => b.id)] }];
    });
  },
};

// IMPLEMENTED (adjacency proxy — full check needs door graph)
const RBv1_030: RuleCheck = {
  id: 'RBv1-030', ruleId: 'R-030',
  title: 'Laundry accessible without traversing bedroom zone',
  severity: 'error',
  applies: layout => roomsByType(layout, 'laundry').length > 0,
  check(layout): Violation[] {
    const bedroomIds = new Set(roomsByType(layout, 'bedroom').map(r => r.id));
    return roomsByType(layout, 'laundry').flatMap(laundry => {
      const adjacent = validRooms(layout).filter(r => r.id !== laundry.id && roomsAreAdjacent(laundry, r));
      if (adjacent.length === 0) return []; // isolated laundry handled by other checks
      const hasNonBedroomPath = adjacent.some(r => !bedroomIds.has(r.id));
      if (hasNonBedroomPath) return [];
      return [{
        code: 'RBv1-030', severity: 'error' as const,
        message: `Laundry "${roomLabel(laundry)}" is only adjacent to bedrooms — must have a path from kitchen or service zone (R-030).`,
        roomIds: [laundry.id, ...adjacent.map(r => r.id)],
      }];
    });
  },
};

// IMPLEMENTED (label-based adjacency)
const RBv1_031: RuleCheck = {
  id: 'RBv1-031', ruleId: 'R-031',
  title: 'Pantry/storage adjacent to or accessible from kitchen',
  severity: 'error',
  applies(layout) {
    return validRooms(layout).some(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('pantry') || l.includes('store room') || l.includes('storeroom');
    });
  },
  check(layout): Violation[] {
    const pantries = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('pantry') || l.includes('store room') || l.includes('storeroom');
    });
    const kitchens = roomsByType(layout, 'kitchen');
    if (kitchens.length === 0) return [];
    return pantries.flatMap(p => {
      if (kitchens.some(k => roomsAreAdjacent(p, k))) return [];
      return [{
        code: 'RBv1-031', severity: 'error' as const,
        message: `Pantry/storage "${roomLabel(p)}" is not adjacent to any kitchen — must be directly accessible from kitchen (R-031).`,
        roomIds: [p.id, ...kitchens.map(k => k.id)],
      }];
    });
  },
};

const RBv1_032: RuleCheck = {
  id: 'RBv1-032', ruleId: 'R-032',
  title: 'Garage has at least one internal connection to main plan',
  severity: 'error',
  applies: layout => roomsByType(layout, 'garage').length > 0,
  // IMPLEMENTED (adjacency proxy — full check needs DoorElement[])
  check(layout): Violation[] {
    const nonGarageRooms = validRooms(layout).filter(r => r.type !== 'garage');
    return roomsByType(layout, 'garage').flatMap(g => {
      if (nonGarageRooms.some(r => roomsAreAdjacent(g, r))) return [];
      return [{
        code: 'RBv1-032', severity: 'error' as const,
        message: `Garage "${roomLabel(g)}" is isolated — must have at least one internal connection to the main plan (R-032).`,
        roomIds: [g.id],
      }];
    });
  },
};

// IMPLEMENTED (adjacency proxy — full check needs door graph)
const RBv1_033: RuleCheck = {
  id: 'RBv1-033', ruleId: 'R-033',
  title: 'Service yard accessible from kitchen/laundry only, not bedroom zone',
  severity: 'error',
  applies(layout) {
    return validRooms(layout).some(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('service yard') || l.includes('service area') || l.includes('washing area');
    });
  },
  check(layout): Violation[] {
    const serviceRooms = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('service yard') || l.includes('service area') || l.includes('washing area');
    });
    const bedroomIds = new Set(roomsByType(layout, 'bedroom').map(r => r.id));
    return serviceRooms.flatMap(s => {
      const adjacent = validRooms(layout).filter(r => r.id !== s.id && roomsAreAdjacent(s, r));
      const adjBedroom = adjacent.filter(r => bedroomIds.has(r.id));
      if (adjBedroom.length === 0) return [];
      return [{
        code: 'RBv1-033', severity: 'error' as const,
        message: `Service yard "${roomLabel(s)}" is adjacent to bedroom(s) — must only be accessible from kitchen/laundry zone (R-033).`,
        roomIds: [s.id, ...adjBedroom.map(r => r.id)],
      }];
    });
  },
};

// IMPLEMENTED (requires StairElement[])
const RBv1_034: RuleCheck = {
  id: 'RBv1-034', ruleId: 'R-034',
  title: 'Stair accessible from common area, not exclusively bedroom',
  severity: 'error',
  applies: layout => (layout.stairs?.length ?? 0) > 0,
  check(layout): Violation[] {
    const stairs = layout.stairs;
    if (!stairs || stairs.length === 0) return [];
    const privateTypes = new Set(['bedroom', 'bathroom']);
    const roomMap = new Map(validRooms(layout).map(r => [r.id, r]));
    return stairs.flatMap(stair => {
      const adjRoom = roomMap.get(stair.adjacentRoomId);
      if (!adjRoom) return [];
      if (privateTypes.has(adjRoom.type)) {
        return [{
          code: 'RBv1-034', severity: 'error' as const,
          message: `Stair "${stair.id}" is only accessible from "${roomLabel(adjRoom)}" (${adjRoom.type}) — stairs must be accessible from a common area (R-034).`,
          roomIds: [adjRoom.id],
        }];
      }
      return [];
    });
  },
};

// IMPLEMENTED (requires RampElement[])
const RBv1_035: RuleCheck = {
  id: 'RBv1-035', ruleId: 'R-035',
  title: 'Parking ramp level landing minimum 1.20m depth at each end',
  severity: 'error',
  applies: layout => (layout.ramps ?? []).some(r => r.type === 'parking' || !r.type),
  check(layout, ctx): Violation[] {
    const ramps = layout.ramps;
    if (!ramps || ramps.length === 0) return [];
    const threshold = lenM(1.20, ctx);
    return ramps
      .filter(r => !r.type || r.type === 'parking')
      .flatMap(ramp => {
        const violations: Violation[] = [];
        if (ramp.landingDepthStart < threshold)
          violations.push({
            code: 'RBv1-035', severity: 'error',
            message: `Ramp "${ramp.id}" approach landing depth ${ramp.landingDepthStart.toFixed(2)}${ctx.units} < 1.20m minimum (R-035).`,
            value: ramp.landingDepthStart, threshold,
          });
        if (ramp.landingDepthEnd < threshold)
          violations.push({
            code: 'RBv1-035', severity: 'error',
            message: `Ramp "${ramp.id}" arrival landing depth ${ramp.landingDepthEnd.toFixed(2)}${ctx.units} < 1.20m minimum (R-035).`,
            value: ramp.landingDepthEnd, threshold,
          });
        return violations;
      });
  },
};

// IMPLEMENTED (requires StairElement[] + FloorLevelElement[])
const RBv1_036: RuleCheck = {
  id: 'RBv1-036', ruleId: 'R-036',
  title: 'Underground parking must have separate pedestrian vertical access',
  severity: 'error',
  applies: layout =>
    roomsByType(layout, 'garage').length > 0 &&
    (layout.floorLevels ?? []).some(fl => fl.value < 0),
  check(layout): Violation[] {
    const floorLevels = layout.floorLevels;
    const stairs = layout.stairs;
    if (!floorLevels || floorLevels.length === 0) return [];
    // Identify rooms at negative floor levels (underground)
    const undergroundRoomIds = new Set(
      floorLevels.filter(fl => fl.value < 0).flatMap(fl => fl.zoneRoomIds)
    );
    const undergroundGarages = roomsByType(layout, 'garage').filter(r => undergroundRoomIds.has(r.id));
    if (undergroundGarages.length === 0) return [];
    // Check if there is a stair connecting from underground to ground level
    const hasStair = (stairs ?? []).some(s =>
      (s.fromFloor < 0 && s.toFloor >= 0) || (s.fromFloor >= 0 && s.toFloor < 0)
    );
    if (hasStair) return [];
    return [{
      code: 'RBv1-036', severity: 'error',
      message: 'Underground parking is present but no pedestrian stair or vertical access connecting to the main floor was found (R-036).',
      roomIds: undergroundGarages.map(r => r.id),
    }];
  },
};

const RBv1_037: RuleCheck = {
  id: 'RBv1-037', ruleId: 'R-037',
  title: 'Closet accessible from its associated bedroom',
  severity: 'error',
  applies: layout => roomsByType(layout, 'closet').length > 0,
  // IMPLEMENTED (adjacency proxy — full check needs DoorElement[])
  check(layout): Violation[] {
    const bedrooms = roomsByType(layout, 'bedroom');
    return roomsByType(layout, 'closet').flatMap(cl => {
      if (bedrooms.some(b => roomsAreAdjacent(cl, b))) return [];
      return [{
        code: 'RBv1-037', severity: 'error' as const,
        message: `Closet "${roomLabel(cl)}" is not adjacent to any bedroom — closets must be accessible from their associated bedroom (R-037).`,
        roomIds: [cl.id],
        suggestedFixes: [{ type: 'moveRoom' as const, roomId: cl.id, dx: 0, dy: 0 }],
      }];
    });
  },
};

// IMPLEMENTED (label-based adjacency)
const RBv1_038: RuleCheck = {
  id: 'RBv1-038', ruleId: 'R-038',
  title: 'Breakfast nook/family room connected to kitchen or living zone',
  severity: 'error',
  applies(layout) {
    return validRooms(layout).some(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('breakfast') || l.includes('family room') || l.includes('sala familiar');
    });
  },
  check(layout): Violation[] {
    const specialRooms = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('breakfast') || l.includes('family room') || l.includes('sala familiar');
    });
    const socialZone = roomsByType(layout, 'kitchen', 'living', 'living room', 'dining');
    return specialRooms.flatMap(s => {
      if (socialZone.some(z => roomsAreAdjacent(s, z))) return [];
      return [{
        code: 'RBv1-038', severity: 'error' as const,
        message: `"${roomLabel(s)}" is not connected to kitchen or living zone — must be adjacent to kitchen or living/dining area (R-038).`,
        roomIds: [s.id],
      }];
    });
  },
};

// IMPLEMENTED (label-based adjacency proxy; R-039 classification conflict noted in QA log)
const RBv1_039: RuleCheck = {
  id: 'RBv1-039', ruleId: 'R-039',
  title: 'Half-bathroom accessible from common/social zone, not exclusively bedroom zone',
  severity: 'error',
  // NOTE: R-039 has a classification conflict (hard in Rule Book, soft S-009 in failure_modes_to_checks.md).
  // Treated as hard (error) per Rule Book v1. Jake to resolve.
  applies(layout) {
    return validRooms(layout).some(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('half bath') || l.includes('powder') || (l.includes('wc') && !l.includes('bathroom'));
    });
  },
  check(layout): Violation[] {
    const halfBaths = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('half bath') || l.includes('powder') || (l.includes('wc') && !l.includes('bathroom'));
    });
    const socialZoneIds = new Set(
      roomsByType(layout, 'living', 'living room', 'dining', 'hall', 'entry', 'entrance').map(r => r.id)
    );
    const bedroomIds = new Set(roomsByType(layout, 'bedroom').map(r => r.id));
    return halfBaths.flatMap(hb => {
      const adjacent = validRooms(layout).filter(r => r.id !== hb.id && roomsAreAdjacent(hb, r));
      const hasSocialAccess = adjacent.some(r => socialZoneIds.has(r.id));
      const onlyBedroomAccess = adjacent.length > 0 && adjacent.every(r => bedroomIds.has(r.id));
      if (hasSocialAccess || (!hasSocialAccess && !onlyBedroomAccess)) return [];
      return [{
        code: 'RBv1-039', severity: 'error' as const,
        message: `Half-bathroom/powder room "${roomLabel(hb)}" is only adjacent to bedrooms — must be accessible from common/social zone (R-039).`,
        roomIds: [hb.id, ...adjacent.map(r => r.id)],
      }];
    });
  },
};

// IMPLEMENTED (adjacency proxy on rooms labelled terrace/balcony)
const RBv1_040: RuleCheck = {
  id: 'RBv1-040', ruleId: 'R-040',
  title: 'Terrace accessible from at least one indoor room',
  severity: 'error',
  applies(layout) {
    return validRooms(layout).some(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('terrace') || l.includes('balcony');
    });
  },
  check(layout): Violation[] {
    const terraces = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('terrace') || l.includes('balcony');
    });
    const indoorTypes = new Set([
      'bedroom', 'bathroom', 'kitchen', 'living', 'living room',
      'dining', 'office', 'hall', 'entry',
    ]);
    return terraces.flatMap(t => {
      const hasAccess = validRooms(layout)
        .filter(r => indoorTypes.has(r.type) && r.id !== t.id)
        .some(r => roomsAreAdjacent(t, r));
      if (hasAccess) return [];
      return [{ code: 'RBv1-040', severity: 'error' as const,
        message: `Terrace/balcony "${roomLabel(t)}" is not accessible from any indoor room (R-040).`,
        roomIds: [t.id] }];
    });
  },
};

// IMPLEMENTED
const RBv1_041: RuleCheck = {
  id: 'RBv1-041', ruleId: 'R-041',
  title: 'At least 50% of bedrooms grouped adjacently or sharing common corridor',
  severity: 'error',
  applies: layout => roomsByType(layout, 'bedroom').length >= 2,
  check(layout): Violation[] {
    const beds = roomsByType(layout, 'bedroom');
    const grouped = beds.filter(b =>
      beds.some(other => other.id !== b.id && roomsAreAdjacent(b, other))
    );
    const ratio = grouped.length / beds.length;
    if (ratio >= 0.5) return [];
    return [{ code: 'RBv1-041', severity: 'error',
      message: `Only ${grouped.length}/${beds.length} bedrooms are adjacent to another bedroom — at least 50% must be grouped (R-041).`,
      value: ratio, threshold: 0.5, roomIds: beds.map(b => b.id) }];
  },
};

// IMPLEMENTED
const RBv1_042: RuleCheck = {
  id: 'RBv1-042', ruleId: 'R-042',
  title: 'Hall/bedroom corridor must connect to at least 2 rooms',
  severity: 'error',
  applies: layout => roomsByType(layout, 'hall').length > 0,
  check(layout): Violation[] {
    const allRooms = validRooms(layout);
    return roomsByType(layout, 'hall').flatMap(hall => {
      const connected = allRooms.filter(r => r.id !== hall.id && roomsAreAdjacent(hall, r)).length;
      if (connected >= 2) return [];
      return [{ code: 'RBv1-042', severity: 'error' as const,
        message: `Hall "${roomLabel(hall)}" connects to only ${connected} room(s) — minimum 2 required (R-042).`,
        roomIds: [hall.id], value: connected, threshold: 2 }];
    });
  },
};

// IMPLEMENTED (adjacency exclusivity proxy — full check needs door graph)
const RBv1_043: RuleCheck = {
  id: 'RBv1-043', ruleId: 'R-043',
  title: 'Kitchen must not be accessible only through master bedroom',
  severity: 'error',
  applies: layout =>
    roomsByType(layout, 'kitchen').length > 0 &&
    roomsByType(layout, 'bedroom').some(isMasterBedroom),
  check(layout): Violation[] {
    return roomsByType(layout, 'kitchen').flatMap(k => {
      const adjacent = validRooms(layout).filter(r => r.id !== k.id && roomsAreAdjacent(k, r));
      if (adjacent.length === 0) return []; // isolated kitchen handled by R-026
      const allMasters = adjacent.every(r => r.type === 'bedroom' && isMasterBedroom(r));
      if (!allMasters) return [];
      return [{
        code: 'RBv1-043', severity: 'error' as const,
        message: `Kitchen "${roomLabel(k)}" is only adjacent to master bedroom(s) — kitchen must be accessible without traversing master bedroom (R-043).`,
        roomIds: [k.id, ...adjacent.map(r => r.id)],
      }];
    });
  },
};

// IMPLEMENTED
const RBv1_044: RuleCheck = {
  id: 'RBv1-044', ruleId: 'R-044', title: 'Storage room minimum area 1.5m²', severity: 'error',
  applies(layout) {
    return validRooms(layout).some(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('storage') || l.includes('store');
    });
  },
  check(layout, ctx): Violation[] {
    const threshold = areaM2(1.5, ctx);
    return validRooms(layout)
      .filter(r => { const l = (r.label ?? '').toLowerCase(); return l.includes('storage') || l.includes('store'); })
      .flatMap(r => {
        const area = roomArea(r);
        if (area >= threshold) return [];
        return [{ code: 'RBv1-044', severity: 'error' as const,
          message: `Storage room "${roomLabel(r)}" area ${area.toFixed(1)} ${ctx.units}² < 1.5m² minimum (R-044).`,
          roomIds: [r.id], value: area, threshold }];
      });
  },
};

// IMPLEMENTED
const RBv1_045: RuleCheck = {
  id: 'RBv1-045', ruleId: 'R-045', title: 'Laundry area minimum 2m²', severity: 'error',
  applies: layout => roomsByType(layout, 'laundry').length > 0,
  check(layout, ctx): Violation[] {
    const threshold = areaM2(2, ctx);
    return roomsByType(layout, 'laundry').flatMap(r => {
      const area = roomArea(r);
      if (area >= threshold) return [];
      return [{ code: 'RBv1-045', severity: 'error' as const,
        message: `Laundry "${roomLabel(r)}" area ${area.toFixed(1)} ${ctx.units}² < 2m² minimum (R-045).`,
        roomIds: [r.id], value: area, threshold }];
    });
  },
};

// IMPLEMENTED
const RBv1_046: RuleCheck = {
  id: 'RBv1-046', ruleId: 'R-046', title: 'Study/home office minimum floor area 5m²', severity: 'error',
  applies: layout => roomsByType(layout, 'office').length > 0,
  check(layout, ctx): Violation[] {
    const threshold = areaM2(5, ctx);
    return roomsByType(layout, 'office').flatMap(r => {
      const area = roomArea(r);
      if (area >= threshold) return [];
      return [{ code: 'RBv1-046', severity: 'error' as const,
        message: `Study/office "${roomLabel(r)}" area ${area.toFixed(1)} ${ctx.units}² < 5m² minimum (R-046).`,
        roomIds: [r.id], value: area, threshold }];
    });
  },
};

// IMPLEMENTED
const RBv1_047: RuleCheck = {
  id: 'RBv1-047', ruleId: 'R-047', title: 'Terrace minimum area 4m²', severity: 'error',
  applies(layout) {
    return validRooms(layout).some(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('terrace') || l.includes('balcony');
    });
  },
  check(layout, ctx): Violation[] {
    const threshold = areaM2(4, ctx);
    return validRooms(layout)
      .filter(r => { const l = (r.label ?? '').toLowerCase(); return l.includes('terrace') || l.includes('balcony'); })
      .flatMap(r => {
        const area = roomArea(r);
        if (area >= threshold) return [];
        return [{ code: 'RBv1-047', severity: 'error' as const,
          message: `Terrace/balcony "${roomLabel(r)}" area ${area.toFixed(1)} ${ctx.units}² < 4m² minimum (R-047).`,
          roomIds: [r.id], value: area, threshold }];
      });
  },
};

// IMPLEMENTED (requires DoorElement[])
const RBv1_048: RuleCheck = {
  id: 'RBv1-048', ruleId: 'R-048',
  title: 'Sliding door or large opening minimum clear width 1.20m',
  severity: 'error',
  applies: layout => (layout.doors ?? []).some(d => d.type === 'sliding'),
  check(layout, ctx): Violation[] {
    const doors = layout.doors;
    if (!doors || doors.length === 0) return [];
    const threshold = lenM(1.20, ctx);
    return doors
      .filter(d => d.type === 'sliding' && d.clearWidth < threshold)
      .map(d => ({
        code: 'RBv1-048', severity: 'error' as const,
        message: `Sliding door "${d.id}" clear width ${d.clearWidth.toFixed(2)}${ctx.units} < 1.20m minimum for terrace/large openings (R-048).`,
        value: d.clearWidth, threshold,
      }));
  },
};

// IMPLEMENTED
const RBv1_049: RuleCheck = {
  id: 'RBv1-049', ruleId: 'R-049', title: 'Closet minimum clear depth 0.55m', severity: 'error',
  applies: layout => roomsByType(layout, 'closet').length > 0,
  check(layout, ctx): Violation[] {
    const threshold = lenM(0.55, ctx);
    return roomsByType(layout, 'closet').flatMap(r => {
      const minDim = Math.min(r.width, r.height);
      if (minDim >= threshold) return [];
      return [{ code: 'RBv1-049', severity: 'error' as const,
        message: `Closet "${roomLabel(r)}" min depth ${minDim.toFixed(2)} ${ctx.units} < 0.55m minimum (R-049).`,
        roomIds: [r.id], value: minDim, threshold }];
    });
  },
};

// IMPLEMENTED (requires WindowElement[])
const RBv1_050: RuleCheck = {
  id: 'RBv1-050', ruleId: 'R-050',
  title: 'Window sill height minimum 0.60m above finished floor level',
  severity: 'error',
  applies: layout => (layout.windows?.length ?? 0) > 0,
  check(layout, ctx): Violation[] {
    const windows = layout.windows;
    if (!windows || windows.length === 0) return [];
    const threshold = lenM(0.60, ctx);
    return windows
      .filter(w => w.type !== 'clerestory' && w.sillHeight < threshold)
      .map(w => ({
        code: 'RBv1-050', severity: 'error' as const,
        message: `Window "${w.id}" (room: ${w.roomId}) sill height ${w.sillHeight.toFixed(2)}${ctx.units} < 0.60m minimum above FFL (R-050).`,
        value: w.sillHeight, threshold,
      }));
  },
};

// ── HARD: Plan Completeness and Labelling (R-096–R-101) ─────────────────────
// (IDs non-sequential per Rule Book note; hard constraint IDs resume at R-096)

// IMPLEMENTED
const RBv1_096: RuleCheck = {
  id: 'RBv1-096', ruleId: 'R-096', title: 'All rooms must have a room name label', severity: 'error',
  check(layout): Violation[] {
    return validRooms(layout)
      .filter(r => !r.label || r.label.trim() === '')
      .map(r => ({ code: 'RBv1-096', severity: 'error' as const,
        message: `Room "${r.id}" (${r.type}) has no label — all rooms must be labelled (R-096).`,
        roomIds: [r.id] }));
  },
};

// IMPLEMENTED (requires DoorElement[])
const RBv1_097: RuleCheck = {
  id: 'RBv1-097', ruleId: 'R-097', title: 'All doors must be indicated with a door symbol', severity: 'error',
  applies: layout => (layout.doors?.length ?? 0) > 0,
  check(layout): Violation[] {
    const doors = layout.doors;
    if (!doors || doors.length === 0) return [];
    // If DoorElement[] is present and non-empty, doors are annotated — check each has an id
    const malformed = doors.filter(d => !d.id || d.clearWidth <= 0);
    return malformed.map(d => ({
      code: 'RBv1-097', severity: 'error' as const,
      message: `Door element "${d.id ?? '(no id)'}" is missing a valid id or clearWidth — all doors must have complete door symbol annotations (R-097).`,
    }));
  },
};

// IMPLEMENTED (requires FloorLevelElement[])
const RBv1_098: RuleCheck = {
  id: 'RBv1-098', ruleId: 'R-098',
  title: 'Floor level annotations must be internally consistent (no contradictory NPT/FFL values)',
  severity: 'error',
  applies: layout => (layout.floorLevels?.length ?? 0) > 0,
  check(layout): Violation[] {
    const levels = layout.floorLevels;
    if (!levels || levels.length === 0) return [];
    // Check: no room may appear in two FloorLevelElements with different values
    const roomLevelMap = new Map<string, { value: number; levelId: string }>();
    const violations: Violation[] = [];
    for (const fl of levels) {
      for (const roomId of fl.zoneRoomIds) {
        const existing = roomLevelMap.get(roomId);
        if (existing && existing.value !== fl.value) {
          violations.push({
            code: 'RBv1-098', severity: 'error',
            message: `Room "${roomId}" has contradictory floor level annotations: ${existing.levelId} (${existing.value}) and ${fl.id} (${fl.value}) — floor levels must be internally consistent (R-098).`,
            roomIds: [roomId],
          });
        } else if (!existing) {
          roomLevelMap.set(roomId, { value: fl.value, levelId: fl.id });
        }
      }
    }
    return violations;
  },
};

// IMPLEMENTED (requires WallSegment[] — same perimeter coverage check as R-009, no gap > 0.05m)
const RBv1_099: RuleCheck = {
  id: 'RBv1-099', ruleId: 'R-099',
  title: 'Wall segments form continuous closed perimeter per room',
  severity: 'error',
  applies: layout => (layout.walls?.length ?? 0) > 0,
  check(layout): Violation[] {
    const walls = layout.walls;
    if (!walls || walls.length === 0) return [];
    const violations: Violation[] = [];
    for (const room of validRooms(layout)) {
      const sides = [
        { s: { x: room.x,              y: room.y              }, e: { x: room.x + room.width, y: room.y              } },
        { s: { x: room.x,              y: room.y + room.height }, e: { x: room.x + room.width, y: room.y + room.height } },
        { s: { x: room.x,              y: room.y              }, e: { x: room.x,              y: room.y + room.height } },
        { s: { x: room.x + room.width, y: room.y              }, e: { x: room.x + room.width, y: room.y + room.height } },
      ];
      const openSides = sides.filter(side => !walls.some(w => wallCoversSide(w, side.s, side.e)));
      if (openSides.length > 0) {
        violations.push({
          code: 'RBv1-099', severity: 'error',
          message: `Room "${roomLabel(room)}" has ${openSides.length} side(s) not covered by wall segments — wall segments must form a closed perimeter (R-099).`,
          roomIds: [room.id],
        });
      }
    }
    return violations;
  },
};

// IMPLEMENTED
const RBv1_100: RuleCheck = {
  id: 'RBv1-100', ruleId: 'R-100', title: 'Total plan footprint minimum 5m × 4m', severity: 'error',
  check(layout, ctx): Violation[] {
    const minW = lenM(5.0, ctx);
    const minD = lenM(4.0, ctx);
    const { width, depth } = layout.dimensions;
    if (width >= minW && depth >= minD) return [];
    return [{ code: 'RBv1-100', severity: 'error',
      message: `Plan dimensions ${width.toFixed(1)}×${depth.toFixed(1)} ${ctx.units} < 5m×4m minimum buildable footprint (R-100).`,
      value: Math.min(width / minW, depth / minD), threshold: 1.0 }];
  },
};

// IMPLEMENTED (requires DimensionAnnotationElement[])
const RBv1_101: RuleCheck = {
  id: 'RBv1-101', ruleId: 'R-101',
  title: 'Dimension strings must reference actual wall-to-wall distances',
  severity: 'error',
  applies: layout => (layout.dimensionAnnotations?.length ?? 0) > 0,
  check(layout): Violation[] {
    const annotations = layout.dimensionAnnotations;
    if (!annotations || annotations.length === 0) return [];
    const TOLERANCE = 0.05; // 5 cm tolerance for rounding
    return annotations.flatMap(ann => {
      const actual = Math.hypot(
        ann.toPoint.x - ann.fromPoint.x,
        ann.toPoint.y - ann.fromPoint.y,
      );
      if (Math.abs(ann.annotatedValue - actual) <= TOLERANCE) return [];
      return [{
        code: 'RBv1-101', severity: 'error' as const,
        message: `Dimension annotation "${ann.id}" shows ${ann.annotatedValue.toFixed(3)} but the actual distance between points is ${actual.toFixed(3)} (difference: ${Math.abs(ann.annotatedValue - actual).toFixed(3)}) — dimension strings must reference actual wall-to-wall distances (R-101).`,
        value: Math.abs(ann.annotatedValue - actual), threshold: TOLERANCE,
      }];
    });
  },
};

// ── SOFT CONSTRAINTS ──────────────────────────────────────────────────────────
// ── Group 6: Adjacency Preferences (R-051–R-065) ────────────────────────────

// IMPLEMENTED
const RBv1_051: RuleCheck = {
  id: 'RBv1-051', ruleId: 'R-051',
  title: 'Dining should be adjacent to or open-plan with living room',
  severity: 'warning',
  applies: layout =>
    roomsByType(layout, 'dining').length > 0 &&
    roomsByType(layout, 'living', 'living room').length > 0,
  check(layout): Violation[] {
    const anyAdj = roomsByType(layout, 'dining').some(d =>
      roomsByType(layout, 'living', 'living room').some(l => roomsAreAdjacent(d, l))
    );
    if (anyAdj) return [];
    const ids = [
      ...roomsByType(layout, 'dining').map(r => r.id),
      ...roomsByType(layout, 'living', 'living room').map(r => r.id),
    ];
    return [{ code: 'RBv1-051', severity: 'warning',
      message: 'Dining room should be adjacent to or open-plan with living room (R-051, weight 7/10).', roomIds: ids }];
  },
};

// IMPLEMENTED
const RBv1_052: RuleCheck = {
  id: 'RBv1-052', ruleId: 'R-052',
  title: 'Kitchen should have visual or direct access to dining room',
  severity: 'warning',
  applies: layout =>
    roomsByType(layout, 'kitchen').length > 0 && roomsByType(layout, 'dining').length > 0,
  check(layout): Violation[] {
    const anyAdj = roomsByType(layout, 'kitchen').some(k =>
      roomsByType(layout, 'dining').some(d => roomsAreAdjacent(k, d))
    );
    if (anyAdj) return [];
    const ids = [
      ...roomsByType(layout, 'kitchen').map(r => r.id),
      ...roomsByType(layout, 'dining').map(r => r.id),
    ];
    return [{ code: 'RBv1-052', severity: 'warning',
      message: 'Kitchen should have visual or direct access to dining room (R-052, weight 8/10).', roomIds: ids }];
  },
};

// IMPLEMENTED (requires siteOrientation)
const RBv1_053: RuleCheck = {
  id: 'RBv1-053', ruleId: 'R-053', title: 'Living room on primary elevation', severity: 'warning',
  applies: layout => !!layout.siteOrientation && roomsByType(layout, 'living', 'living room').length > 0,
  check(layout, ctx): Violation[] {
    if (!layout.siteOrientation) return [];
    return roomsByType(layout, 'living', 'living room')
      .filter(r => !roomFacingDirections(r, layout.siteOrientation!, ctx.dimW, ctx.dimD).has(layout.siteOrientation!))
      .map(r => ({
        code: 'RBv1-053', severity: 'warning' as const,
        message: `Living room "${roomLabel(r)}" is not on the primary (${layout.siteOrientation}) elevation — should face the main approach side (R-053, weight 6/10).`,
        roomIds: [r.id],
      }));
  },
};

// IMPLEMENTED
const RBv1_054: RuleCheck = {
  id: 'RBv1-054', ruleId: 'R-054',
  title: 'Master bedroom should be the largest bedroom',
  severity: 'warning',
  applies: layout =>
    roomsByType(layout, 'bedroom').some(isMasterBedroom) &&
    roomsByType(layout, 'bedroom').length >= 2,
  check(layout, ctx): Violation[] {
    const beds = roomsByType(layout, 'bedroom');
    const masters = beds.filter(isMasterBedroom);
    if (masters.length === 0) return [];
    const maxArea    = Math.max(...beds.map(roomArea));
    const masterArea = Math.max(...masters.map(roomArea));
    if (masterArea >= maxArea - 0.01) return [];
    const larger = beds.filter(b => !isMasterBedroom(b) && roomArea(b) > masterArea);
    return [{ code: 'RBv1-054', severity: 'warning',
      message: `Master bedroom (${masterArea.toFixed(1)} ${ctx.units}²) is not the largest bedroom (R-054, weight 8/10).`,
      roomIds: [...masters.map(r => r.id), ...larger.map(r => r.id)],
      value: masterArea, threshold: maxArea }];
  },
};

// IMPLEMENTED (adjacency proxy — full check needs door connection graph)
const RBv1_055: RuleCheck = {
  id: 'RBv1-055', ruleId: 'R-055',
  title: 'Bathroom door should not open into living room or entrance',
  severity: 'warning',
  applies: layout => {
    const entryTypes = new Set(['entry', 'entrance', 'foyer', 'vestibule']);
    return (
      roomsByType(layout, 'bathroom').length > 0 &&
      (roomsByType(layout, 'living', 'living room').length > 0 ||
       validRooms(layout).some(r => entryTypes.has(r.type) || entryTypes.has((r.label ?? '').toLowerCase())))
    );
  },
  check(layout): Violation[] {
    const entryTypes = new Set(['entry', 'entrance', 'foyer', 'vestibule']);
    const badZoneIds = new Set([
      ...roomsByType(layout, 'living', 'living room').map(r => r.id),
      ...validRooms(layout)
        .filter(r => entryTypes.has(r.type) || entryTypes.has((r.label ?? '').toLowerCase()))
        .map(r => r.id),
    ]);
    return roomsByType(layout, 'bathroom').flatMap(bath => {
      const badNeighbours = validRooms(layout).filter(r => badZoneIds.has(r.id) && roomsAreAdjacent(bath, r));
      if (badNeighbours.length === 0) return [];
      return [{
        code: 'RBv1-055', severity: 'warning' as const,
        message: `Bathroom "${roomLabel(bath)}" is adjacent to ${badNeighbours.map(r => `"${roomLabel(r)}"`).join(', ')} — bathroom door should not open directly into living room or entrance (R-055, weight 7/10).`,
        roomIds: [bath.id, ...badNeighbours.map(r => r.id)],
      }];
    });
  },
};

// IMPLEMENTED (adjacency proxy — full check needs door connection graph)
const RBv1_056: RuleCheck = {
  id: 'RBv1-056', ruleId: 'R-056',
  title: 'Kitchen should not open directly to main entrance without intermediate space',
  severity: 'warning',
  applies: layout => {
    const entryTypes = new Set(['entry', 'entrance', 'foyer', 'vestibule']);
    return (
      roomsByType(layout, 'kitchen').length > 0 &&
      validRooms(layout).some(r => entryTypes.has(r.type) || entryTypes.has((r.label ?? '').toLowerCase()))
    );
  },
  check(layout): Violation[] {
    const entryTypes = new Set(['entry', 'entrance', 'foyer', 'vestibule']);
    const entries = validRooms(layout).filter(
      r => entryTypes.has(r.type) || entryTypes.has((r.label ?? '').toLowerCase())
    );
    return roomsByType(layout, 'kitchen').flatMap(k => {
      const directToEntry = entries.filter(e => roomsAreAdjacent(k, e));
      if (directToEntry.length === 0) return [];
      return [{
        code: 'RBv1-056', severity: 'warning' as const,
        message: `Kitchen "${roomLabel(k)}" is directly adjacent to entrance "${roomLabel(directToEntry[0])}" — an intermediate space (hall or living) is preferred (R-056, weight 5/10).`,
        roomIds: [k.id, ...directToEntry.map(r => r.id)],
      }];
    });
  },
};

// IMPLEMENTED (adjacency proxy)
const RBv1_057: RuleCheck = {
  id: 'RBv1-057', ruleId: 'R-057',
  title: 'Terrace/balcony should be accessible from living or dining room',
  severity: 'warning',
  applies(layout) {
    return validRooms(layout).some(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('terrace') || l.includes('balcony');
    });
  },
  check(layout): Violation[] {
    const terraces = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('terrace') || l.includes('balcony');
    });
    const livingDining = roomsByType(layout, 'living', 'living room', 'dining');
    return terraces.flatMap(t => {
      if (livingDining.some(r => roomsAreAdjacent(t, r))) return [];
      return [{
        code: 'RBv1-057', severity: 'warning' as const,
        message: `Terrace/balcony "${roomLabel(t)}" is not accessible from living or dining room — preferred for indoor-outdoor flow (R-057, weight 7/10).`,
        roomIds: [t.id, ...livingDining.map(r => r.id)],
      }];
    });
  },
};

// IMPLEMENTED (adjacency proxy)
const RBv1_058: RuleCheck = {
  id: 'RBv1-058', ruleId: 'R-058',
  title: 'Study accessible from common areas, not buried in bedroom zone',
  severity: 'warning',
  applies: layout => roomsByType(layout, 'office').length > 0,
  check(layout): Violation[] {
    const commonZoneIds = new Set(
      roomsByType(layout, 'living', 'living room', 'dining', 'hall', 'entry', 'entrance').map(r => r.id)
    );
    return roomsByType(layout, 'office').flatMap(study => {
      const adjacent = validRooms(layout).filter(r => r.id !== study.id && roomsAreAdjacent(study, r));
      if (adjacent.length === 0 || adjacent.some(r => commonZoneIds.has(r.id))) return [];
      return [{
        code: 'RBv1-058', severity: 'warning' as const,
        message: `Study/office "${roomLabel(study)}" is not accessible from common areas — should be adjacent to living, dining, or hall (R-058, weight 5/10).`,
        roomIds: [study.id],
      }];
    });
  },
};

// IMPLEMENTED (adjacency proxy — full check needs door connection graph)
const RBv1_059: RuleCheck = {
  id: 'RBv1-059', ruleId: 'R-059',
  title: 'Laundry should not open directly into bedroom or living room',
  severity: 'warning',
  applies: layout => roomsByType(layout, 'laundry').length > 0,
  check(layout): Violation[] {
    const badNeighbourTypes = new Set(['bedroom', 'living', 'living room']);
    return roomsByType(layout, 'laundry').flatMap(laundry => {
      const badNeighbours = validRooms(layout).filter(
        r => badNeighbourTypes.has(r.type) && roomsAreAdjacent(laundry, r)
      );
      if (badNeighbours.length === 0) return [];
      return [{
        code: 'RBv1-059', severity: 'warning' as const,
        message: `Laundry "${roomLabel(laundry)}" is adjacent to ${badNeighbours.map(r => `"${roomLabel(r)}" (${r.type})`).join(', ')} — laundry should not open into bedroom or living room (R-059, weight 7/10).`,
        roomIds: [laundry.id, ...badNeighbours.map(r => r.id)],
      }];
    });
  },
};

// IMPLEMENTED (requires siteOrientation)
const RBv1_060: RuleCheck = {
  id: 'RBv1-060', ruleId: 'R-060',
  title: 'Service room at rear or side, not primary front elevation',
  severity: 'warning',
  applies: layout => !!layout.siteOrientation,
  check(layout, ctx): Violation[] {
    if (!layout.siteOrientation) return [];
    const serviceRooms = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('service') || l.includes('washing area') || l.includes('utility');
    });
    return serviceRooms
      .filter(r => roomFacingDirections(r, layout.siteOrientation!, ctx.dimW, ctx.dimD).has(layout.siteOrientation!))
      .map(r => ({
        code: 'RBv1-060', severity: 'warning' as const,
        message: `Service room "${roomLabel(r)}" faces the primary (${layout.siteOrientation}) elevation — should be at the rear or side of the plan (R-060, weight 5/10).`,
        roomIds: [r.id],
      }));
  },
};

// IMPLEMENTED (label-based adjacency)
const RBv1_061: RuleCheck = {
  id: 'RBv1-061', ruleId: 'R-061',
  title: 'Family room adjacent to living or dining zone',
  severity: 'warning',
  applies(layout) {
    return validRooms(layout).some(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('family room') || l.includes('sala familiar') || l.includes('family lounge');
    });
  },
  check(layout): Violation[] {
    const familyRooms = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('family room') || l.includes('sala familiar') || l.includes('family lounge');
    });
    const socialZone = roomsByType(layout, 'living', 'living room', 'dining');
    return familyRooms.flatMap(f => {
      if (socialZone.some(s => roomsAreAdjacent(f, s))) return [];
      return [{
        code: 'RBv1-061', severity: 'warning' as const,
        message: `Family room "${roomLabel(f)}" is not adjacent to living or dining zone (R-061, weight 6/10).`,
        roomIds: [f.id, ...socialZone.map(r => r.id)],
      }];
    });
  },
};

// IMPLEMENTED (label-based adjacency proxy)
const RBv1_062: RuleCheck = {
  id: 'RBv1-062', ruleId: 'R-062',
  title: 'Guest/half bathroom accessible from living or dining area',
  severity: 'warning',
  applies(layout) {
    return validRooms(layout).some(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('half bath') || l.includes('guest bath') || l.includes('powder room') || l.includes('powder');
    });
  },
  check(layout): Violation[] {
    const guestBaths = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('half bath') || l.includes('guest bath') || l.includes('powder room') || l.includes('powder');
    });
    const socialZoneIds = new Set(
      roomsByType(layout, 'living', 'living room', 'dining', 'hall').map(r => r.id)
    );
    return guestBaths.flatMap(gb => {
      const adjacent = validRooms(layout).filter(r => r.id !== gb.id && roomsAreAdjacent(gb, r));
      if (adjacent.some(r => socialZoneIds.has(r.id))) return [];
      return [{
        code: 'RBv1-062', severity: 'warning' as const,
        message: `Guest/half bathroom "${roomLabel(gb)}" is not accessible from living or dining area — should be in the social zone (R-062, weight 7/10).`,
        roomIds: [gb.id],
      }];
    });
  },
};

// IMPLEMENTED (adjacency proxy — closet between bedroom and corridor)
const RBv1_063: RuleCheck = {
  id: 'RBv1-063', ruleId: 'R-063',
  title: 'Closets positioned between bedroom and corridor as buffer zone',
  severity: 'warning',
  applies: layout =>
    roomsByType(layout, 'closet').length > 0 && roomsByType(layout, 'hall').length > 0,
  check(layout): Violation[] {
    const hallIds   = new Set(roomsByType(layout, 'hall').map(r => r.id));
    const bedIds    = new Set(roomsByType(layout, 'bedroom').map(r => r.id));
    return roomsByType(layout, 'closet').flatMap(cl => {
      const adjacent = validRooms(layout).filter(r => r.id !== cl.id && roomsAreAdjacent(cl, r));
      const adjBedroom = adjacent.some(r => bedIds.has(r.id));
      if (!adjBedroom) return []; // not a bedroom closet — skip
      const adjHall = adjacent.some(r => hallIds.has(r.id));
      if (adjHall) return []; // correctly positioned as buffer
      return [{
        code: 'RBv1-063', severity: 'warning' as const,
        message: `Closet "${roomLabel(cl)}" is adjacent to a bedroom but not to a corridor — closets should act as acoustic buffer between bedroom and hall (R-063, weight 5/10).`,
        roomIds: [cl.id],
      }];
    });
  },
};

// IMPLEMENTED (label-based adjacency)
const RBv1_064: RuleCheck = {
  id: 'RBv1-064', ruleId: 'R-064',
  title: 'Breakfast nook/pantry adjacent to kitchen, not isolated',
  severity: 'warning',
  applies(layout) {
    return validRooms(layout).some(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('breakfast') || l.includes('pantry') || l.includes('nook');
    });
  },
  check(layout): Violation[] {
    const nooks = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('breakfast') || l.includes('pantry') || l.includes('nook');
    });
    const kitchens = roomsByType(layout, 'kitchen');
    if (kitchens.length === 0) return [];
    return nooks.flatMap(n => {
      if (kitchens.some(k => roomsAreAdjacent(n, k))) return [];
      return [{
        code: 'RBv1-064', severity: 'warning' as const,
        message: `"${roomLabel(n)}" is not adjacent to kitchen — breakfast nooks and pantries should be adjacent to kitchen (R-064, weight 6/10).`,
        roomIds: [n.id, ...kitchens.map(r => r.id)],
      }];
    });
  },
};

// IMPLEMENTED
const RBv1_065: RuleCheck = {
  id: 'RBv1-065', ruleId: 'R-065',
  title: 'Master bedroom should not be adjacent to kitchen or laundry (noise/odour separation)',
  severity: 'warning',
  applies: layout => roomsByType(layout, 'bedroom').some(isMasterBedroom),
  check(layout): Violation[] {
    const masters = roomsByType(layout, 'bedroom').filter(isMasterBedroom);
    const noisy   = roomsByType(layout, 'kitchen', 'laundry');
    return masters.flatMap(m =>
      noisy.flatMap(n => {
        if (!roomsAreAdjacent(m, n)) return [];
        return [{ code: 'RBv1-065', severity: 'warning' as const,
          message: `Master bedroom "${roomLabel(m)}" is adjacent to "${roomLabel(n)}" (${n.type}) — noise/odour separation preferred (R-065, weight 6/10).`,
          roomIds: [m.id, n.id] }];
      })
    );
  },
};

// ── Group 7: Natural Light (R-066–R-075) ─────────────────────────────────────

// IMPLEMENTED (exterior-wall proxy)
const RBv1_066: RuleCheck = {
  id: 'RBv1-066', ruleId: 'R-066',
  title: 'Bedrooms should have at least one exterior wall position for a window',
  severity: 'warning',
  check(layout, ctx): Violation[] {
    return roomsByType(layout, 'bedroom')
      .filter(r => !touchesExterior(r, ctx.dimW, ctx.dimD))
      .map(r => ({ code: 'RBv1-066', severity: 'warning' as const,
        message: `Bedroom "${roomLabel(r)}" is fully interior — natural light not possible (R-066, weight 8/10).`,
        roomIds: [r.id] }));
  },
};

// IMPLEMENTED
const RBv1_067: RuleCheck = {
  id: 'RBv1-067', ruleId: 'R-067',
  title: 'Living room should have at least one exterior wall window',
  severity: 'warning',
  check(layout, ctx): Violation[] {
    return roomsByType(layout, 'living', 'living room')
      .filter(r => !touchesExterior(r, ctx.dimW, ctx.dimD))
      .map(r => ({ code: 'RBv1-067', severity: 'warning' as const,
        message: `Living room "${roomLabel(r)}" has no exterior wall — natural light strongly preferred (R-067, weight 9/10).`,
        roomIds: [r.id] }));
  },
};

// IMPLEMENTED
const RBv1_068: RuleCheck = {
  id: 'RBv1-068', ruleId: 'R-068',
  title: 'Kitchen should have at least one window or external opening',
  severity: 'warning',
  check(layout, ctx): Violation[] {
    return roomsByType(layout, 'kitchen')
      .filter(r => !touchesExterior(r, ctx.dimW, ctx.dimD))
      .map(r => ({ code: 'RBv1-068', severity: 'warning' as const,
        message: `Kitchen "${roomLabel(r)}" has no exterior wall — natural light and ventilation preferred (R-068, weight 7/10).`,
        roomIds: [r.id] }));
  },
};

// IMPLEMENTED (requires WindowElement[])
const RBv1_069: RuleCheck = {
  id: 'RBv1-069', ruleId: 'R-069',
  title: 'Bathrooms on exterior walls should include a window',
  severity: 'warning',
  applies: layout => (layout.windows?.length ?? 0) > 0,
  check(layout, ctx): Violation[] {
    const windows = layout.windows;
    if (!windows || windows.length === 0) return [];
    const windowRoomIds = new Set(windows.map(w => w.roomId));
    return roomsByType(layout, 'bathroom')
      .filter(r => touchesExterior(r, ctx.dimW, ctx.dimD) && !windowRoomIds.has(r.id))
      .map(r => ({
        code: 'RBv1-069', severity: 'warning' as const,
        message: `Bathroom "${roomLabel(r)}" is on an exterior wall but has no window — bathrooms on exterior walls should include a window (R-069, weight 5/10).`,
        roomIds: [r.id],
      }));
  },
};

// IMPLEMENTED (requires WindowElement[] or glazed DoorElement[])
const RBv1_070: RuleCheck = {
  id: 'RBv1-070', ruleId: 'R-070', title: 'Main entrance should have natural light', severity: 'warning',
  applies: layout =>
    getEntrances(layout).length > 0 &&
    ((layout.windows?.length ?? 0) > 0 || (layout.doors?.length ?? 0) > 0),
  check(layout): Violation[] {
    const entrances = getEntrances(layout);
    if (entrances.length === 0) return [];
    const windowRoomIds = new Set((layout.windows ?? []).map(w => w.roomId));
    const glazedDoorRoomIds = new Set(
      (layout.doors ?? [])
        .filter(d => d.type === 'entrance' || d.type === 'sliding')
        .flatMap(d => [d.fromRoomId, d.toRoomId].filter((id): id is string => id != null))
    );
    return entrances
      .filter(e => !windowRoomIds.has(e.id) && !glazedDoorRoomIds.has(e.id))
      .map(e => ({
        code: 'RBv1-070', severity: 'warning' as const,
        message: `Entrance "${roomLabel(e)}" has no window or glazed door — main entrance should have natural light (R-070, weight 6/10).`,
        roomIds: [e.id],
      }));
  },
};

// IMPLEMENTED (requires siteOrientation; proxy: terrace must touch an exterior wall)
const RBv1_071: RuleCheck = {
  id: 'RBv1-071', ruleId: 'R-071',
  title: 'Terrace should face an unobstructed external direction',
  severity: 'warning',
  applies: layout => !!layout.siteOrientation,
  check(layout, ctx): Violation[] {
    if (!layout.siteOrientation) return [];
    const terraces = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('terrace') || l.includes('balcony');
    });
    return terraces
      .filter(r => !touchesExterior(r, ctx.dimW, ctx.dimD))
      .map(r => ({
        code: 'RBv1-071', severity: 'warning' as const,
        message: `Terrace/balcony "${roomLabel(r)}" does not touch any exterior wall — should face an unobstructed external direction (R-071, weight 6/10).`,
        roomIds: [r.id],
      }));
  },
};

// IMPLEMENTED
const RBv1_072: RuleCheck = {
  id: 'RBv1-072', ruleId: 'R-072',
  title: 'Dining room should have at least one window',
  severity: 'warning',
  check(layout, ctx): Violation[] {
    return roomsByType(layout, 'dining')
      .filter(r => !touchesExterior(r, ctx.dimW, ctx.dimD))
      .map(r => ({ code: 'RBv1-072', severity: 'warning' as const,
        message: `Dining room "${roomLabel(r)}" has no exterior wall — natural light preferred (R-072, weight 7/10).`,
        roomIds: [r.id] }));
  },
};

// IMPLEMENTED
const RBv1_073: RuleCheck = {
  id: 'RBv1-073', ruleId: 'R-073',
  title: 'Study room should have at least one window',
  severity: 'warning',
  check(layout, ctx): Violation[] {
    return roomsByType(layout, 'office')
      .filter(r => !touchesExterior(r, ctx.dimW, ctx.dimD))
      .map(r => ({ code: 'RBv1-073', severity: 'warning' as const,
        message: `Study/office "${roomLabel(r)}" has no exterior wall — natural light preferred (R-073, weight 7/10).`,
        roomIds: [r.id] }));
  },
};

// IMPLEMENTED
const RBv1_074: RuleCheck = {
  id: 'RBv1-074', ruleId: 'R-074',
  title: 'Fully interior bathrooms flagged as design constraint',
  severity: 'warning',
  check(layout, ctx): Violation[] {
    return roomsByType(layout, 'bathroom')
      .filter(r => !touchesExterior(r, ctx.dimW, ctx.dimD))
      .map(r => ({ code: 'RBv1-074', severity: 'warning' as const,
        message: `Bathroom "${roomLabel(r)}" is fully interior — flagged as design constraint (R-074, weight 4/10).`,
        roomIds: [r.id] }));
  },
};

// IMPLEMENTED (exterior wall proxy for long corridors)
const RBv1_075: RuleCheck = {
  id: 'RBv1-075', ruleId: 'R-075',
  title: 'Corridors longer than 4m should have natural light at one or both ends',
  severity: 'warning',
  applies: layout => roomsByType(layout, 'hall').length > 0,
  check(layout, ctx): Violation[] {
    const threshold = lenM(4.0, ctx);
    return roomsByType(layout, 'hall').flatMap(hall => {
      const maxDim = Math.max(hall.width, hall.height);
      if (maxDim <= threshold) return [];
      if (touchesExterior(hall, ctx.dimW, ctx.dimD)) return [];
      return [{
        code: 'RBv1-075', severity: 'warning' as const,
        message: `Corridor "${roomLabel(hall)}" is ${maxDim.toFixed(1)}${ctx.units === 'meters' ? 'm' : 'ft'} long but has no exterior wall exposure — corridors > 4m should have natural light at one or both ends (R-075, weight 5/10).`,
        roomIds: [hall.id], value: maxDim, threshold,
      }];
    });
  },
};

// ── Group 8: Orientation (R-076–R-085) — require siteOrientation field ──────

// IMPLEMENTED (requires siteOrientation)
const RBv1_076: RuleCheck = {
  id: 'RBv1-076', ruleId: 'R-076',
  title: 'Main entrance faces primary street or approach side',
  severity: 'warning',
  applies: layout => !!layout.siteOrientation && getEntrances(layout).length > 0,
  check(layout, ctx): Violation[] {
    if (!layout.siteOrientation) return [];
    return getEntrances(layout)
      .filter(e => !roomFacingDirections(e, layout.siteOrientation!, ctx.dimW, ctx.dimD).has(layout.siteOrientation!))
      .map(e => ({
        code: 'RBv1-076', severity: 'warning' as const,
        message: `Entrance "${roomLabel(e)}" does not face the primary (${layout.siteOrientation}) elevation — should face the main street/approach side (R-076, weight 6/10).`,
        roomIds: [e.id],
      }));
  },
};

// IMPLEMENTED (requires siteOrientation; S and W are preferred for terraces)
const RBv1_077: RuleCheck = {
  id: 'RBv1-077', ruleId: 'R-077',
  title: 'Terrace/principal outdoor space faces south or west',
  severity: 'warning',
  applies: layout => !!layout.siteOrientation,
  check(layout, ctx): Violation[] {
    if (!layout.siteOrientation) return [];
    const terraces = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('terrace') || l.includes('balcony') || l.includes('outdoor') || l.includes('courtyard');
    });
    const preferredDirs = new Set(['S', 'W', 'SW', 'SE']);
    return terraces
      .filter(r => {
        const dirs = roomFacingDirections(r, layout.siteOrientation!, ctx.dimW, ctx.dimD);
        return dirs.size > 0 && ![...dirs].some(d => preferredDirs.has(d));
      })
      .map(r => ({
        code: 'RBv1-077', severity: 'warning' as const,
        message: `Terrace/balcony "${roomLabel(r)}" does not face south or west — preferred outdoor orientation for sun exposure (R-077, weight 5/10).`,
        roomIds: [r.id],
      }));
  },
};

// IMPLEMENTED (requires siteOrientation)
const RBv1_078: RuleCheck = {
  id: 'RBv1-078', ruleId: 'R-078',
  title: 'Living room windows avoid north-facing orientation',
  severity: 'warning',
  applies: layout => !!layout.siteOrientation && roomsByType(layout, 'living', 'living room').length > 0,
  check(layout, ctx): Violation[] {
    if (!layout.siteOrientation) return [];
    // Resolve which plan edge corresponds to north based on siteOrientation
    type EM = Record<string, string>;
    const northEdge: EM = { N: 'top', S: 'bottom', E: 'left', W: 'right', NE: 'top', NW: 'top', SE: 'bottom', SW: 'bottom' };
    const edge = northEdge[layout.siteOrientation] ?? 'top';
    return roomsByType(layout, 'living', 'living room')
      .filter(r => {
        // Room faces north if it touches the north edge
        const dirs = roomFacingDirections(r, layout.siteOrientation!, ctx.dimW, ctx.dimD);
        return dirs.has('N') || dirs.has('NE') || dirs.has('NW');
      })
      .map(r => ({
        code: 'RBv1-078', severity: 'warning' as const,
        message: `Living room "${roomLabel(r)}" has a north-facing exterior wall — living room windows should avoid north-facing orientation where possible (R-078, weight 4/10).`,
        roomIds: [r.id],
      }));
  },
};

// IMPLEMENTED (requires siteOrientation; garage adjacency to entrance proxy)
const RBv1_079: RuleCheck = {
  id: 'RBv1-079', ruleId: 'R-079',
  title: 'Garage access does not conflict with pedestrian entrance path',
  severity: 'warning',
  applies: layout => !!layout.siteOrientation && roomsByType(layout, 'garage').length > 0,
  check(layout): Violation[] {
    if (!layout.siteOrientation) return [];
    const entrances = getEntrances(layout);
    const garages = roomsByType(layout, 'garage');
    // Flag if any garage is adjacent to any entrance (pedestrian path conflict)
    return garages.flatMap(g =>
      entrances.flatMap(e => {
        if (!roomsAreAdjacent(g, e)) return [];
        return [{
          code: 'RBv1-079', severity: 'warning' as const,
          message: `Garage "${roomLabel(g)}" is directly adjacent to entrance "${roomLabel(e)}" — garage access should not conflict with the pedestrian path (R-079, weight 6/10).`,
          roomIds: [g.id, e.id],
        }];
      })
    );
  },
};

// IMPLEMENTED (requires siteOrientation)
const RBv1_080: RuleCheck = {
  id: 'RBv1-080', ruleId: 'R-080',
  title: 'Service yard faces rear or side of site',
  severity: 'warning',
  applies: layout => !!layout.siteOrientation,
  check(layout, ctx): Violation[] {
    if (!layout.siteOrientation) return [];
    const serviceYards = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('service yard') || l.includes('service area');
    });
    return serviceYards
      .filter(r => roomFacingDirections(r, layout.siteOrientation!, ctx.dimW, ctx.dimD).has(layout.siteOrientation!))
      .map(r => ({
        code: 'RBv1-080', severity: 'warning' as const,
        message: `Service yard "${roomLabel(r)}" faces the primary (${layout.siteOrientation}) elevation — should be at the rear or side (R-080, weight 5/10).`,
        roomIds: [r.id],
      }));
  },
};

// IMPLEMENTED (requires siteOrientation)
const RBv1_081: RuleCheck = {
  id: 'RBv1-081', ruleId: 'R-081',
  title: 'Bedroom windows avoid direct west-facing in warm climates without shading',
  severity: 'warning',
  applies: layout => !!layout.siteOrientation && roomsByType(layout, 'bedroom').length > 0,
  check(layout, ctx): Violation[] {
    if (!layout.siteOrientation) return [];
    return roomsByType(layout, 'bedroom')
      .filter(r => {
        const dirs = roomFacingDirections(r, layout.siteOrientation!, ctx.dimW, ctx.dimD);
        return dirs.has('W') || dirs.has('SW') || dirs.has('NW');
      })
      .map(r => ({
        code: 'RBv1-081', severity: 'warning' as const,
        message: `Bedroom "${roomLabel(r)}" has a west-facing exterior wall — west-facing bedrooms are susceptible to afternoon heat gain in warm climates (R-081, weight 3/10).`,
        roomIds: [r.id],
      }));
  },
};

// IMPLEMENTED (label-based; marquee/canopy should not appear away from entrance)
const RBv1_082: RuleCheck = {
  id: 'RBv1-082', ruleId: 'R-082',
  title: 'Entrance marquee/canopy at main entrance only',
  severity: 'warning',
  applies: layout => validRooms(layout).some(r => {
    const l = (r.label ?? '').toLowerCase();
    return l.includes('canopy') || l.includes('marquee') || l.includes('porch');
  }),
  check(layout): Violation[] {
    const canopyRooms = validRooms(layout).filter(r => {
      const l = (r.label ?? '').toLowerCase();
      return l.includes('canopy') || l.includes('marquee') || l.includes('porch');
    });
    const entrances = getEntrances(layout);
    return canopyRooms
      .filter(c => !entrances.some(e => roomsAreAdjacent(c, e)))
      .map(c => ({
        code: 'RBv1-082', severity: 'warning' as const,
        message: `Canopy/marquee "${roomLabel(c)}" is not adjacent to an entrance room — should be located at the main entrance only (R-082, weight 4/10).`,
        roomIds: [c.id],
      }));
  },
};

// IMPLEMENTED (requires siteOrientation; garage door should face the approach side)
const RBv1_083: RuleCheck = {
  id: 'RBv1-083', ruleId: 'R-083',
  title: 'Garage door faces driveway or approach side',
  severity: 'warning',
  applies: layout => !!layout.siteOrientation && roomsByType(layout, 'garage').length > 0,
  check(layout, ctx): Violation[] {
    if (!layout.siteOrientation) return [];
    return roomsByType(layout, 'garage')
      .filter(r => !roomFacingDirections(r, layout.siteOrientation!, ctx.dimW, ctx.dimD).has(layout.siteOrientation!))
      .map(r => ({
        code: 'RBv1-083', severity: 'warning' as const,
        message: `Garage "${roomLabel(r)}" does not face the primary (${layout.siteOrientation}) approach side — the garage door should face the driveway direction (R-083, weight 5/10).`,
        roomIds: [r.id],
      }));
  },
};

// IMPLEMENTED (requires FireplaceElement[] — fireplace must be on exterior wall)
const RBv1_084: RuleCheck = {
  id: 'RBv1-084', ruleId: 'R-084',
  title: 'Fireplace positioned on external wall for chimney routing',
  severity: 'warning',
  applies: layout => (layout.fireplaces?.length ?? 0) > 0,
  check(layout, ctx): Violation[] {
    const fireplaces = layout.fireplaces;
    if (!fireplaces || fireplaces.length === 0) return [];
    const roomMap = new Map(validRooms(layout).map(r => [r.id, r]));
    return fireplaces.flatMap(fp => {
      const room = roomMap.get(fp.roomId);
      if (!room) return [];
      if (touchesExterior(room, ctx.dimW, ctx.dimD)) return [];
      return [{
        code: 'RBv1-084', severity: 'warning' as const,
        message: `Fireplace "${fp.id}" is in room "${roomLabel(room)}" which is fully interior — fireplaces should be on an external wall to allow chimney routing (R-084, weight 6/10).`,
        roomIds: [room.id],
      }];
    });
  },
};

// IMPLEMENTED (requires siteOrientation + FloorLevelElement[]; step-down toward garden not street)
const RBv1_085: RuleCheck = {
  id: 'RBv1-085', ruleId: 'R-085',
  title: 'Floor level step-downs to terrace toward garden side, not street side',
  severity: 'warning',
  applies: layout => !!layout.siteOrientation && (layout.floorLevels?.length ?? 0) > 1,
  check(layout, ctx): Violation[] {
    if (!layout.siteOrientation) return [];
    const levels = layout.floorLevels;
    if (!levels || levels.length < 2) return [];
    const terraceRoomIds = new Set(
      validRooms(layout)
        .filter(r => { const l = (r.label ?? '').toLowerCase(); return l.includes('terrace') || l.includes('balcony'); })
        .map(r => r.id)
    );
    const roomMap = new Map(validRooms(layout).map(r => [r.id, r]));
    return levels.flatMap(fl => {
      if (fl.type !== 'step') return [];
      const terraceIds = fl.zoneRoomIds.filter(id => terraceRoomIds.has(id));
      if (terraceIds.length === 0) return [];
      return terraceIds.flatMap(id => {
        const room = roomMap.get(id);
        if (!room) return [];
        // Step-down to terrace is problematic if the terrace faces the primary (street) side
        if (roomFacingDirections(room, layout.siteOrientation!, ctx.dimW, ctx.dimD).has(layout.siteOrientation!)) {
          return [{
            code: 'RBv1-085', severity: 'warning' as const,
            message: `Floor level step-down to terrace "${roomLabel(room)}" is on the primary (${layout.siteOrientation}) street-facing side — step-downs should be toward the garden, not the street (R-085, weight 4/10).`,
            roomIds: [id],
          }];
        }
        return [];
      });
    });
  },
};

// ── Group 9: Functional Sufficiency (R-086–R-095) ───────────────────────────

// IMPLEMENTED (requires KitchenFixtureElement[])
const RBv1_086: RuleCheck = {
  id: 'RBv1-086', ruleId: 'R-086',
  title: 'Kitchen should have distinct cooking, washing, and storage zones',
  severity: 'warning',
  applies: layout => (layout.kitchenFixtures?.length ?? 0) > 0,
  check(layout): Violation[] {
    const fixtures = layout.kitchenFixtures;
    if (!fixtures || fixtures.length === 0) return [];
    const required: Array<'cooking' | 'washing' | 'storage'> = ['cooking', 'washing', 'storage'];
    return fixtures.flatMap(kf => {
      const missing = required.filter(z => !kf.zones.includes(z));
      if (missing.length === 0) return [];
      return [{
        code: 'RBv1-086', severity: 'warning' as const,
        message: `Kitchen fixture "${kf.id}" (room: ${kf.roomId}) is missing zones: ${missing.join(', ')} — kitchens should have cooking, washing, and storage zones (R-086, weight 8/10).`,
      }];
    });
  },
};

// IMPLEMENTED (requires BathroomFixtureElement[])
const RBv1_087: RuleCheck = {
  id: 'RBv1-087', ruleId: 'R-087',
  title: 'Bathroom should contain at least one fixture zone (WC, bath, or shower)',
  severity: 'warning',
  applies: layout => (layout.bathroomFixtures?.length ?? 0) > 0,
  check(layout): Violation[] {
    const fixtures = layout.bathroomFixtures;
    if (!fixtures || fixtures.length === 0) return [];
    const validFixtures = new Set<string>(['wc', 'bath', 'shower']);
    return fixtures
      .filter(bf => !bf.fixtures.some(f => validFixtures.has(f)))
      .map(bf => ({
        code: 'RBv1-087', severity: 'warning' as const,
        message: `Bathroom fixture "${bf.id}" (room: ${bf.roomId}) has no WC, bath, or shower — bathrooms must contain at least one fixture zone (R-087, weight 9/10).`,
      }));
  },
};

// IMPLEMENTED
const RBv1_088: RuleCheck = {
  id: 'RBv1-088', ruleId: 'R-088',
  title: 'Living room minimum seating group clear zone 2.5m × 3.0m',
  severity: 'warning',
  check(layout, ctx): Violation[] {
    const w = lenM(2.5, ctx); const d = lenM(3.0, ctx);
    return roomsByType(layout, 'living', 'living room').flatMap(r => {
      if ((r.width >= w && r.height >= d) || (r.width >= d && r.height >= w)) return [];
      return [{ code: 'RBv1-088', severity: 'warning' as const,
        message: `Living room "${roomLabel(r)}" (${r.width.toFixed(1)}×${r.height.toFixed(1)}) cannot fit 2.5m×3.0m seating group (R-088, weight 8/10).`,
        roomIds: [r.id] }];
    });
  },
};

// IMPLEMENTED
const RBv1_089: RuleCheck = {
  id: 'RBv1-089', ruleId: 'R-089',
  title: 'Dining room minimum table clear zone 2.0m × 2.0m',
  severity: 'warning',
  check(layout, ctx): Violation[] {
    const min = lenM(2.0, ctx);
    return roomsByType(layout, 'dining').flatMap(r => {
      if (r.width >= min && r.height >= min) return [];
      return [{ code: 'RBv1-089', severity: 'warning' as const,
        message: `Dining room "${roomLabel(r)}" cannot fit 2.0m×2.0m dining table zone (R-089, weight 7/10).`,
        roomIds: [r.id] }];
    });
  },
};

// IMPLEMENTED
const RBv1_090: RuleCheck = {
  id: 'RBv1-090', ruleId: 'R-090',
  title: 'Master bedroom minimum double bed clear zone 1.6m × 2.1m',
  severity: 'warning',
  applies: layout => roomsByType(layout, 'bedroom').some(isMasterBedroom),
  check(layout, ctx): Violation[] {
    const w = lenM(1.6, ctx); const d = lenM(2.1, ctx);
    return roomsByType(layout, 'bedroom').filter(isMasterBedroom).flatMap(r => {
      if ((r.width >= w && r.height >= d) || (r.width >= d && r.height >= w)) return [];
      return [{ code: 'RBv1-090', severity: 'warning' as const,
        message: `Master bedroom "${roomLabel(r)}" (${r.width.toFixed(1)}×${r.height.toFixed(1)}) cannot fit 1.6m×2.1m double bed zone (R-090, weight 9/10).`,
        roomIds: [r.id] }];
    });
  },
};

// IMPLEMENTED
const RBv1_091: RuleCheck = {
  id: 'RBv1-091', ruleId: 'R-091',
  title: 'Secondary bedrooms minimum single bed clear zone 0.9m × 2.0m',
  severity: 'warning',
  applies: layout => roomsByType(layout, 'bedroom').some(r => !isMasterBedroom(r)),
  check(layout, ctx): Violation[] {
    const w = lenM(0.9, ctx); const d = lenM(2.0, ctx);
    return roomsByType(layout, 'bedroom').filter(r => !isMasterBedroom(r)).flatMap(r => {
      if ((r.width >= w && r.height >= d) || (r.width >= d && r.height >= w)) return [];
      return [{ code: 'RBv1-091', severity: 'warning' as const,
        message: `Bedroom "${roomLabel(r)}" (${r.width.toFixed(1)}×${r.height.toFixed(1)}) cannot fit 0.9m×2.0m single bed (R-091, weight 7/10).`,
        roomIds: [r.id] }];
    });
  },
};

// IMPLEMENTED
const RBv1_092: RuleCheck = {
  id: 'RBv1-092', ruleId: 'R-092',
  title: 'Garage should accommodate standard car 2.0m × 4.5m clear zone',
  severity: 'warning',
  applies: layout => roomsByType(layout, 'garage').length > 0,
  check(layout, ctx): Violation[] {
    const w = lenM(2.0, ctx); const d = lenM(4.5, ctx);
    return roomsByType(layout, 'garage').flatMap(r => {
      if ((r.width >= w && r.height >= d) || (r.width >= d && r.height >= w)) return [];
      return [{ code: 'RBv1-092', severity: 'warning' as const,
        message: `Garage "${roomLabel(r)}" (${r.width.toFixed(1)}×${r.height.toFixed(1)}) cannot fit 2.0m×4.5m car clear zone (R-092, weight 8/10).`,
        roomIds: [r.id] }];
    });
  },
};

// IMPLEMENTED
const RBv1_093: RuleCheck = {
  id: 'RBv1-093', ruleId: 'R-093',
  title: 'Study room should accommodate desk and chair 1.2m × 1.8m clear zone',
  severity: 'warning',
  applies: layout => roomsByType(layout, 'office').length > 0,
  check(layout, ctx): Violation[] {
    const w = lenM(1.2, ctx); const d = lenM(1.8, ctx);
    return roomsByType(layout, 'office').flatMap(r => {
      if ((r.width >= w && r.height >= d) || (r.width >= d && r.height >= w)) return [];
      return [{ code: 'RBv1-093', severity: 'warning' as const,
        message: `Study/office "${roomLabel(r)}" (${r.width.toFixed(1)}×${r.height.toFixed(1)}) cannot fit 1.2m×1.8m desk zone (R-093, weight 6/10).`,
        roomIds: [r.id] }];
    });
  },
};

// IMPLEMENTED (requires KitchenFixtureElement[])
const RBv1_094: RuleCheck = {
  id: 'RBv1-094', ruleId: 'R-094', title: 'Kitchen counter minimum depth 0.60m', severity: 'warning',
  applies: layout => (layout.kitchenFixtures ?? []).some(kf => kf.counterDepth !== undefined),
  check(layout, ctx): Violation[] {
    const fixtures = layout.kitchenFixtures;
    if (!fixtures || fixtures.length === 0) return [];
    const threshold = lenM(0.60, ctx);
    return fixtures
      .filter(kf => kf.counterDepth !== undefined && kf.counterDepth < threshold)
      .map(kf => ({
        code: 'RBv1-094', severity: 'warning' as const,
        message: `Kitchen "${kf.roomId}" counter depth ${kf.counterDepth!.toFixed(2)}${ctx.units} < 0.60m minimum for kitchen bench (R-094, weight 7/10).`,
        value: kf.counterDepth, threshold,
      }));
  },
};

// IMPLEMENTED (Phase 3 — differentiated from R-049)
// R-049 fires a hard error when closet depth < 0.55m.
// R-095 adds a soft quality warning for closets that pass R-049 (depth ≥ 0.55m)
// but fall short of the recommended ideal depth of 0.60m for comfortable hanging.
// This avoids true redundancy: R-049 blocks, R-095 scores.
const RBv1_095: RuleCheck = {
  id: 'RBv1-095', ruleId: 'R-095',
  title: 'Closet interior depth: ideal 0.60m for comfortable hanging clothes',
  severity: 'warning',
  applies: layout => roomsByType(layout, 'closet').length > 0,
  check(layout, ctx): Violation[] {
    const hardMin  = lenM(0.55, ctx); // R-049 threshold — closets below this already flagged as error
    const idealMin = lenM(0.60, ctx); // recommended comfortable depth
    return roomsByType(layout, 'closet').flatMap(r => {
      const minDim = Math.min(r.width, r.height);
      // Only warn on closets that technically pass R-049 but are below ideal depth
      if (minDim < hardMin || minDim >= idealMin) return [];
      return [{ code: 'RBv1-095', severity: 'warning' as const,
        message: `Closet "${roomLabel(r)}" depth ${minDim.toFixed(2)}${ctx.units} meets the 0.55m hard minimum (R-049) but is below the recommended 0.60m ideal depth for comfortable hanging — consider widening (R-095, weight 8/10).`,
        roomIds: [r.id], value: minDim, threshold: idealMin }];
    });
  },
};

// ── Group 10: Plan Completeness and Labelling — Soft (R-102–R-103) ───────────

// IMPLEMENTED (Phase 3 — requires ViewportLabelElement[] from the 3D viewport pipeline)
// Each ViewportLabelElement carries the rendered bounding box of a room-name label.
// Two overlap classes are detected:
//   1. Label-geometry: label box overlaps another room's bounding box (leaks outside host room)
//   2. Label-label: two label boxes overlap each other (collision in the canvas)
const RBv1_102: RuleCheck = {
  id: 'RBv1-102', ruleId: 'R-102',
  title: 'Room labels should not visually overlap room geometry or furniture symbols',
  severity: 'warning',
  applies: layout => (layout.viewportLabels?.length ?? 0) > 0,
  check(layout): Violation[] {
    const labels = layout.viewportLabels;
    if (!labels || labels.length === 0) return [];
    const rooms = validRooms(layout);
    const violations: Violation[] = [];

    // Helper: axis-aligned bounding-box overlap (strict — touching edges = no overlap)
    function boxesOverlap(
      ax: number, ay: number, aw: number, ah: number,
      bx: number, by: number, bw: number, bh: number,
    ): boolean {
      return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    }

    // Check 1 — label leaks into another room's bounding box
    for (const label of labels) {
      const lx = label.position.x - label.size.width  / 2;
      const ly = label.position.y - label.size.height / 2;
      for (const room of rooms) {
        if (room.id === label.roomId) continue; // label inside its own room is fine
        if (boxesOverlap(lx, ly, label.size.width, label.size.height, room.x, room.y, room.width, room.height)) {
          violations.push({
            code: 'RBv1-102', severity: 'warning',
            message: `Label for room "${label.roomId}" visually overlaps room "${roomLabel(room)}" — label repositioning needed (R-102, weight 4/10).`,
            roomIds: [label.roomId, room.id],
          });
        }
      }
    }

    // Check 2 — two labels overlap each other
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i], b = labels[j];
        const ax = a.position.x - a.size.width  / 2;
        const ay = a.position.y - a.size.height / 2;
        const bx = b.position.x - b.size.width  / 2;
        const by = b.position.y - b.size.height / 2;
        if (boxesOverlap(ax, ay, a.size.width, a.size.height, bx, by, b.size.width, b.size.height)) {
          violations.push({
            code: 'RBv1-102', severity: 'warning',
            message: `Labels for rooms "${a.roomId}" and "${b.roomId}" visually overlap each other — label layout collision (R-102, weight 4/10).`,
            roomIds: [a.roomId, b.roomId],
          });
        }
      }
    }

    return violations;
  },
};

// IMPLEMENTED
const RBv1_103: RuleCheck = {
  id: 'RBv1-103', ruleId: 'R-103',
  title: 'Total plan aspect ratio must not exceed 5:1',
  severity: 'warning',
  check(layout): Violation[] {
    const { width, depth } = layout.dimensions;
    if (depth <= 0) return [];
    const ratio = Math.max(width, depth) / Math.min(width, depth);
    if (ratio <= 5) return [];
    return [{ code: 'RBv1-103', severity: 'warning',
      message: `Plan aspect ratio ${ratio.toFixed(1)}:1 exceeds 5:1 maximum for a buildable form (R-103, weight 5/10).`,
      value: ratio, threshold: 5 }];
  },
};

// ── Registry ─────────────────────────────────────────────────────────────────

export const RULEBOOK_V1_CHECKS: readonly RuleCheck[] = [
  // Hard: Connectivity and Access (R-001–R-010)
  RBv1_001, RBv1_002, RBv1_003, RBv1_004, RBv1_005,
  RBv1_006, RBv1_007, RBv1_008, RBv1_009, RBv1_010,
  // Hard: Room Area Minimums (R-011–R-020)
  RBv1_011, RBv1_012, RBv1_013, RBv1_014, RBv1_015,
  RBv1_016, RBv1_017, RBv1_018, RBv1_019, RBv1_020,
  // Hard: Structural and Geometric Integrity (R-021–R-025)
  RBv1_021, RBv1_022, RBv1_023, RBv1_024, RBv1_025,
  // Hard: Room Adjacency and Zoning (R-026–R-050)
  RBv1_026, RBv1_027, RBv1_028, RBv1_029, RBv1_030,
  RBv1_031, RBv1_032, RBv1_033, RBv1_034, RBv1_035,
  RBv1_036, RBv1_037, RBv1_038, RBv1_039, RBv1_040,
  RBv1_041, RBv1_042, RBv1_043, RBv1_044, RBv1_045,
  RBv1_046, RBv1_047, RBv1_048, RBv1_049, RBv1_050,
  // Hard: Plan Completeness and Labelling (R-096–R-101)
  RBv1_096, RBv1_097, RBv1_098, RBv1_099, RBv1_100, RBv1_101,
  // Soft: Adjacency Preferences (R-051–R-065)
  RBv1_051, RBv1_052, RBv1_053, RBv1_054, RBv1_055,
  RBv1_056, RBv1_057, RBv1_058, RBv1_059, RBv1_060,
  RBv1_061, RBv1_062, RBv1_063, RBv1_064, RBv1_065,
  // Soft: Natural Light (R-066–R-075)
  RBv1_066, RBv1_067, RBv1_068, RBv1_069, RBv1_070,
  RBv1_071, RBv1_072, RBv1_073, RBv1_074, RBv1_075,
  // Soft: Orientation (R-076–R-085)
  RBv1_076, RBv1_077, RBv1_078, RBv1_079, RBv1_080,
  RBv1_081, RBv1_082, RBv1_083, RBv1_084, RBv1_085,
  // Soft: Functional Sufficiency (R-086–R-095)
  RBv1_086, RBv1_087, RBv1_088, RBv1_089, RBv1_090,
  RBv1_091, RBv1_092, RBv1_093, RBv1_094, RBv1_095,
  // Soft: Plan Completeness (R-102–R-103)
  RBv1_102, RBv1_103,
];

/**
 * Register all 103 Rule Book v1 checks into the shared runChecks() registry.
 * Idempotent — safe to call multiple times.
 */
export function registerRulebookV1Checks(): void {
  registerChecks(...RULEBOOK_V1_CHECKS);
}
