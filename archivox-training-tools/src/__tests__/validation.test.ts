import { describe, test, expect } from 'vitest';
import { validatePlan } from '../validation';
import { buildGraphSpec } from '../graph';
import { PlanSpec, Room, GraphSpec } from '../types';
import { polygonCentroid, polygonArea, polygonPerimeter } from '../geometry';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRoom(id: string, polygon: Array<{ x: number; y: number }>, label?: string): Room {
  return {
    id,
    polygon,
    centroid: polygonCentroid(polygon),
    area: polygonArea(polygon),
    perimeter: polygonPerimeter(polygon),
    label: label ?? null,
    labelConfidence: label ? 1.0 : 0,
    labelProvenance: label ? 'containment' : 'none',
  };
}

function makePlan(planId: string, rooms: Room[], labels: PlanSpec['labels'] = []): PlanSpec {
  const allPts = rooms.flatMap((r) => r.polygon);
  const minX = allPts.length ? Math.min(...allPts.map((p) => p.x)) : 0;
  const minY = allPts.length ? Math.min(...allPts.map((p) => p.y)) : 0;
  const maxX = allPts.length ? Math.max(...allPts.map((p) => p.x)) : 0;
  const maxY = allPts.length ? Math.max(...allPts.map((p) => p.y)) : 0;
  const bounds = { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  return {
    schemaVersion: 'PlanSpec@v1',
    planId,
    source: {
      filename: 'test.dxf',
      type: 'dxf',
      sha256: planId,
      ingestTimestamp: '2026-01-01T00:00:00Z',
      toolVersion: '0.3.0',
    },
    units: { detected: 'mm', assumed: 'mm', confidence: 1 },
    geometry: {
      bounds,
      originalBounds: bounds,
      rooms: rooms.map((r) => r.polygon),
      walls: [],
      openings: [],
    },
    labels,
    rooms,
    qualitySignals: [],
  };
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// Large outer room: 10×10 square
const OUTER_ROOM = makeRoom('room-outer', [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
], 'living room');

// Small inner room: 2×2 square fully inside OUTER_ROOM
const INNER_ROOM = makeRoom('room-inner', [
  { x: 3, y: 3 }, { x: 5, y: 3 }, { x: 5, y: 5 }, { x: 3, y: 5 },
], 'closet');

// Disconnected room far from the others
const FAR_ROOM = makeRoom('room-far', [
  { x: 100, y: 100 }, { x: 110, y: 100 }, { x: 110, y: 110 }, { x: 100, y: 110 },
]);

// Two adjacent rooms (share edge x=10)
const ROOM_LEFT = makeRoom('room-left', [
  { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 0, y: 5 },
], 'kitchen');
const ROOM_RIGHT = makeRoom('room-right', [
  { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 5 }, { x: 10, y: 5 },
], 'dining');

// ─── Room-inside-room tests ───────────────────────────────────────────────────

describe('validation: ROOM_INSIDE_ROOM', () => {
  test('inner polygon fully inside outer triggers ROOM_INSIDE_ROOM warning', () => {
    const plan = makePlan('plan-nest', [OUTER_ROOM, INNER_ROOM]);
    const graph = buildGraphSpec('plan-nest', [OUTER_ROOM, INNER_ROOM], { threshold: 1 });
    const metrics = validatePlan(plan, graph);

    const nestWarnings = metrics.warnings.filter((w) => w.code === 'ROOM_INSIDE_ROOM');
    expect(nestWarnings.length).toBeGreaterThan(0);
    expect(nestWarnings[0].detail).toMatchObject({
      inner: 'room-inner',
      outer: 'room-outer',
    });
    expect(metrics.counts.nested).toBe(1);
  });

  test('non-nested rooms do not trigger ROOM_INSIDE_ROOM', () => {
    const plan = makePlan('plan-adj', [ROOM_LEFT, ROOM_RIGHT]);
    const graph = buildGraphSpec('plan-adj', [ROOM_LEFT, ROOM_RIGHT], { threshold: 1 });
    const metrics = validatePlan(plan, graph);

    const nestWarnings = metrics.warnings.filter((w) => w.code === 'ROOM_INSIDE_ROOM');
    expect(nestWarnings).toHaveLength(0);
    expect(metrics.counts.nested).toBe(0);
  });

  test('nested room area appears in warning detail', () => {
    const plan = makePlan('plan-nest2', [OUTER_ROOM, INNER_ROOM]);
    const graph = buildGraphSpec('plan-nest2', [OUTER_ROOM, INNER_ROOM], { threshold: 1 });
    const metrics = validatePlan(plan, graph);

    const w = metrics.warnings.find((w) => w.code === 'ROOM_INSIDE_ROOM');
    expect(w).toBeDefined();
    const detail = w!.detail as Record<string, unknown>;
    expect(typeof detail.innerArea).toBe('number');
    expect(typeof detail.outerArea).toBe('number');
    expect((detail.innerArea as number)).toBeLessThan(detail.outerArea as number);
  });
});

// ─── Connected components tests ───────────────────────────────────────────────

describe('validation: graph connectivity / DISCONNECTED_GRAPH', () => {
  test('two adjacent rooms → 1 component, no disconnected warning', () => {
    const plan = makePlan('plan-conn', [ROOM_LEFT, ROOM_RIGHT]);
    const graph = buildGraphSpec('plan-conn', [ROOM_LEFT, ROOM_RIGHT], { threshold: 1 });
    const metrics = validatePlan(plan, graph);

    expect(metrics.counts.components).toBe(1);
    const disconnected = metrics.warnings.filter((w) => w.code === 'DISCONNECTED_GRAPH');
    expect(disconnected).toHaveLength(0);
  });

  test('two far-apart rooms → 2 components, DISCONNECTED_GRAPH warning', () => {
    const plan = makePlan('plan-discon', [ROOM_LEFT, FAR_ROOM]);
    const graph = buildGraphSpec('plan-discon', [ROOM_LEFT, FAR_ROOM], { threshold: 1 });
    const metrics = validatePlan(plan, graph);

    expect(metrics.counts.components).toBe(2);
    const disconnected = metrics.warnings.filter((w) => w.code === 'DISCONNECTED_GRAPH');
    expect(disconnected).toHaveLength(1);
    expect((disconnected[0].detail as Record<string, unknown>).components).toBe(2);
  });

  test('three rooms, two adjacent + one far → 2 components', () => {
    const plan = makePlan('plan-mixed', [ROOM_LEFT, ROOM_RIGHT, FAR_ROOM]);
    const graph = buildGraphSpec('plan-mixed', [ROOM_LEFT, ROOM_RIGHT, FAR_ROOM], { threshold: 1 });
    const metrics = validatePlan(plan, graph);

    expect(metrics.counts.components).toBe(2);
    expect(graph.globalFeatures.components).toBe(2);
  });

  test('empty plan has 0 components and no connectivity warning', () => {
    const plan = makePlan('plan-empty', []);
    const graph = buildGraphSpec('plan-empty', [], { threshold: 1 });
    const metrics = validatePlan(plan, graph);

    expect(metrics.counts.components).toBe(0);
    const disconnected = metrics.warnings.filter((w) => w.code === 'DISCONNECTED_GRAPH');
    expect(disconnected).toHaveLength(0);
  });
});

// ─── Adjacency: touching vs. far rectangles ───────────────────────────────────
// (complementary to graph.test.ts — tests via validatePlan path)

describe('validation via adjacency (touching/far rectangles)', () => {
  test('touching rooms create an edge → not isolated', () => {
    const plan = makePlan('plan-touch', [ROOM_LEFT, ROOM_RIGHT]);
    const graph = buildGraphSpec('plan-touch', [ROOM_LEFT, ROOM_RIGHT], { threshold: 1 });
    const metrics = validatePlan(plan, graph);

    expect(metrics.counts.edgesTotal).toBe(1);
    expect(graph.globalFeatures.isolatedRooms).toHaveLength(0);
  });

  test('far rooms create no edge → both isolated', () => {
    const plan = makePlan('plan-far2', [ROOM_LEFT, FAR_ROOM]);
    const graph = buildGraphSpec('plan-far2', [ROOM_LEFT, FAR_ROOM], { threshold: 1 });
    const metrics = validatePlan(plan, graph);

    expect(metrics.counts.edgesTotal).toBe(0);
    expect(graph.globalFeatures.isolatedRooms).toHaveLength(2);
  });
});

// ─── Label coverage threshold ─────────────────────────────────────────────────

describe('validation: LOW_LABEL_COVERAGE', () => {
  test('plan with label tokens + coverage <30% triggers warning', () => {
    // 1 labeled room out of 5 = 20% coverage; with label tokens present
    const rooms = [
      makeRoom('r1', [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }], 'kitchen'),
      makeRoom('r2', [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 2, y: 1 }]),
      makeRoom('r3', [{ x: 4, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 1 }, { x: 4, y: 1 }]),
      makeRoom('r4', [{ x: 6, y: 0 }, { x: 7, y: 0 }, { x: 7, y: 1 }, { x: 6, y: 1 }]),
      makeRoom('r5', [{ x: 8, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 1 }, { x: 8, y: 1 }]),
    ];
    const labels = [{ text: 'Kitchen', normalizedText: 'kitchen', position: { x: 0.5, y: 0.5 } }];
    const plan = makePlan('plan-low-cov', rooms, labels);
    const graph = buildGraphSpec('plan-low-cov', rooms, { threshold: 50 });
    const metrics = validatePlan(plan, graph);

    const coverageWarnings = metrics.warnings.filter((w) => w.code === 'LOW_LABEL_COVERAGE');
    expect(coverageWarnings).toHaveLength(1);
  });

  test('plan without label tokens + coverage=0% does not warn at 30% threshold', () => {
    // No labels extracted → no tokens → threshold is 50%; 0 rooms labeled out of 2
    const rooms = [
      makeRoom('r1', [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }]),
      makeRoom('r2', [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 1 }, { x: 2, y: 1 }]),
    ];
    const plan = makePlan('plan-no-tokens', rooms, []); // no label tokens at all
    const graph = buildGraphSpec('plan-no-tokens', rooms, { threshold: 50 });
    const metrics = validatePlan(plan, graph);

    // 0% < 50% but no label tokens, so threshold is 50% and should trigger
    const coverageWarnings = metrics.warnings.filter((w) => w.code === 'LOW_LABEL_COVERAGE');
    expect(coverageWarnings).toHaveLength(1);
  });
});
