/**
 * Unit tests for deriveWallSegments() and assignWallSegmentIds().
 * Run with: npx tsx packages/generator/src/wall-segments.test.ts
 */

import { deriveWallSegments, assignWallSegmentIds } from './index.js';
import { Room2D, DoorElement, WindowElement } from '@archivox/core';

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e: any) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${e.message}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

function makeRoom(id: string, x: number, y: number, width: number, height: number): Room2D {
  return { id, type: 'room', x, y, width, height };
}

// ── deriveWallSegments ────────────────────────────────────────────────────────

console.log('\nderiveWallSegments — interior wall detection');

test('two rooms sharing a vertical edge produce one interior wall', () => {
  // roomA occupies x:0–10, roomB immediately to its right at x:10–20
  const rooms = [makeRoom('a', 0, 0, 10, 10), makeRoom('b', 10, 0, 10, 10)];
  const { walls, interiorWallsByRoomPair } = deriveWallSegments(rooms);

  const interior = walls.filter(w => w.type === 'interior');
  assert(interior.length === 1, `expected 1 interior wall, got ${interior.length}`);
  assert(interior[0].start.x === 10 && interior[0].end.x === 10, 'interior wall should be at x=10');
  assert(interior[0].start.y === 0 && interior[0].end.y === 10, 'interior wall should span y=0..10');
  assert(interior[0].thickness === 0.5, `expected thickness 0.5, got ${interior[0].thickness}`);

  const key = ['a', 'b'].sort().join('|');
  assert(interiorWallsByRoomPair.has(key), 'interiorWallsByRoomPair should have entry for room pair');
  assert(interiorWallsByRoomPair.get(key) === interior[0].id, 'map value should equal interior wall id');
});

test('two rooms sharing a horizontal edge produce one interior wall', () => {
  // roomA at y:0–8, roomB immediately below at y:8–16
  const rooms = [makeRoom('a', 0, 0, 12, 8), makeRoom('b', 0, 8, 12, 8)];
  const { walls, interiorWallsByRoomPair } = deriveWallSegments(rooms);

  const interior = walls.filter(w => w.type === 'interior');
  assert(interior.length === 1, `expected 1 interior wall, got ${interior.length}`);
  assert(interior[0].start.y === 8 && interior[0].end.y === 8, 'interior wall should be at y=8');
  assert(interior[0].start.x === 0 && interior[0].end.x === 12, 'interior wall should span x=0..12');

  const key = ['a', 'b'].sort().join('|');
  assert(interiorWallsByRoomPair.has(key), 'interiorWallsByRoomPair should contain horizontal pair');
});

test('roomB to the left of roomA produces interior wall at roomB right edge', () => {
  // roomB at x:0–10, roomA at x:10–20
  const rooms = [makeRoom('roomA', 10, 0, 10, 10), makeRoom('roomB', 0, 0, 10, 10)];
  const { walls, interiorWallsByRoomPair } = deriveWallSegments(rooms);

  const interior = walls.filter(w => w.type === 'interior');
  assert(interior.length === 1, `expected 1 interior wall, got ${interior.length}`);
  assert(interior[0].start.x === 10, 'interior wall x coordinate should be 10');

  const key = ['roomA', 'roomB'].sort().join('|');
  assert(interiorWallsByRoomPair.has(key), 'room pair key should be found regardless of order');
});

test('roomB above roomA produces interior wall at roomB bottom edge', () => {
  // roomB at y:0–6, roomA at y:6–14
  const rooms = [makeRoom('roomA', 0, 6, 10, 8), makeRoom('roomB', 0, 0, 10, 6)];
  const { walls, interiorWallsByRoomPair } = deriveWallSegments(rooms);

  const interior = walls.filter(w => w.type === 'interior');
  assert(interior.length === 1, `expected 1 interior wall, got ${interior.length}`);
  assert(interior[0].start.y === 6 && interior[0].end.y === 6, 'interior wall should be at y=6');

  const key = ['roomA', 'roomB'].sort().join('|');
  assert(interiorWallsByRoomPair.has(key), 'room pair key should exist');
});

test('partial overlap along shared vertical edge uses intersection span only', () => {
  // roomA: y=0..10, roomB: y=5..15 — shared vertical edge overlap is y=5..10
  const rooms = [makeRoom('a', 0, 0, 10, 10), makeRoom('b', 10, 5, 10, 10)];
  const { walls } = deriveWallSegments(rooms);

  const interior = walls.filter(w => w.type === 'interior');
  assert(interior.length === 1, `expected 1 interior wall, got ${interior.length}`);
  assert(interior[0].start.y === 5, `expected start.y=5, got ${interior[0].start.y}`);
  assert(interior[0].end.y === 10, `expected end.y=10, got ${interior[0].end.y}`);
});

