/**
 * Minimal unit tests for validateLayout.
 * Run with: node --experimental-vm-modules node_modules/.bin/jest
 * Or (no Jest): npx tsx packages/core/src/validator.test.ts
 */

import { validateLayout } from './validator.js';
import { LayoutV1 } from './layout.js';
import { Priors } from './priors';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeLayout(overrides: Partial<LayoutV1> = {}): LayoutV1 {
  return {
    schemaVersion: 'layout.v1',
    units: 'feet',
    dimensions: { width: 40, depth: 30 },
    rooms: [],
    ...overrides,
  };
}

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

function assertEqual<T>(actual: T, expected: T, msg?: string) {
  if (actual !== expected) {
    throw new Error(msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\nvalidateLayout');

test('well-formed layout has no errors', () => {
  // Rooms fill ~90% of a 30x20 plan; kitchen touches living room (preferred adjacency met)
  const layout = makeLayout({
    dimensions: { width: 30, depth: 20 },
    rooms: [
      { id: 'r1', type: 'living room', x: 0,  y: 0,  width: 18, height: 14 },
      { id: 'r2', type: 'kitchen',     x: 18, y: 0,  width: 12, height: 10 },
      { id: 'r3', type: 'bedroom',     x: 0,  y: 14, width: 12, height: 6  },
      { id: 'r4', type: 'bathroom',    x: 12, y: 14, width: 8,  height: 6  },
      { id: 'r5', type: 'dining',      x: 20, y: 10, width: 10, height: 10 },
    ],
  });
  const { violations } = validateLayout(layout);
  const errors = violations.filter(v => v.severity === 'error');
  assert(errors.length === 0, `expected no errors, got: ${errors.map(v=>v.code).join(', ')}`);
});

test('overlapping rooms produce ROOM_OVERLAP errors', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0, y: 0, width: 12, height: 10 },
      { id: 'r2', type: 'bedroom', x: 6, y: 0, width: 12, height: 10 }, // overlaps r1
    ],
  });
  const { violations } = validateLayout(layout);
  const overlaps = violations.filter(v => v.code === 'ROOM_OVERLAP');
  assert(overlaps.length >= 1, 'expected at least one ROOM_OVERLAP violation');
});

test('room outside bounds produces ROOM_OUT_OF_BOUNDS error', () => {
  const layout = makeLayout({
    dimensions: { width: 20, depth: 20 },
    rooms: [
      { id: 'r1', type: 'bedroom', x: 15, y: 15, width: 12, height: 10 }, // extends outside
    ],
  });
  const { violations } = validateLayout(layout);
  const oob = violations.filter(v => v.code === 'ROOM_OUT_OF_BOUNDS');
  assert(oob.length >= 1, 'expected ROOM_OUT_OF_BOUNDS violation');
});

test('tiny room triggers ROOM_TOO_SMALL warning', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0, y: 0, width: 4, height: 4 }, // < 9 ft min
    ],
  });
  const { violations } = validateLayout(layout);
  const small = violations.filter(v => v.code === 'ROOM_TOO_SMALL');
  assert(small.length >= 1, 'expected ROOM_TOO_SMALL warning');
});

test('low coverage triggers LOW_COVERAGE warning', () => {
  const layout = makeLayout({
    dimensions: { width: 100, depth: 100 },
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0, y: 0, width: 10, height: 10 }, // 1% coverage
    ],
  });
  const { violations } = validateLayout(layout);
  const low = violations.filter(v => v.code === 'LOW_COVERAGE');
  assert(low.length === 1, 'expected LOW_COVERAGE warning');
});

test('high coverage triggers HIGH_COVERAGE warning', () => {
  const layout = makeLayout({
    dimensions: { width: 20, depth: 10 },
    rooms: [
      { id: 'r1', type: 'living room', x: 0, y: 0, width: 20, height: 10 }, // 100% coverage
    ],
  });
  const { violations } = validateLayout(layout);
  const high = violations.filter(v => v.code === 'HIGH_COVERAGE');
  assert(high.length === 1, 'expected HIGH_COVERAGE warning');
});

test('separated kitchen and dining triggers ADJACENCY_PREFERRED info', () => {
  const layout = makeLayout({
    dimensions: { width: 40, depth: 30 },
    rooms: [
      { id: 'r1', type: 'kitchen', x: 0,  y: 0, width: 10, height: 10 },
      { id: 'r2', type: 'dining',  x: 30, y: 0, width: 10, height: 10 }, // far apart
    ],
  });
  const { violations } = validateLayout(layout);
  const adj = violations.filter(v => v.code === 'ADJACENCY_PREFERRED');
  assert(adj.length >= 1, 'expected ADJACENCY_PREFERRED info violation');
});

test('score decreases with each additional error', () => {
  const one = validateLayout(makeLayout({
    dimensions: { width: 5, depth: 5 },
    rooms: [{ id: 'r1', type: 'bedroom', x: 0, y: 0, width: 10, height: 10 }],
  }));
  const two = validateLayout(makeLayout({
    dimensions: { width: 5, depth: 5 },
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0, y: 0, width: 10, height: 10 },
      { id: 'r2', type: 'bedroom', x: 0, y: 0, width: 10, height: 10 },
    ],
  }));
  assert(two.score <= one.score, 'more errors should not increase the score');
});