test('non-adjacent rooms produce no interior walls', () => {
  // gap between rooms
  const rooms = [makeRoom('a', 0, 0, 10, 10), makeRoom('b', 15, 0, 10, 10)];
  const { walls, interiorWallsByRoomPair } = deriveWallSegments(rooms);

  const interior = walls.filter(w => w.type === 'interior');
  assert(interior.length === 0, `expected no interior walls, got ${interior.length}`);
  assert(interiorWallsByRoomPair.size === 0, 'interiorWallsByRoomPair should be empty');
});

test('rooms that only touch at a corner (no span) produce no interior wall', () => {
  // a at (0,0,10,10), b at (10,10,10,10) — corner touch only
  const rooms = [makeRoom('a', 0, 0, 10, 10), makeRoom('b', 10, 10, 10, 10)];
  const { walls } = deriveWallSegments(rooms);

  const interior = walls.filter(w => w.type === 'interior');
  assert(interior.length === 0, `expected no interior walls from corner-only touch, got ${interior.length}`);
});

console.log('\nderiveWallSegments — exterior wall generation');

test('isolated single room gets 4 exterior walls', () => {
  const rooms = [makeRoom('solo', 0, 0, 10, 8)];
  const { walls, exteriorWallsByRoom } = deriveWallSegments(rooms);

  const exterior = walls.filter(w => w.type === 'exterior');
  assert(exterior.length === 4, `expected 4 exterior walls, got ${exterior.length}`);
  exterior.forEach(w => {
    assert(w.thickness === 0.75, `expected exterior thickness 0.75, got ${w.thickness}`);
  });
  const extIds = exteriorWallsByRoom.get('solo');
  assert(extIds !== undefined && extIds.length === 4, `expected 4 entries in exteriorWallsByRoom, got ${extIds?.length}`);
});

test('shared edge is not duplicated as exterior wall on either room', () => {
  // a right==b left → a:right and b:left should not become exterior walls
  const rooms = [makeRoom('a', 0, 0, 10, 10), makeRoom('b', 10, 0, 10, 10)];
  const { walls, exteriorWallsByRoom } = deriveWallSegments(rooms);

  const exterior = walls.filter(w => w.type === 'exterior');
  // Each room has 4 edges; 1 shared → each room has 3 exterior walls → total 6
  assert(exterior.length === 6, `expected 6 exterior walls, got ${exterior.length}`);

  const aExt = exteriorWallsByRoom.get('a') ?? [];
  const bExt = exteriorWallsByRoom.get('b') ?? [];
  assert(aExt.length === 3, `room 'a' should have 3 exterior walls, got ${aExt.length}`);
  assert(bExt.length === 3, `room 'b' should have 3 exterior walls, got ${bExt.length}`);
});

test('three rooms in an L-shape have correct interior/exterior wall counts', () => {
  // a:0,0 10×10  b:10,0 10×10  c:0,10 10×10
  // a-b share vertical wall; a-c share horizontal wall; b-c are not adjacent
  const rooms = [makeRoom('a', 0, 0, 10, 10), makeRoom('b', 10, 0, 10, 10), makeRoom('c', 0, 10, 10, 10)];
  const { walls, interiorWallsByRoomPair } = deriveWallSegments(rooms);

  const interior = walls.filter(w => w.type === 'interior');
  assert(interior.length === 2, `expected 2 interior walls, got ${interior.length}`);
  assert(interiorWallsByRoomPair.has(['a', 'b'].sort().join('|')), 'a-b pair should be interior');
  assert(interiorWallsByRoomPair.has(['a', 'c'].sort().join('|')), 'a-c pair should be interior');
  assert(!interiorWallsByRoomPair.has(['b', 'c'].sort().join('|')), 'b-c pair should NOT be interior');
});

test('interiorWallsByRoomPair key is order-independent (sorted)', () => {
  const rooms = [makeRoom('alpha', 0, 0, 10, 10), makeRoom('beta', 10, 0, 10, 10)];
  const { interiorWallsByRoomPair } = deriveWallSegments(rooms);

  const keyAB = 'alpha|beta';
  const keyBA = 'beta|alpha';
  // Sorted, so alphabetically 'alpha' < 'beta' → key is 'alpha|beta'
  assert(interiorWallsByRoomPair.has(keyAB), 'sorted key alpha|beta should exist');
  assert(
    interiorWallsByRoomPair.get(keyAB) === interiorWallsByRoomPair.get(keyAB),
    'forward and reverse key lookups should resolve consistently',
  );
  // The reverse key 'beta|alpha' should NOT be separately present (only sorted key stored)
  assert(!interiorWallsByRoomPair.has(keyBA), 'unsorted key beta|alpha should not be stored separately');
});