test('metrics are computed correctly', () => {
  const layout = makeLayout({
    dimensions: { width: 40, depth: 30 },
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0, y: 0, width: 10, height: 10 },
    ],
  });
  const { metrics } = validateLayout(layout);
  assertEqual(metrics.totalArea, 1200, 'totalArea');
  assertEqual(metrics.coveredArea, 100, 'coveredArea');
  assertEqual(Math.round(metrics.coverageRatio * 100) / 100, 0.08, 'coverageRatio');
  assertEqual(metrics.roomCount, 1, 'roomCount');
});

// ── Priors tests ──────────────────────────────────────────────────────────────

console.log('\nvalidateLayout + priors');

// Fixture priors: bedroom↔office is common (70% of edges), nothing else.
const fixturePriors: Priors = {
  schemaVersion: 'Priors@v1',
  totalPlans: 1,
  totalRooms: 2,
  totalEdges: 10,
  labelFreq: { bedroom: 5, office: 5 },
  adjacencyFreq: { 'bedroom|office': 7 },
};

test('priorsAdjustment is undefined when priors are not supplied', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'r2', type: 'office',  x: 12, y: 0, width: 12, height: 10 },
    ],
  });
  const result = validateLayout(layout);
  assert(result.priorsAdjustment === undefined, 'priorsAdjustment should be undefined without priors');
});

test('priorsAdjustment is +1 when a common adjacent pair is present', () => {
  // bedroom and office share an edge; bedroom|office = 7/10 = 70% ≥ 5% threshold
  const layout = makeLayout({
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'r2', type: 'office',  x: 12, y: 0, width: 12, height: 10 },
    ],
  });
  const result = validateLayout(layout, fixturePriors);
  assertEqual(result.priorsAdjustment, 1, `expected priorsAdjustment=1, got ${result.priorsAdjustment}`);
});

test('priorsAdjustment is 0 when common pair is not adjacent', () => {
  // bedroom and office are far apart — no shared edge
  const layout = makeLayout({
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'r2', type: 'office',  x: 28, y: 0, width: 12, height: 10 },
    ],
  });
  const result = validateLayout(layout, fixturePriors);
  assertEqual(result.priorsAdjustment, 0, `expected priorsAdjustment=0, got ${result.priorsAdjustment}`);
});

test('score is higher when priors-preferred adjacency is satisfied', () => {
  const adjLayout = makeLayout({
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'r2', type: 'office',  x: 12, y: 0, width: 12, height: 10 },
    ],
  });
  const sepLayout = makeLayout({
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'r2', type: 'office',  x: 28, y: 0, width: 12, height: 10 },
    ],
  });
  const withAdj = validateLayout(adjLayout, fixturePriors);
  const withSep = validateLayout(sepLayout, fixturePriors);
  assert(withAdj.score > withSep.score, `adjacent score (${withAdj.score}) should exceed separated score (${withSep.score})`);
});
// ── Improved priors scoring tests ─────────────────────

console.log('
validateLayout + improved priors scoring');

// High-weight priors fixture: bedroom|office = 80% of edges (very strong)
const strongPriors: Priors = {
  schemaVersion: 'Priors@v1',
  totalPlans: 1,
  totalRooms: 2,
  totalEdges: 10,
  labelFreq: { bedroom: 5, office: 5 },
  adjacencyFreq: { 'bedroom|office': 8 },
};

test('priorsAdjustment is positive when strong pair is adjacent (bonus)', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'r2', type: 'office',  x: 12, y: 0, width: 12, height: 10 },
    ],
  });
  const result = validateLayout(layout, strongPriors);
  assert(
    result.priorsAdjustment !== undefined && result.priorsAdjustment > 0,
    'expected positive priorsAdjustment'
  );
});

test('priorsAdjustment is negative when very-strong pair is NOT adjacent (penalty)', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'r2', type: 'office',  x: 28, y: 0, width: 12, height: 10 },
    ],
  });
  const result = validateLayout(layout, strongPriors);
  assert(
    result.priorsAdjustment !== undefined && result.priorsAdjustment < 0,
    'expected negative priorsAdjustment (penalty)'
  );
});

test('priorsAdjustment stays within [-10, +10] regardless of room count', () => {
  const manyRooms = Array.from({ length: 10 }, (_, i) => ({
    id: `r${i}`,
    type: i % 2 === 0 ? 'bedroom' : 'office',
    x: i * 12,
    y: 0,
    width: 12,
    height: 10,
  }));
  const layout = makeLayout({ rooms: manyRooms, dimensions: { width: 200, depth: 30 } });
  const result = validateLayout(layout, strongPriors);
  assert(
    result.priorsAdjustment !== undefined &&
      result.priorsAdjustment >= -10 &&
      result.priorsAdjustment <= 10,
    'priorsAdjustment out of [-10, +10] bounds'
  );
});

// ── Summary ──────────────────────────────────────────────────────────

console.log(`
${passed} passed, ${failed} failed
`);
if (failed > 0) process.exit(1);