// ── assignWallSegmentIds ──────────────────────────────────────────────────────

console.log('\nassignWallSegmentIds — interior door assignment');

test('interior door gets wallSegmentId from shared interior wall', () => {
  const rooms = [makeRoom('living', 0, 0, 12, 10), makeRoom('hallway', 12, 0, 8, 10)];
  const { interiorWallsByRoomPair, exteriorWallsByRoom } = deriveWallSegments(rooms);

  const door: DoorElement = { id: 'd1', type: 'hinged', fromRoomId: 'living', toRoomId: 'hallway', clearWidth: 3 };
  const { doors } = assignWallSegmentIds([door], [], interiorWallsByRoomPair, exteriorWallsByRoom);

  const sharedKey = ['living', 'hallway'].sort().join('|');
  const expectedWallId = interiorWallsByRoomPair.get(sharedKey);
  assert(expectedWallId !== undefined, 'shared interior wall must exist');
  assert(doors[0].wallSegmentId === expectedWallId, `door should get wallSegmentId='${expectedWallId}', got '${doors[0].wallSegmentId}'`);
});

test('interior door with toRoomId in reversed order still finds shared wall', () => {
  const rooms = [makeRoom('roomA', 0, 0, 10, 10), makeRoom('roomB', 10, 0, 10, 10)];
  const { interiorWallsByRoomPair, exteriorWallsByRoom } = deriveWallSegments(rooms);

  // Door specified with fromRoomId=roomB, toRoomId=roomA (reversed from pack order)
  const door: DoorElement = { id: 'd1', type: 'hinged', fromRoomId: 'roomB', toRoomId: 'roomA', clearWidth: 3 };
  const { doors } = assignWallSegmentIds([door], [], interiorWallsByRoomPair, exteriorWallsByRoom);

  const sharedKey = ['roomA', 'roomB'].sort().join('|');
  assert(doors[0].wallSegmentId === interiorWallsByRoomPair.get(sharedKey), 'reversed door should still find shared wall');
});

test('exterior door (toRoomId=null) gets exterior wall of fromRoomId', () => {
  const rooms = [makeRoom('entry', 0, 0, 12, 10)];
  const { interiorWallsByRoomPair, exteriorWallsByRoom } = deriveWallSegments(rooms);

  const door: DoorElement = { id: 'd1', type: 'entrance', fromRoomId: 'entry', toRoomId: null, clearWidth: 3.5 };
  const { doors } = assignWallSegmentIds([door], [], interiorWallsByRoomPair, exteriorWallsByRoom);

  const extIds = exteriorWallsByRoom.get('entry') ?? [];
  assert(extIds.length > 0, 'entry room should have exterior walls');
  assert(doors[0].wallSegmentId === extIds[0], `exterior door should get first exterior wall id '${extIds[0]}'`);
});

console.log('\nassignWallSegmentIds — fallback to exterior wall');

test('interior door referencing non-adjacent rooms falls back to exterior wall of fromRoomId', () => {
  // a and b are not adjacent (gap between them)
  const rooms = [makeRoom('a', 0, 0, 10, 10), makeRoom('b', 20, 0, 10, 10)];
  const { interiorWallsByRoomPair, exteriorWallsByRoom } = deriveWallSegments(rooms);

  const door: DoorElement = { id: 'd1', type: 'hinged', fromRoomId: 'a', toRoomId: 'b', clearWidth: 3 };
  const { doors } = assignWallSegmentIds([door], [], interiorWallsByRoomPair, exteriorWallsByRoom);

  const extIds = exteriorWallsByRoom.get('a') ?? [];
  assert(extIds.length > 0, 'room a should have exterior walls');
  assert(doors[0].wallSegmentId === extIds[0], `non-adjacent door should fall back to fromRoom exterior wall '${extIds[0]}'`);
});

test('door with no matching walls receives no wallSegmentId', () => {
  // Empty maps — no walls at all
  const emptyInterior = new Map<string, string>();
  const emptyExterior = new Map<string, string[]>();

  const door: DoorElement = { id: 'd1', type: 'hinged', fromRoomId: 'a', toRoomId: 'b', clearWidth: 3 };
  const { doors } = assignWallSegmentIds([door], [], emptyInterior, emptyExterior);

  assert(doors[0].wallSegmentId === undefined, 'door with no walls should remain without wallSegmentId');
});

console.log('\nassignWallSegmentIds — window assignment');

test('window gets first exterior wall of its roomId', () => {
  const rooms = [makeRoom('bedroom', 0, 0, 12, 10)];
  const { interiorWallsByRoomPair, exteriorWallsByRoom } = deriveWallSegments(rooms);

  const win: WindowElement = { id: 'w1', roomId: 'bedroom', sillHeight: 2.5 };
  const { windows } = assignWallSegmentIds([], [win], interiorWallsByRoomPair, exteriorWallsByRoom);

  const extIds = exteriorWallsByRoom.get('bedroom') ?? [];
  assert(extIds.length > 0, 'bedroom should have exterior walls');
  assert(windows[0].wallSegmentId === extIds[0], `window should get first exterior wall '${extIds[0]}'`);
});

test('window with no exterior walls receives no wallSegmentId', () => {
  const emptyExterior = new Map<string, string[]>();
  const win: WindowElement = { id: 'w1', roomId: 'bedroom', sillHeight: 2.5 };
  const { windows } = assignWallSegmentIds([], [win], new Map(), emptyExterior);

  assert(windows[0].wallSegmentId === undefined, 'window with no walls should have no wallSegmentId');
});

console.log('\nassignWallSegmentIds — pre-existing wallSegmentId passthrough');

test('door with pre-existing wallSegmentId is returned unchanged', () => {
  const rooms = [makeRoom('a', 0, 0, 10, 10), makeRoom('b', 10, 0, 10, 10)];
  const { interiorWallsByRoomPair, exteriorWallsByRoom } = deriveWallSegments(rooms);

  const door: DoorElement = { id: 'd1', type: 'hinged', fromRoomId: 'a', toRoomId: 'b', clearWidth: 3, wallSegmentId: 'wall_custom_99' };
  const { doors } = assignWallSegmentIds([door], [], interiorWallsByRoomPair, exteriorWallsByRoom);

  assert(doors[0].wallSegmentId === 'wall_custom_99', 'pre-existing wallSegmentId must not be overwritten');
  assert(doors[0] === door, 'door object should be returned by reference (no copy needed when unchanged)');
});

test('window with pre-existing wallSegmentId is returned unchanged', () => {
  const rooms = [makeRoom('bedroom', 0, 0, 12, 10)];
  const { interiorWallsByRoomPair, exteriorWallsByRoom } = deriveWallSegments(rooms);

  const win: WindowElement = { id: 'w1', roomId: 'bedroom', sillHeight: 2.5, wallSegmentId: 'wall_preset_7' };
  const { windows } = assignWallSegmentIds([], [win], interiorWallsByRoomPair, exteriorWallsByRoom);

  assert(windows[0].wallSegmentId === 'wall_preset_7', 'pre-existing window wallSegmentId must not be overwritten');
  assert(windows[0] === win, 'window object should be returned by reference when unchanged');
});

test('mixed batch: some doors/windows have wallSegmentId, some do not', () => {
  const rooms = [makeRoom('a', 0, 0, 10, 10), makeRoom('b', 10, 0, 10, 10)];
  const { interiorWallsByRoomPair, exteriorWallsByRoom } = deriveWallSegments(rooms);

  const doors: DoorElement[] = [
    { id: 'd1', type: 'hinged', fromRoomId: 'a', toRoomId: 'b', clearWidth: 3, wallSegmentId: 'wall_preset' },
    { id: 'd2', type: 'entrance', fromRoomId: 'a', toRoomId: null, clearWidth: 3.5 },
  ];
  const windows: WindowElement[] = [
    { id: 'w1', roomId: 'a', sillHeight: 2.5, wallSegmentId: 'wall_preset_w' },
    { id: 'w2', roomId: 'b', sillHeight: 2.5 },
  ];

  const { doors: outDoors, windows: outWindows } = assignWallSegmentIds(doors, windows, interiorWallsByRoomPair, exteriorWallsByRoom);

  assert(outDoors[0].wallSegmentId === 'wall_preset', 'd1 preset should be unchanged');
  assert(outDoors[1].wallSegmentId !== undefined, 'd2 should receive an exterior wall id');
  assert(outWindows[0].wallSegmentId === 'wall_preset_w', 'w1 preset should be unchanged');
  assert(outWindows[1].wallSegmentId !== undefined, 'w2 should receive an exterior wall id');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
