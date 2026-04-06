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

// ── IBC rules tests ────────────────────────────────────────

import { applyIbcRules, IbcRuleSet } from './rules.js';

console.log('\nIBC rules');

const fixtureRuleset: IbcRuleSet = {
  schemaVersion: 'ibc-rules.v0',
  rules: [
    {
      id: 'ibc-001',
      description: 'Corridor min width.',
      severity: 'warn',
      appliesTo: ['hall'],
      params: { minWidthFt: 3 },
      source: 'IBC 2021 �1005.1',
    },
    {
      id: 'ibc-003',
      description: 'Egress path required.',
      severity: 'warn',
      appliesTo: [],
      params: { requiredTypes: ['hall', 'entry'] },
      source: 'IBC 2021 �1003.3',
    },
  ],
};

test('applyIbcRules returns empty array when no rules file and no ruleset', () => {
  const layout = makeLayout({ rooms: [{ id: 'r1', type: 'bedroom', x: 0, y: 0, width: 10, height: 10 }] });
  // Pass an empty ruleset to avoid file-system access
  const result = applyIbcRules(layout, { schemaVersion: 'ibc-rules.v0', rules: [] });
  assertEqual(result.length, 0, 'expected no violations from empty ruleset');
});

test('applyIbcRules warns when hall is too narrow (ibc-001)', () => {
  const layout = makeLayout({
    rooms: [{ id: 'h1', type: 'hall', x: 0, y: 0, width: 2, height: 10 }], // 2ft < 3ft min
  });
  const violations = applyIbcRules(layout, fixtureRuleset);
  const match = violations.find(v => v.code === 'ibc-001');
  assert(match !== undefined, 'expected ibc-001 violation for narrow hall');
  assert(match!.severity === 'warning', 'ibc-001 should be warning severity');
});

test('applyIbcRules warns when no egress room present (ibc-003)', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0, y: 0, width: 12, height: 10 },
      { id: 'r2', type: 'kitchen', x: 12, y: 0, width: 12, height: 10 },
    ],
  });
  const violations = applyIbcRules(layout, fixtureRuleset);
  const match = violations.find(v => v.code === 'ibc-003');
  assert(match !== undefined, 'expected ibc-003 violation when no hall/entry present');
});

test('applyIbcRules does NOT warn egress when hall is present (ibc-003)', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0, y: 0, width: 10, height: 10 },
      { id: 'h1', type: 'hall',    x: 10, y: 0, width: 4,  height: 10 },
    ],
  });
  const violations = applyIbcRules(layout, fixtureRuleset);
  const match = violations.find(v => v.code === 'ibc-003');
  assert(match === undefined, 'should NOT warn egress when hall is present');
});

// ── ruleChecks (RB-001 – RB-010) ─────────────────────────────────────────────

import { runChecks } from './ruleChecks.js';

console.log('\nrunChecks (RB-001 – RB-010)');

test('RB-001: no violation when garage is within ratio', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'g1', type: 'garage',  x: 0, y: 0, width: 10, height: 10 },  // 100 sq ft
      { id: 'r1', type: 'bedroom', x: 10, y: 0, width: 25, height: 16 }, // 400 sq ft
    ],
  });
  const v = runChecks(layout, ['RB-001']);
  assert(v.length === 0, `expected no RB-001 violation, got: ${v.map(x=>x.code).join(', ')}`);
});

test('RB-001: violation when garage exceeds 25% of conditioned area', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'g1', type: 'garage',  x: 0,  y: 0, width: 20, height: 20 }, // 400 sq ft
      { id: 'r1', type: 'bedroom', x: 20, y: 0, width: 10, height: 10 }, // 100 sq ft
    ],
  });
  const v = runChecks(layout, ['RB-001']);
  const match = v.find(x => x.code === 'RB-001');
  assert(match !== undefined, 'expected RB-001 violation');
  assert(match!.suggestedFixes !== undefined && match!.suggestedFixes.length > 0, 'expected suggestedFixes');
});

test('RB-002: no violation for adequately-sized bedroom', () => {
  const layout = makeLayout({
    rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 10, height: 10 }], // 100 sq ft
  });
  const v = runChecks(layout, ['RB-002']);
  assert(v.length === 0, 'expected no RB-002 violation for 100 sq ft bedroom');
});

test('RB-002: warning for bedroom under 70 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 8, height: 8 }], // 64 sq ft
  });
  const v = runChecks(layout, ['RB-002']);
  const match = v.find(x => x.code === 'RB-002');
  assert(match !== undefined, 'expected RB-002 warning');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
});

test('RB-003: no violation for normal aspect ratio', () => {
  const layout = makeLayout({
    rooms: [{ id: 'r1', type: 'kitchen', x: 0, y: 0, width: 12, height: 8 }], // 1.5:1
  });
  const v = runChecks(layout, ['RB-003']);
  assert(v.length === 0, 'expected no RB-003 violation for 1.5:1 ratio');
});

test('RB-003: warning for room with aspect ratio > 5', () => {
  const layout = makeLayout({
    rooms: [{ id: 'r1', type: 'hall', x: 0, y: 0, width: 30, height: 4 }], // 7.5:1
  });
  const v = runChecks(layout, ['RB-003']);
  const match = v.find(x => x.code === 'RB-003');
  assert(match !== undefined, 'expected RB-003 violation');
});

test('RB-004: no violation when living room touches exterior', () => {
  const layout = makeLayout({
    dimensions: { width: 40, depth: 30 },
    rooms: [{ id: 'lr', type: 'living room', x: 0, y: 0, width: 18, height: 14 }],
  });
  const v = runChecks(layout, ['RB-004']);
  assert(v.length === 0, 'expected no RB-004 when living room is on exterior');
});

test('RB-004: violation when living room is interior', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [{ id: 'lr', type: 'living room', x: 20, y: 20, width: 15, height: 12 }],
  });
  const v = runChecks(layout, ['RB-004']);
  const match = v.find(x => x.code === 'RB-004');
  assert(match !== undefined, 'expected RB-004 violation for interior living room');
});

test('RB-006: no violation when closet is adjacent to bedroom', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'c1', type: 'closet',  x: 12, y: 0, width: 4,  height: 6  },
    ],
  });
  const v = runChecks(layout, ['RB-006']);
  assert(v.length === 0, 'expected no RB-006 when closet is next to bedroom');
});

test('RB-007: violation when habitable room is disconnected from circulation', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 40 },
    rooms: [
      { id: 'h1', type: 'hall',    x: 0,  y: 0, width: 4, height: 10 },
      { id: 'b1', type: 'bedroom', x: 50, y: 30, width: 10, height: 10 }, // isolated
    ],
  });
  const v = runChecks(layout, ['RB-007']);
  const match = v.find(x => x.code === 'RB-007');
  assert(match !== undefined, 'expected RB-007 for isolated bedroom');
  assert(match!.suggestedFixes?.some(f => f.type === 'addHallwayConnection'), 'expected addHallwayConnection fix');
});

test('RB-008: violation when no bedroom in plan', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'k1', type: 'kitchen',   x: 0, y: 0, width: 12, height: 10 },
      { id: 'lr', type: 'living room', x: 12, y: 0, width: 18, height: 14 },
    ],
  });
  const v = runChecks(layout, ['RB-008']);
  const match = v.find(x => x.code === 'RB-008');
  assert(match !== undefined, 'expected RB-008 violation');
  assert(match!.suggestedFixes?.some(f => f.type === 'addRoom'), 'expected addRoom fix');
});

test('RB-009: violation when bedroom present but no bathroom', () => {
  const layout = makeLayout({
    rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 12, height: 10 }],
  });
  const v = runChecks(layout, ['RB-009']);
  const match = v.find(x => x.code === 'RB-009');
  assert(match !== undefined, 'expected RB-009 violation');
});

test('RB-009: no violation when both bedroom and bathroom present', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',  x: 0,  y: 0, width: 12, height: 10 },
      { id: 'ba', type: 'bathroom', x: 12, y: 0, width: 8,  height: 8  },
    ],
  });
  const v = runChecks(layout, ['RB-009']);
  assert(v.length === 0, 'expected no RB-009 when bathroom is present');
});

test('RB-010: violation when laundry is adjacent to bedroom', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'l1', type: 'laundry', x: 12, y: 0, width: 6,  height: 6  },
    ],
  });
  const v = runChecks(layout, ['RB-010']);
  const match = v.find(x => x.code === 'RB-010');
  assert(match !== undefined, 'expected RB-010 info violation');
  assert(match!.suggestedFixes?.some(f => f.type === 'swapRooms'), 'expected swapRooms fix');
});

test('suggestedFixes are populated on RB-008 (addRoom) violation', () => {
  // Layout with no bedroom triggers RB-008, which should carry an addRoom fix.
  const layout = makeLayout({
    rooms: [
      { id: 'k1', type: 'kitchen', x: 0, y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-008']);
  const fix = v[0]?.suggestedFixes?.[0];
  assert(fix !== undefined && fix.type === 'addRoom', 'expected addRoom suggestedFix');
});

// ── ruleChecks (RB-011 – RB-020) ─────────────────────────────────────────────

console.log('\nrunChecks (RB-011 – RB-020)');

test('RB-011: no violation when bedroom touches exterior wall', () => {
  const layout = makeLayout({
    dimensions: { width: 40, depth: 30 },
    rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 12, height: 10 }],
  });
  const v = runChecks(layout, ['RB-011']);
  assert(v.length === 0, 'expected no RB-011 when bedroom is on exterior');
});

test('RB-011: violation when bedroom is interior (not touching any wall)', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [{ id: 'b1', type: 'bedroom', x: 20, y: 20, width: 12, height: 10 }],
  });
  const v = runChecks(layout, ['RB-011']);
  const match = v.find(x => x.code === 'RB-011');
  assert(match !== undefined, 'expected RB-011 for interior bedroom');
  assert(match!.suggestedFixes?.some(f => f.type === 'moveRoom'), 'expected moveRoom fix');
});

test('RB-012: no violation when entry is adjacent to living room', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'e1', type: 'entry',       x: 0,  y: 0, width: 6,  height: 6 },
      { id: 'lr', type: 'living room', x: 6,  y: 0, width: 18, height: 14 },
    ],
  });
  const v = runChecks(layout, ['RB-012']);
  assert(v.length === 0, 'expected no RB-012 when entry abuts living room');
});

test('RB-012: violation when entry connects only to bedrooms', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [
      { id: 'e1', type: 'entry',   x: 0,  y: 0, width: 6,  height: 6 },
      { id: 'b1', type: 'bedroom', x: 6,  y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-012']);
  const match = v.find(x => x.code === 'RB-012');
  assert(match !== undefined, 'expected RB-012 when entry only connects to bedroom');
  assert(match!.suggestedFixes?.some(f => f.type === 'addHallwayConnection'), 'expected addHallwayConnection fix');
});

test('RB-013: no violation when bedroom and kitchen are not adjacent', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'k1', type: 'kitchen', x: 30, y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-013']);
  assert(v.length === 0, 'expected no RB-013 when bedroom and kitchen are separated');
});

test('RB-013: info violation when bedroom is adjacent to kitchen', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'k1', type: 'kitchen', x: 12, y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-013']);
  const match = v.find(x => x.code === 'RB-013');
  assert(match !== undefined, 'expected RB-013 violation');
  assert(match!.severity === 'info', 'expected info severity');
  assert(match!.suggestedFixes?.some(f => f.type === 'swapRooms'), 'expected swapRooms fix');
});

test('RB-014: no violation for 3 bedrooms with 2 bathrooms', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',  x: 0,  y: 0, width: 12, height: 10 },
      { id: 'b2', type: 'bedroom',  x: 12, y: 0, width: 12, height: 10 },
      { id: 'b3', type: 'bedroom',  x: 24, y: 0, width: 12, height: 10 },
      { id: 'ba1', type: 'bathroom', x: 0, y: 10, width: 8,  height: 6  },
      { id: 'ba2', type: 'bathroom', x: 8, y: 10, width: 8,  height: 6  },
    ],
  });
  const v = runChecks(layout, ['RB-014']);
  assert(v.length === 0, 'expected no RB-014 for 3 beds / 2 baths');
});

test('RB-014: warning for 3 bedrooms with only 1 bathroom', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',  x: 0,  y: 0, width: 12, height: 10 },
      { id: 'b2', type: 'bedroom',  x: 12, y: 0, width: 12, height: 10 },
      { id: 'b3', type: 'bedroom',  x: 24, y: 0, width: 12, height: 10 },
      { id: 'ba1', type: 'bathroom', x: 0, y: 10, width: 8, height: 6  },
    ],
  });
  const v = runChecks(layout, ['RB-014']);
  const match = v.find(x => x.code === 'RB-014');
  assert(match !== undefined, 'expected RB-014 warning');
  assert(match!.suggestedFixes?.some(f => f.type === 'addRoom'), 'expected addRoom fix');
});

test('RB-015: no violation when hall area is within limit', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'h1', type: 'hall',    x: 0,  y: 0, width: 4, height: 10 },  // 40 sq ft
      { id: 'b1', type: 'bedroom', x: 4,  y: 0, width: 20, height: 20 }, // 400 sq ft
    ],
  });
  const v = runChecks(layout, ['RB-015']);
  assert(v.length === 0, 'expected no RB-015 when hall is 9% of area');
});

test('RB-015: warning when hall area exceeds 20% of covered area', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'h1', type: 'hall',    x: 0,  y: 0, width: 10, height: 10 }, // 100 sq ft
      { id: 'b1', type: 'bedroom', x: 10, y: 0, width: 20, height: 20 }, // 400 sq ft — 100/500 = 20%
      // Need > 20%, so make hall bigger
      { id: 'h2', type: 'hall',    x: 0,  y: 10, width: 10, height: 10 }, // +100 = 200/600 = 33%
    ],
  });
  const v = runChecks(layout, ['RB-015']);
  const match = v.find(x => x.code === 'RB-015');
  assert(match !== undefined, 'expected RB-015 warning for oversized halls');
  assert(match!.suggestedFixes !== undefined && match!.suggestedFixes.length > 0, 'expected resizeRoom fix');
});

test('RB-016: no violation when entry touches exterior wall', () => {
  const layout = makeLayout({
    dimensions: { width: 40, depth: 30 },
    rooms: [{ id: 'e1', type: 'entry', x: 0, y: 0, width: 6, height: 6 }],
  });
  const v = runChecks(layout, ['RB-016']);
  assert(v.length === 0, 'expected no RB-016 when entry is on exterior');
});

test('RB-016: violation when entry does not touch exterior wall', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [{ id: 'e1', type: 'entry', x: 25, y: 25, width: 8, height: 8 }],
  });
  const v = runChecks(layout, ['RB-016']);
  const match = v.find(x => x.code === 'RB-016');
  assert(match !== undefined, 'expected RB-016 for interior entry');
  assert(match!.suggestedFixes?.some(f => f.type === 'moveRoom'), 'expected moveRoom fix');
});

test('RB-017: no violation when living+dining is >= 15% of covered area', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'lr', type: 'living room', x: 0,  y: 0, width: 18, height: 12 }, // 216
      { id: 'dn', type: 'dining',      x: 18, y: 0, width: 10, height: 12 }, // 120
      { id: 'b1', type: 'bedroom',     x: 0,  y: 12, width: 28, height: 14 }, // 392
    ],
  });
  // social = 336 / 728 = 46% — well above 15%
  const v = runChecks(layout, ['RB-017']);
  assert(v.length === 0, 'expected no RB-017 when social ratio is high');
});

test('RB-017: info violation when living+dining combined is < 15%', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'lr', type: 'living room', x: 0,  y: 0, width: 6, height: 6 },  // 36
      { id: 'dn', type: 'dining',      x: 6,  y: 0, width: 6, height: 6 },  // 36
      { id: 'b1', type: 'bedroom',     x: 0,  y: 6, width: 30, height: 30 }, // 900 — social = 72/972 = 7.4%
    ],
  });
  const v = runChecks(layout, ['RB-017']);
  const match = v.find(x => x.code === 'RB-017');
  assert(match !== undefined, 'expected RB-017 info violation');
  assert(match!.suggestedFixes !== undefined && match!.suggestedFixes.length > 0, 'expected resizeRoom fix');
});

test('RB-018: no violation when bathroom is accessible from hall', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'ba', type: 'bathroom', x: 0,  y: 0, width: 8,  height: 8  },
      { id: 'h1', type: 'hall',     x: 8,  y: 0, width: 4,  height: 8  },
    ],
  });
  const v = runChecks(layout, ['RB-018']);
  assert(v.length === 0, 'expected no RB-018 when bathroom is adjacent to hall');
});

test('RB-018: info violation when bathroom is only accessible from bedroom', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [
      { id: 'ba', type: 'bathroom', x: 0,  y: 0, width: 8,  height: 8  },
      { id: 'b1', type: 'bedroom',  x: 8,  y: 0, width: 12, height: 12 },
    ],
  });
  const v = runChecks(layout, ['RB-018']);
  const match = v.find(x => x.code === 'RB-018');
  assert(match !== undefined, 'expected RB-018 when bathroom only reachable from bedroom');
  assert(match!.suggestedFixes?.some(f => f.type === 'addHallwayConnection'), 'expected addHallwayConnection fix');
});

test('RB-019: no violation for adequately-sized kitchen', () => {
  const layout = makeLayout({
    rooms: [{ id: 'k1', type: 'kitchen', x: 0, y: 0, width: 10, height: 8 }], // 80 sq ft
  });
  const v = runChecks(layout, ['RB-019']);
  assert(v.length === 0, 'expected no RB-019 for 80 sq ft kitchen');
});

test('RB-019: warning for kitchen under 60 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'k1', type: 'kitchen', x: 0, y: 0, width: 7, height: 8 }], // 56 sq ft
  });
  const v = runChecks(layout, ['RB-019']);
  const match = v.find(x => x.code === 'RB-019');
  assert(match !== undefined, 'expected RB-019 warning');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

test('RB-019: error for kitchen under 40 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'k1', type: 'kitchen', x: 0, y: 0, width: 5, height: 7 }], // 35 sq ft
  });
  const v = runChecks(layout, ['RB-019']);
  const match = v.find(x => x.code === 'RB-019');
  assert(match !== undefined, 'expected RB-019 error');
  assert(match!.severity === 'error', `expected error, got ${match!.severity}`);
});

test('RB-020: no violation when entry does not adjoin any bedroom', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'e1', type: 'entry',       x: 0,  y: 0, width: 6,  height: 6 },
      { id: 'lr', type: 'living room', x: 6,  y: 0, width: 18, height: 14 },
      { id: 'b1', type: 'bedroom',     x: 0,  y: 14, width: 12, height: 8 },
    ],
  });
  const v = runChecks(layout, ['RB-020']);
  assert(v.length === 0, 'expected no RB-020 when entry is not adjacent to bedroom');
});

test('RB-020: violation when entry is directly adjacent to bedroom', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'e1', type: 'entry',   x: 0,  y: 0, width: 6,  height: 8 },
      { id: 'b1', type: 'bedroom', x: 6,  y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-020']);
  const match = v.find(x => x.code === 'RB-020');
  assert(match !== undefined, 'expected RB-020 violation');
  assert(match!.suggestedFixes?.some(f => f.type === 'addHallwayConnection'), 'expected addHallwayConnection fix');
});

// ── ruleChecks (RB-021 – RB-030) ─────────────────────────────────────────────

console.log('\nrunChecks (RB-021 – RB-030)');

test('RB-021: no violation when bathroom is not adjacent to dining', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'ba', type: 'bathroom', x: 0,  y: 0, width: 8, height: 6  },
      { id: 'dn', type: 'dining',   x: 20, y: 0, width: 10, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-021']);
  assert(v.length === 0, 'expected no RB-021 when bathroom and dining are separated');
});

test('RB-021: warning when bathroom is adjacent to dining room', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'ba', type: 'bathroom', x: 0,  y: 0, width: 8, height: 6 },
      { id: 'dn', type: 'dining',   x: 8,  y: 0, width: 10, height: 8 },
    ],
  });
  const v = runChecks(layout, ['RB-021']);
  const match = v.find(x => x.code === 'RB-021');
  assert(match !== undefined, 'expected RB-021 warning');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'swapRooms'), 'expected swapRooms fix');
});

test('RB-022: no violation when bathroom is not adjacent to garage', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'ba', type: 'bathroom', x: 0,  y: 0, width: 8,  height: 6  },
      { id: 'g1', type: 'garage',   x: 20, y: 0, width: 20, height: 20 },
    ],
  });
  const v = runChecks(layout, ['RB-022']);
  assert(v.length === 0, 'expected no RB-022 when bathroom and garage are separated');
});

test('RB-022: warning when bathroom is adjacent to garage', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'ba', type: 'bathroom', x: 0,  y: 0, width: 8,  height: 6  },
      { id: 'g1', type: 'garage',   x: 8,  y: 0, width: 20, height: 20 },
    ],
  });
  const v = runChecks(layout, ['RB-022']);
  const match = v.find(x => x.code === 'RB-022');
  assert(match !== undefined, 'expected RB-022 warning');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes !== undefined && match!.suggestedFixes.length > 0, 'expected suggestedFixes');
});

test('RB-023: no violation when two bedrooms are directly adjacent', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'b2', type: 'bedroom', x: 12, y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-023']);
  assert(v.length === 0, 'expected no RB-023 when bedrooms are adjacent');
});

test('RB-023: info violation when bedrooms are isolated with no shared hub', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'b2', type: 'bedroom', x: 48, y: 48, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-023']);
  const match = v.find(x => x.code === 'RB-023');
  assert(match !== undefined, 'expected RB-023 info violation for dispersed bedrooms');
  assert(match!.suggestedFixes !== undefined && match!.suggestedFixes.length > 0, 'expected moveRoom fix');
});

test('RB-023: no violation when two bedrooms share a common hall', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 40 },
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'b2', type: 'bedroom', x: 0,  y: 14, width: 12, height: 10 },
      { id: 'h1', type: 'hall',    x: 12, y: 0,  width: 4, height: 24 },
    ],
  });
  // b1 and b2 both touch h1 → clustered
  const v = runChecks(layout, ['RB-023']);
  assert(v.length === 0, 'expected no RB-023 when bedrooms share a hall');
});

test('RB-024: no violation when entry is adjacent to living room', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'e1', type: 'entry',       x: 0, y: 0, width: 6,  height: 6  },
      { id: 'lr', type: 'living room', x: 6, y: 0, width: 18, height: 14 },
    ],
  });
  const v = runChecks(layout, ['RB-024']);
  assert(v.length === 0, 'expected no RB-024 when entry is adjacent to living room');
});

test('RB-024: info violation when entry and living room are not adjacent', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [
      { id: 'e1', type: 'entry',       x: 0,  y: 0,  width: 6,  height: 6  },
      { id: 'lr', type: 'living room', x: 40, y: 40, width: 18, height: 14 },
    ],
  });
  const v = runChecks(layout, ['RB-024']);
  const match = v.find(x => x.code === 'RB-024');
  assert(match !== undefined, 'expected RB-024 info violation');
  assert(match!.suggestedFixes?.some(f => f.type === 'moveRoom'), 'expected moveRoom fix');
});

test('RB-025: no violation when 2 bedrooms have a closet', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'b2', type: 'bedroom', x: 12, y: 0, width: 12, height: 10 },
      { id: 'c1', type: 'closet',  x: 24, y: 0, width: 4,  height: 6  },
    ],
  });
  const v = runChecks(layout, ['RB-025']);
  assert(v.length === 0, 'expected no RB-025 when closet is present');
});

test('RB-025: info violation when 2+ bedrooms have no closet', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'b2', type: 'bedroom', x: 12, y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-025']);
  const match = v.find(x => x.code === 'RB-025');
  assert(match !== undefined, 'expected RB-025 info violation');
  assert(match!.suggestedFixes?.some(f => f.type === 'addRoom'), 'expected addRoom fix');
});

test('RB-026: no violation when laundry is adjacent to bathroom', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'l1', type: 'laundry',  x: 0,  y: 0, width: 6, height: 6 },
      { id: 'ba', type: 'bathroom', x: 6,  y: 0, width: 8, height: 6 },
    ],
  });
  const v = runChecks(layout, ['RB-026']);
  assert(v.length === 0, 'expected no RB-026 when laundry is adjacent to bathroom');
});

test('RB-026: info violation when laundry is isolated from service rooms', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 40 },
    rooms: [
      { id: 'l1', type: 'laundry',  x: 50, y: 30, width: 8, height: 8 },
      { id: 'k1', type: 'kitchen',  x: 0,  y: 0,  width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-026']);
  const match = v.find(x => x.code === 'RB-026');
  assert(match !== undefined, 'expected RB-026 info violation');
  assert(match!.suggestedFixes?.some(f => f.type === 'moveRoom'), 'expected moveRoom fix');
});

test('RB-027: no violation when office touches exterior wall', () => {
  const layout = makeLayout({
    dimensions: { width: 40, depth: 30 },
    rooms: [{ id: 'o1', type: 'office', x: 0, y: 0, width: 10, height: 10 }],
  });
  const v = runChecks(layout, ['RB-027']);
  assert(v.length === 0, 'expected no RB-027 when office is on exterior');
});

test('RB-027: info violation when office is interior', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [{ id: 'o1', type: 'office', x: 20, y: 20, width: 10, height: 10 }],
  });
  const v = runChecks(layout, ['RB-027']);
  const match = v.find(x => x.code === 'RB-027');
  assert(match !== undefined, 'expected RB-027 info violation for interior office');
  assert(match!.suggestedFixes?.some(f => f.type === 'moveRoom'), 'expected moveRoom fix');
});

test('RB-028: no violation when dining touches exterior wall', () => {
  const layout = makeLayout({
    dimensions: { width: 40, depth: 30 },
    rooms: [{ id: 'dn', type: 'dining', x: 0, y: 0, width: 10, height: 10 }],
  });
  const v = runChecks(layout, ['RB-028']);
  assert(v.length === 0, 'expected no RB-028 when dining is on exterior');
});

test('RB-028: info violation when dining room is interior', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [{ id: 'dn', type: 'dining', x: 20, y: 20, width: 10, height: 10 }],
  });
  const v = runChecks(layout, ['RB-028']);
  const match = v.find(x => x.code === 'RB-028');
  assert(match !== undefined, 'expected RB-028 info violation for interior dining');
  assert(match!.suggestedFixes?.some(f => f.type === 'moveRoom'), 'expected moveRoom fix');
});

test('RB-029: no violation for adequately-sized bathroom', () => {
  const layout = makeLayout({
    rooms: [{ id: 'ba', type: 'bathroom', x: 0, y: 0, width: 6, height: 6 }], // 36 sq ft
  });
  const v = runChecks(layout, ['RB-029']);
  assert(v.length === 0, 'expected no RB-029 for 36 sq ft bathroom');
});

test('RB-029: warning for bathroom between 20 and 30 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'ba', type: 'bathroom', x: 0, y: 0, width: 5, height: 5 }], // 25 sq ft
  });
  const v = runChecks(layout, ['RB-029']);
  const match = v.find(x => x.code === 'RB-029');
  assert(match !== undefined, 'expected RB-029 warning');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

test('RB-029: error for bathroom under 20 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'ba', type: 'bathroom', x: 0, y: 0, width: 4, height: 4 }], // 16 sq ft
  });
  const v = runChecks(layout, ['RB-029']);
  const match = v.find(x => x.code === 'RB-029');
  assert(match !== undefined, 'expected RB-029 error');
  assert(match!.severity === 'error', `expected error, got ${match!.severity}`);
});

test('RB-030: no violation when large plan has a hall', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 50 },
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'b2', type: 'bedroom', x: 12, y: 0, width: 12, height: 10 },
      { id: 'b3', type: 'bedroom', x: 24, y: 0, width: 12, height: 10 },
      { id: 'h1', type: 'hall',    x: 36, y: 0, width: 4,  height: 30 },
      { id: 'lr', type: 'living room', x: 0, y: 10, width: 36, height: 20 },
      { id: 'k1', type: 'kitchen', x: 36, y: 10, width: 24, height: 20 },
    ],
  });
  const v = runChecks(layout, ['RB-030']);
  assert(v.length === 0, 'expected no RB-030 when hall is present');
});

test('RB-030: info violation when large plan (≥3 beds, ≥800 sq ft) has no hall', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 50 },
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'b2', type: 'bedroom', x: 12, y: 0, width: 12, height: 10 },
      { id: 'b3', type: 'bedroom', x: 24, y: 0, width: 12, height: 10 },
      { id: 'lr', type: 'living room', x: 0, y: 10, width: 36, height: 20 },
      { id: 'k1', type: 'kitchen', x: 36, y: 0,  width: 24, height: 30 },
    ],
  });
  const v = runChecks(layout, ['RB-030']);
  const match = v.find(x => x.code === 'RB-030');
  assert(match !== undefined, 'expected RB-030 info violation for large plan without hall');
  assert(match!.suggestedFixes?.some(f => f.type === 'addRoom'), 'expected addRoom fix');
});

// ── ruleChecks (RB-031 – RB-040) ─────────────────────────────────────────────

console.log('\nrunChecks (RB-031 – RB-040)');

// RB-031: NEAR_CONTAINMENT_TOL
test('RB-031: no violation when overlap is well below 85% of smaller room', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'a', type: 'living room', x: 0, y: 0, width: 20, height: 20 },
      { id: 'b', type: 'bedroom',     x: 15, y: 15, width: 10, height: 10 },
      // overlap = 5×5 = 25; smaller area = 100; ratio = 25% < 85%
    ],
  });
  const v = runChecks(layout, ['RB-031']);
  assert(v.length === 0, 'expected no RB-031 when overlap is 25% of smaller room');
});

test('RB-031: warning when room nearly contains another (≥85% overlap, no strict containment)', () => {
  // Room B extends 0.2 units past room A's right edge → not geometrically contained
  // but overlap is ~98% of B's area
  const layout = makeLayout({
    dimensions: { width: 50, depth: 50 },
    rooms: [
      { id: 'a', type: 'living room', x: 0, y: 0, width: 20, height: 20 },
      // B: x=0.3 to 20.2, y=0.3 to 18.3 — sticks out right by 0.2, not contained
      { id: 'b', type: 'bedroom',     x: 0.3, y: 0.3, width: 19.9, height: 18 },
    ],
  });
  const v = runChecks(layout, ['RB-031']);
  const match = v.find(x => x.code === 'RB-031');
  assert(match !== undefined, 'expected RB-031 near-containment warning');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes !== undefined && match!.suggestedFixes.length > 0, 'expected suggestedFixes');
});

// RB-032: TOTAL_OVERLAP_BUDGET
test('RB-032: no violation when total overlap is tiny (< 2% of covered)', () => {
  // Two rooms with a 0.1-unit overlap: tiny relative to total area
  const layout = makeLayout({
    rooms: [
      { id: 'a', type: 'bedroom',  x: 0, y: 0, width: 12, height: 10 },
      { id: 'b', type: 'bathroom', x: 11.9, y: 0, width: 8, height: 10 },
      // overlap = 0.1 × 10 = 1; covered = 120 + 80 = 200; ratio = 0.5%
    ],
  });
  const v = runChecks(layout, ['RB-032']);
  assert(v.length === 0, 'expected no RB-032 when total overlap is < 2% of covered');
});

test('RB-032: error when aggregate overlaps exceed 2% of covered area', () => {
  // Three rooms each overlapping neighbors by ~2 units, total overlap >> 2% of covered
  const layout = makeLayout({
    rooms: [
      { id: 'a', type: 'living room', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'b', type: 'bedroom',     x: 9,  y: 0, width: 12, height: 10 },
      { id: 'c', type: 'kitchen',     x: 18, y: 0, width: 12, height: 10 },
      // a-b overlap: 3×10=30, b-c overlap: 3×10=30; total=60
      // covered≈120×3-60=300; ratio=60/300=20% >> 2%
    ],
  });
  const v = runChecks(layout, ['RB-032']);
  const match = v.find(x => x.code === 'RB-032');
  assert(match !== undefined, 'expected RB-032 error for large aggregate overlap');
  assert(match!.severity === 'error', `expected error, got ${match!.severity}`);
});

// RB-033: BEDROOM_HALL_ACCESS
test('RB-033: no violation when bedroom is 1 hop from hall', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0,  width: 10, height: 10 },
      { id: 'h1', type: 'hall',    x: 10, y: 0,  width: 5,  height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-033']);
  assert(v.length === 0, 'expected no RB-033 when bedroom is 1 hop from hall');
});

test('RB-033: info violation when bedroom is >2 hops from any hall or entry', () => {
  // bedroom → kitchen → dining → (no hall or entry)
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0, width: 10, height: 10 },
      { id: 'k1', type: 'kitchen', x: 10, y: 0, width: 10, height: 10 },
      { id: 'd1', type: 'dining',  x: 20, y: 0, width: 10, height: 10 },
      // hall exists but is far away (no adjacency within 2 hops)
      { id: 'ha', type: 'hall',    x: 35, y: 0, width: 5,  height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-033']);
  const match = v.find(x => x.code === 'RB-033');
  assert(match !== undefined, 'expected RB-033 info when bedroom cannot reach hall within 2 hops');
  assert(match!.suggestedFixes?.some(f => f.type === 'addHallwayConnection'), 'expected addHallwayConnection fix');
});

// RB-034: BATH_KITCHEN_BUFFER
test('RB-034: no violation when bathroom and kitchen are not adjacent', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'ba', type: 'bathroom', x: 0,  y: 0, width: 8, height: 6 },
      { id: 'k1', type: 'kitchen',  x: 20, y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-034']);
  assert(v.length === 0, 'expected no RB-034 when bathroom and kitchen are separated');
});

test('RB-034: warning when bathroom is directly adjacent to kitchen', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'ba', type: 'bathroom', x: 0,  y: 0, width: 8,  height: 6 },
      { id: 'k1', type: 'kitchen',  x: 8,  y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-034']);
  const match = v.find(x => x.code === 'RB-034');
  assert(match !== undefined, 'expected RB-034 warning for direct bath-kitchen adjacency');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'addHallwayConnection'), 'expected addHallwayConnection fix');
});

// RB-035: KITCHEN_PANTRY_ADJACENCY
test('RB-035: no violation when no pantry exists', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'k1', type: 'kitchen', x: 0, y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-035']);
  assert(v.length === 0, 'expected no RB-035 when no pantry exists');
});

test('RB-035: no violation when pantry is adjacent to kitchen', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'k1', type: 'kitchen', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'p1', type: 'pantry',  x: 12, y: 0, width: 4,  height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-035']);
  assert(v.length === 0, 'expected no RB-035 when pantry is adjacent to kitchen');
});

test('RB-035: info violation when pantry exists but is not adjacent to kitchen', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'k1', type: 'kitchen', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'p1', type: 'pantry',  x: 25, y: 0, width: 4,  height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-035']);
  const match = v.find(x => x.code === 'RB-035');
  assert(match !== undefined, 'expected RB-035 info when pantry is not adjacent to kitchen');
  assert(match!.suggestedFixes !== undefined && match!.suggestedFixes.length > 0, 'expected suggestedFixes');
});

// RB-036: WET_CORE_DISPERSAL
test('RB-036: no violation when wet rooms are clustered (bbox < 50% of plan)', () => {
  const layout = makeLayout({
    dimensions: { width: 40, depth: 30 },
    rooms: [
      { id: 'k1', type: 'kitchen',  x: 0,  y: 0, width: 12, height: 10 },
      { id: 'ba', type: 'bathroom', x: 12, y: 0, width: 8,  height: 10 },
      { id: 'la', type: 'laundry',  x: 0,  y: 10, width: 8, height: 8  },
      // bbox: 0..20 x 0..18 = 360; plan = 40×30 = 1200; ratio = 30% < 50%
    ],
  });
  const v = runChecks(layout, ['RB-036']);
  assert(v.length === 0, 'expected no RB-036 when wet rooms are clustered');
});

test('RB-036: warning when wet rooms are dispersed across plan (bbox > 50% of plan)', () => {
  const layout = makeLayout({
    dimensions: { width: 40, depth: 30 },
    rooms: [
      { id: 'k1', type: 'kitchen',  x: 0,   y: 0,  width: 10, height: 10 },
      { id: 'ba', type: 'bathroom', x: 30,  y: 20,  width: 8,  height: 8  },
      // bbox: 0..38 x 0..28 = 1064; plan = 1200; ratio = 88.7% > 50%
    ],
  });
  const v = runChecks(layout, ['RB-036']);
  const match = v.find(x => x.code === 'RB-036');
  assert(match !== undefined, 'expected RB-036 warning for dispersed wet core');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes !== undefined && match!.suggestedFixes.length > 0, 'expected suggestedFixes');
});

// RB-037: BEDROOM_PASS_THROUGH
test('RB-037: no violation when bedroom has ≤2 adjacencies', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',  x: 0,  y: 0, width: 12, height: 10 },
      { id: 'h1', type: 'hall',     x: 12, y: 0, width: 5,  height: 10 },
      { id: 'cl', type: 'closet',   x: 0,  y: 10, width: 6, height: 4  },
      // bedroom is adjacent to hall and closet only — 2 adjacencies
    ],
  });
  const v = runChecks(layout, ['RB-037']);
  assert(v.length === 0, 'expected no RB-037 when bedroom has only 2 adjacencies');
});

test('RB-037: info violation when bedroom has ≥3 adjacencies', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',     x: 5,  y: 5, width: 10, height: 10 },
      { id: 'h1', type: 'hall',        x: 15, y: 5, width: 5,  height: 10 }, // right
      { id: 'ba', type: 'bathroom',    x: 5,  y: 15, width: 10, height: 5  }, // bottom
      { id: 'lr', type: 'living room', x: 0,  y: 5, width: 5,  height: 10 }, // left
      // b1 is adjacent to h1 (right), ba (bottom), lr (left) = 3 adjacencies
    ],
  });
  const v = runChecks(layout, ['RB-037']);
  const match = v.find(x => x.code === 'RB-037');
  assert(match !== undefined, 'expected RB-037 info for pass-through bedroom');
  assert(match!.severity === 'info', `expected info, got ${match!.severity}`);
  assert(match!.value !== undefined && match!.value >= 3, 'expected value ≥ 3');
});

// RB-038: BATHROOM_PASS_THROUGH
test('RB-038: no violation when bathroom has ≤2 adjacencies', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'ba', type: 'bathroom', x: 0, y: 0, width: 8, height: 6 },
      { id: 'b1', type: 'bedroom',  x: 8, y: 0, width: 12, height: 6 },
      { id: 'h1', type: 'hall',     x: 0, y: 6, width: 8,  height: 4 },
    ],
  });
  const v = runChecks(layout, ['RB-038']);
  assert(v.length === 0, 'expected no RB-038 when bathroom has only 2 adjacencies');
});

test('RB-038: info violation when bathroom has ≥3 adjacencies', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'ba', type: 'bathroom',    x: 5,  y: 5, width: 10, height: 8 },
      { id: 'b1', type: 'bedroom',     x: 15, y: 5, width: 10, height: 8 }, // right
      { id: 'b2', type: 'bedroom',     x: 0,  y: 5, width: 5,  height: 8 }, // left
      { id: 'h1', type: 'hall',        x: 5,  y: 13, width: 10, height: 4 }, // bottom
      // ba is adjacent to b1 (right), b2 (left), h1 (bottom) = 3 adjacencies
    ],
  });
  const v = runChecks(layout, ['RB-038']);
  const match = v.find(x => x.code === 'RB-038');
  assert(match !== undefined, 'expected RB-038 info for pass-through bathroom');
  assert(match!.severity === 'info', `expected info, got ${match!.severity}`);
});

// RB-039: BEDROOM_NOT_ADJACENT_LIVING
test('RB-039: no violation when bedroom is not adjacent to living room', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',     x: 0,  y: 0, width: 12, height: 10 },
      { id: 'h1', type: 'hall',        x: 12, y: 0, width: 5,  height: 10 },
      { id: 'lr', type: 'living room', x: 17, y: 0, width: 15, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-039']);
  assert(v.length === 0, 'expected no RB-039 when hall separates bedroom from living');
});

test('RB-039: info violation when bedroom is directly adjacent to living room', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',     x: 0,  y: 0, width: 12, height: 10 },
      { id: 'lr', type: 'living room', x: 12, y: 0, width: 15, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-039']);
  const match = v.find(x => x.code === 'RB-039');
  assert(match !== undefined, 'expected RB-039 info for bedroom adjacent to living room');
  assert(match!.severity === 'info', `expected info, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'addHallwayConnection'), 'expected addHallwayConnection fix');
});

// RB-040: ENTRY_NEEDS_HALL
test('RB-040: no violation when no entry exists', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',  x: 0,  y: 0, width: 12, height: 10 },
      { id: 'b2', type: 'bedroom',  x: 12, y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-040']);
  assert(v.length === 0, 'expected no RB-040 when no entry exists');
});

test('RB-040: no violation when entry is adjacent to a hall', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'en', type: 'entry',   x: 0,  y: 0, width: 8, height: 6 },
      { id: 'ha', type: 'hall',    x: 8,  y: 0, width: 5, height: 6 },
      { id: 'b1', type: 'bedroom', x: 0,  y: 6, width: 12, height: 10 },
      { id: 'b2', type: 'bedroom', x: 12, y: 6, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-040']);
  assert(v.length === 0, 'expected no RB-040 when entry is adjacent to hall');
});

test('RB-040: warning when entry exists, ≥2 bedrooms present, but no hall is adjacent to entry', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'en', type: 'entry',       x: 0,  y: 0, width: 8,  height: 6 },
      { id: 'lr', type: 'living room', x: 8,  y: 0, width: 15, height: 10 },
      { id: 'b1', type: 'bedroom',     x: 0,  y: 6, width: 12, height: 10 },
      { id: 'b2', type: 'bedroom',     x: 12, y: 6, width: 12, height: 10 },
      // hall exists but is far from entry
      { id: 'ha', type: 'hall',        x: 30, y: 0, width: 5,  height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-040']);
  const match = v.find(x => x.code === 'RB-040');
  assert(match !== undefined, 'expected RB-040 warning when entry has no adjacent hall');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes !== undefined && match!.suggestedFixes.length > 0, 'expected suggestedFixes');
});

// ── ruleChecks (RB-041 – RB-050) ─────────────────────────────────────────────

console.log('\nrunChecks (RB-041 – RB-050)');

// RB-041: GARAGE_BEDROOM_SEPARATION
test('RB-041: no violation when garage and bedroom are not adjacent', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'g1', type: 'garage',  x: 0,  y: 0, width: 20, height: 20 },
      { id: 'b1', type: 'bedroom', x: 30, y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-041']);
  assert(v.length === 0, 'expected no RB-041 when garage and bedroom are separated');
});

test('RB-041: warning when garage is directly adjacent to bedroom', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'g1', type: 'garage',  x: 0,  y: 0, width: 20, height: 20 },
      { id: 'b1', type: 'bedroom', x: 20, y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-041']);
  const match = v.find(x => x.code === 'RB-041');
  assert(match !== undefined, 'expected RB-041 warning for garage adjacent to bedroom');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'swapRooms'), 'expected swapRooms fix');
});

// RB-042: KITCHEN_LIVING_ADJACENCY
test('RB-042: no violation when kitchen is adjacent to living room', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'k1', type: 'kitchen',     x: 0,  y: 0, width: 12, height: 10 },
      { id: 'lr', type: 'living room', x: 12, y: 0, width: 18, height: 14 },
    ],
  });
  const v = runChecks(layout, ['RB-042']);
  assert(v.length === 0, 'expected no RB-042 when kitchen is adjacent to living room');
});

test('RB-042: info violation when kitchen and living room are not adjacent', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 40 },
    rooms: [
      { id: 'k1', type: 'kitchen',     x: 0,  y: 0, width: 12, height: 10 },
      { id: 'lr', type: 'living room', x: 48, y: 30, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-042']);
  const match = v.find(x => x.code === 'RB-042');
  assert(match !== undefined, 'expected RB-042 info violation for separated kitchen and living');
  assert(match!.severity === 'info', `expected info, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'moveRoom'), 'expected moveRoom fix');
});

// RB-043: BATHROOM_EXTERIOR_ACCESS
test('RB-043: no violation when bathroom touches exterior wall', () => {
  const layout = makeLayout({
    dimensions: { width: 40, depth: 30 },
    rooms: [{ id: 'ba', type: 'bathroom', x: 0, y: 0, width: 8, height: 6 }],
  });
  const v = runChecks(layout, ['RB-043']);
  assert(v.length === 0, 'expected no RB-043 when bathroom is on exterior');
});

test('RB-043: info violation when bathroom is interior (not touching any wall)', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [{ id: 'ba', type: 'bathroom', x: 20, y: 20, width: 8, height: 6 }],
  });
  const v = runChecks(layout, ['RB-043']);
  const match = v.find(x => x.code === 'RB-043');
  assert(match !== undefined, 'expected RB-043 info for interior bathroom');
  assert(match!.severity === 'info', `expected info, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'moveRoom'), 'expected moveRoom fix');
});

// RB-044: KITCHEN_NOT_ADJACENT_GARAGE
test('RB-044: no violation when kitchen and garage are not adjacent', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'k1', type: 'kitchen', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'g1', type: 'garage',  x: 25, y: 0, width: 20, height: 20 },
    ],
  });
  const v = runChecks(layout, ['RB-044']);
  assert(v.length === 0, 'expected no RB-044 when kitchen and garage are separated');
});

test('RB-044: warning when kitchen is directly adjacent to garage', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'k1', type: 'kitchen', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'g1', type: 'garage',  x: 12, y: 0, width: 20, height: 20 },
    ],
  });
  const v = runChecks(layout, ['RB-044']);
  const match = v.find(x => x.code === 'RB-044');
  assert(match !== undefined, 'expected RB-044 warning for kitchen adjacent to garage');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'swapRooms'), 'expected swapRooms fix');
});

// RB-045: ENTRY_ROOM_PRESENT
test('RB-045: no violation when an entry room is present', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'e1', type: 'entry',   x: 0, y: 0, width: 8, height: 6 },
      { id: 'b1', type: 'bedroom', x: 8, y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-045']);
  assert(v.length === 0, 'expected no RB-045 when entry is present');
});

test('RB-045: info violation when no entry room exists', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',     x: 0,  y: 0, width: 12, height: 10 },
      { id: 'lr', type: 'living room', x: 12, y: 0, width: 18, height: 14 },
      { id: 'k1', type: 'kitchen',     x: 0,  y: 10, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-045']);
  const match = v.find(x => x.code === 'RB-045');
  assert(match !== undefined, 'expected RB-045 info when no entry room is present');
  assert(match!.suggestedFixes?.some(f => f.type === 'addRoom'), 'expected addRoom fix');
});

// RB-046: LIVING_MIN_AREA
test('RB-046: no violation for adequately-sized living room', () => {
  const layout = makeLayout({
    rooms: [{ id: 'lr', type: 'living room', x: 0, y: 0, width: 15, height: 14 }], // 210 sq ft
  });
  const v = runChecks(layout, ['RB-046']);
  assert(v.length === 0, 'expected no RB-046 for 210 sq ft living room');
});

test('RB-046: warning for living room between 120 and 180 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'lr', type: 'living room', x: 0, y: 0, width: 13, height: 11 }], // 143 sq ft
  });
  const v = runChecks(layout, ['RB-046']);
  const match = v.find(x => x.code === 'RB-046');
  assert(match !== undefined, 'expected RB-046 warning for 143 sq ft living room');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

test('RB-046: error for living room under 120 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'lr', type: 'living room', x: 0, y: 0, width: 10, height: 10 }], // 100 sq ft
  });
  const v = runChecks(layout, ['RB-046']);
  const match = v.find(x => x.code === 'RB-046');
  assert(match !== undefined, 'expected RB-046 error for 100 sq ft living room');
  assert(match!.severity === 'error', `expected error, got ${match!.severity}`);
});

// RB-047: NO_ORPHAN_ROOMS
test('RB-047: no violation when all rooms are adjacent to at least one other room', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'r1', type: 'bedroom',  x: 0,  y: 0, width: 12, height: 10 },
      { id: 'r2', type: 'bathroom', x: 12, y: 0, width: 8,  height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-047']);
  assert(v.length === 0, 'expected no RB-047 when all rooms have neighbors');
});

test('RB-047: warning when a room has no adjacency to any other room', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [
      { id: 'r1', type: 'bedroom', x: 0,  y: 0,  width: 12, height: 10 },
      { id: 'r2', type: 'kitchen', x: 50, y: 50, width: 8,  height: 8  }, // orphan
    ],
  });
  const v = runChecks(layout, ['RB-047']);
  const match = v.find(x => x.code === 'RB-047');
  assert(match !== undefined, 'expected RB-047 warning for orphan room');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'moveRoom'), 'expected moveRoom fix');
});

// RB-048: GARAGE_EXTERIOR_ACCESS
test('RB-048: no violation when garage touches exterior wall', () => {
  const layout = makeLayout({
    dimensions: { width: 40, depth: 30 },
    rooms: [{ id: 'g1', type: 'garage', x: 0, y: 0, width: 20, height: 20 }],
  });
  const v = runChecks(layout, ['RB-048']);
  assert(v.length === 0, 'expected no RB-048 when garage is on exterior');
});

test('RB-048: error when garage is interior (not touching any wall)', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [{ id: 'g1', type: 'garage', x: 10, y: 10, width: 20, height: 20 }],
  });
  const v = runChecks(layout, ['RB-048']);
  const match = v.find(x => x.code === 'RB-048');
  assert(match !== undefined, 'expected RB-048 error for interior garage');
  assert(match!.severity === 'error', `expected error, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'moveRoom'), 'expected moveRoom fix');
});

// RB-049: LAUNDRY_NOT_ADJACENT_KITCHEN
test('RB-049: no violation when laundry and kitchen are not adjacent', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'l1', type: 'laundry', x: 0,  y: 0, width: 6, height: 6 },
      { id: 'k1', type: 'kitchen', x: 20, y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-049']);
  assert(v.length === 0, 'expected no RB-049 when laundry and kitchen are separated');
});

test('RB-049: info violation when laundry is directly adjacent to kitchen', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'l1', type: 'laundry', x: 0,  y: 0, width: 6,  height: 6  },
      { id: 'k1', type: 'kitchen', x: 6,  y: 0, width: 12, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-049']);
  const match = v.find(x => x.code === 'RB-049');
  assert(match !== undefined, 'expected RB-049 info for laundry adjacent to kitchen');
  assert(match!.severity === 'info', `expected info, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'swapRooms'), 'expected swapRooms fix');
});

// RB-050: MINIMUM_GROSS_AREA
test('RB-050: no violation when covered area is >= 200 sq ft', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',  x: 0,  y: 0, width: 12, height: 10 }, // 120 sq ft
      { id: 'ba', type: 'bathroom', x: 12, y: 0, width: 8,  height: 10 }, // 80 sq ft — total 200
    ],
  });
  const v = runChecks(layout, ['RB-050']);
  assert(v.length === 0, 'expected no RB-050 when covered area is exactly 200 sq ft');
});

test('RB-050: error when total covered area is under 200 sq ft', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0, y: 0, width: 10, height: 10 }, // 100 sq ft
    ],
  });
  const v = runChecks(layout, ['RB-050']);
  const match = v.find(x => x.code === 'RB-050');
  assert(match !== undefined, 'expected RB-050 error for 100 sq ft covered area');
  assert(match!.severity === 'error', `expected error, got ${match!.severity}`);
  assert(match!.suggestedFixes !== undefined && match!.suggestedFixes.length > 0, 'expected suggestedFixes');
});

test('RB-050: error when covered area is just under 200 sq ft', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',  x: 0,  y: 0, width: 10, height: 10 }, // 100 sq ft
      { id: 'ba', type: 'bathroom', x: 10, y: 0, width: 9,  height: 10 }, // 90 sq ft — total 190
    ],
  });
  const v = runChecks(layout, ['RB-050']);
  const match = v.find(x => x.code === 'RB-050');
  assert(match !== undefined, 'expected RB-050 error for 190 sq ft covered area');
  assert(match!.value !== undefined && match!.value < 200, 'expected value < 200');
});

// ── ruleChecks (RB-051 – RB-060) ─────────────────────────────────────────────

console.log('\nrunChecks (RB-051 – RB-060)');

// RB-051: DINING_MIN_AREA
test('RB-051: no violation for adequately-sized dining room', () => {
  const layout = makeLayout({
    rooms: [{ id: 'd1', type: 'dining', x: 0, y: 0, width: 10, height: 9 }], // 90 sq ft
  });
  const v = runChecks(layout, ['RB-051']);
  assert(v.length === 0, 'expected no RB-051 for 90 sq ft dining room');
});

test('RB-051: warning for dining room between 60 and 80 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'd1', type: 'dining', x: 0, y: 0, width: 9, height: 8 }], // 72 sq ft
  });
  const v = runChecks(layout, ['RB-051']);
  const match = v.find(x => x.code === 'RB-051');
  assert(match !== undefined, 'expected RB-051 warning for 72 sq ft dining room');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

test('RB-051: error for dining room under 60 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'd1', type: 'dining', x: 0, y: 0, width: 7, height: 8 }], // 56 sq ft
  });
  const v = runChecks(layout, ['RB-051']);
  const match = v.find(x => x.code === 'RB-051');
  assert(match !== undefined, 'expected RB-051 error for 56 sq ft dining room');
  assert(match!.severity === 'error', `expected error, got ${match!.severity}`);
});

// RB-052: OFFICE_MIN_AREA
test('RB-052: no violation for adequately-sized office', () => {
  const layout = makeLayout({
    rooms: [{ id: 'o1', type: 'office', x: 0, y: 0, width: 10, height: 9 }], // 90 sq ft
  });
  const v = runChecks(layout, ['RB-052']);
  assert(v.length === 0, 'expected no RB-052 for 90 sq ft office');
});

test('RB-052: warning for office under 80 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'o1', type: 'office', x: 0, y: 0, width: 8, height: 9 }], // 72 sq ft
  });
  const v = runChecks(layout, ['RB-052']);
  const match = v.find(x => x.code === 'RB-052');
  assert(match !== undefined, 'expected RB-052 warning for 72 sq ft office');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

// RB-053: STAIR_GEOMETRY
test('RB-053: no violation for correctly-sized stair room', () => {
  const layout = makeLayout({
    rooms: [{ id: 's1', type: 'stair', x: 0, y: 0, width: 4, height: 10 }],
  });
  const v = runChecks(layout, ['RB-053']);
  assert(v.length === 0, 'expected no RB-053 for 4 ft × 10 ft stair room');
});

test('RB-053: error for stair room that is too narrow', () => {
  const layout = makeLayout({
    rooms: [{ id: 's1', type: 'stair', x: 0, y: 0, width: 3, height: 10 }],
  });
  const v = runChecks(layout, ['RB-053']);
  const match = v.find(x => x.code === 'RB-053');
  assert(match !== undefined, 'expected RB-053 error for 3 ft narrow stair room');
  assert(match!.severity === 'error', `expected error, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

test('RB-053: error for stair room that is too short', () => {
  const layout = makeLayout({
    rooms: [{ id: 's1', type: 'stair', x: 0, y: 0, width: 4, height: 5 }],
  });
  const v = runChecks(layout, ['RB-053']);
  const match = v.find(x => x.code === 'RB-053');
  assert(match !== undefined, 'expected RB-053 error for stair room only 5 ft long');
});

// RB-054: PRIMARY_BEDROOM_MIN_AREA
test('RB-054: no violation when primary bedroom meets 120 sq ft', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0, y: 0, width: 12, height: 11, label: 'master bedroom' },
    ],
  });
  const v = runChecks(layout, ['RB-054']);
  assert(v.length === 0, 'expected no RB-054 for 132 sq ft master bedroom');
});

test('RB-054: warning when primary bedroom is under 120 sq ft', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0, y: 0, width: 10, height: 10, label: 'primary bedroom' },
    ],
  });
  const v = runChecks(layout, ['RB-054']);
  const match = v.find(x => x.code === 'RB-054');
  assert(match !== undefined, 'expected RB-054 warning for 100 sq ft primary bedroom');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

test('RB-054: warning targets largest bedroom when no label match', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0, width: 10, height: 10 }, // 100 sq ft (largest)
      { id: 'b2', type: 'bedroom', x: 10, y: 0, width: 8,  height: 9  }, // 72 sq ft
    ],
  });
  const v = runChecks(layout, ['RB-054']);
  // Only the largest bedroom (b1) is checked as primary
  const match = v.find(x => x.code === 'RB-054');
  assert(match !== undefined, 'expected RB-054 on largest bedroom when no label');
  assert(match!.roomIds?.includes('b1'), 'expected violation on the largest bedroom');
});

// RB-055: KITCHEN_DINING_ADJACENCY
test('RB-055: no violation when kitchen and dining are adjacent', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'k1', type: 'kitchen', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'd1', type: 'dining',  x: 12, y: 0, width: 10, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-055']);
  assert(v.length === 0, 'expected no RB-055 when kitchen is adjacent to dining');
});

test('RB-055: info violation when kitchen and dining are not adjacent', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'k1', type: 'kitchen', x: 0,  y: 0, width: 12, height: 10 },
      { id: 'd1', type: 'dining',  x: 25, y: 0, width: 10, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-055']);
  const match = v.find(x => x.code === 'RB-055');
  assert(match !== undefined, 'expected RB-055 info when kitchen and dining are separated');
  assert(match!.severity === 'info', `expected info, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'swapRooms'), 'expected swapRooms fix');
});

// RB-056: KITCHEN_MIN_WIDTH
test('RB-056: no violation for kitchen 8 ft wide', () => {
  const layout = makeLayout({
    rooms: [{ id: 'k1', type: 'kitchen', x: 0, y: 0, width: 8, height: 12 }],
  });
  const v = runChecks(layout, ['RB-056']);
  assert(v.length === 0, 'expected no RB-056 for 8 ft kitchen');
});

test('RB-056: warning for kitchen narrower than 8 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'k1', type: 'kitchen', x: 0, y: 0, width: 6, height: 12 }],
  });
  const v = runChecks(layout, ['RB-056']);
  const match = v.find(x => x.code === 'RB-056');
  assert(match !== undefined, 'expected RB-056 warning for 6 ft kitchen');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

// RB-057: LAUNDRY_EXTERIOR_ACCESS
test('RB-057: no violation when laundry touches exterior wall', () => {
  const layout = makeLayout({
    dimensions: { width: 40, depth: 30 },
    rooms: [{ id: 'l1', type: 'laundry', x: 0, y: 0, width: 6, height: 6 }],
  });
  const v = runChecks(layout, ['RB-057']);
  assert(v.length === 0, 'expected no RB-057 when laundry is on exterior');
});

test('RB-057: info violation when laundry is interior', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [{ id: 'l1', type: 'laundry', x: 10, y: 10, width: 6, height: 6 }],
  });
  const v = runChecks(layout, ['RB-057']);
  const match = v.find(x => x.code === 'RB-057');
  assert(match !== undefined, 'expected RB-057 info for interior laundry');
  assert(match!.severity === 'info', `expected info, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'moveRoom'), 'expected moveRoom fix');
});

// RB-058: BATHROOM_MIN_WIDTH
test('RB-058: no violation for bathroom 5 ft wide', () => {
  const layout = makeLayout({
    rooms: [{ id: 'ba', type: 'bathroom', x: 0, y: 0, width: 5, height: 8 }],
  });
  const v = runChecks(layout, ['RB-058']);
  assert(v.length === 0, 'expected no RB-058 for 5 ft bathroom');
});

test('RB-058: warning for bathroom narrower than 5 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'ba', type: 'bathroom', x: 0, y: 0, width: 4, height: 8 }],
  });
  const v = runChecks(layout, ['RB-058']);
  const match = v.find(x => x.code === 'RB-058');
  assert(match !== undefined, 'expected RB-058 warning for 4 ft bathroom');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

// RB-059: HABITABLE_ROOM_DAYLIGHTING_DEPTH
test('RB-059: no violation for room with depth-to-width ratio <= 2.5', () => {
  const layout = makeLayout({
    rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 10, height: 24 }], // 2.4:1
  });
  const v = runChecks(layout, ['RB-059']);
  assert(v.length === 0, 'expected no RB-059 for 2.4:1 bedroom');
});

test('RB-059: warning when habitable room depth exceeds 2.5x width', () => {
  const layout = makeLayout({
    rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 8, height: 30 }], // 3.75:1
  });
  const v = runChecks(layout, ['RB-059']);
  const match = v.find(x => x.code === 'RB-059');
  assert(match !== undefined, 'expected RB-059 warning for 3.75:1 bedroom');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

test('RB-059: no violation for non-habitable room with high aspect ratio', () => {
  const layout = makeLayout({
    rooms: [{ id: 'g1', type: 'garage', x: 0, y: 0, width: 8, height: 30 }], // 3.75:1 but garage
  });
  const v = runChecks(layout, ['RB-059']);
  assert(v.length === 0, 'expected no RB-059 for non-habitable room regardless of ratio');
});

// RB-060: BEDROOM_MIN_WIDTH
test('RB-060: no violation for bedroom 8 ft wide', () => {
  const layout = makeLayout({
    rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 8, height: 12 }],
  });
  const v = runChecks(layout, ['RB-060']);
  assert(v.length === 0, 'expected no RB-060 for 8 ft bedroom');
});

test('RB-060: warning for bedroom narrower than 8 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 7, height: 12 }],
  });
  const v = runChecks(layout, ['RB-060']);
  const match = v.find(x => x.code === 'RB-060');
  assert(match !== undefined, 'expected RB-060 warning for 7 ft bedroom');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

test('RB-060: violation targets narrower dimension (tall narrow room)', () => {
  const layout = makeLayout({
    rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 6, height: 20 }],
  });
  const v = runChecks(layout, ['RB-060']);
  const match = v.find(x => x.code === 'RB-060');
  assert(match !== undefined, 'expected RB-060 for 6 ft wide bedroom');
  assert(match!.value !== undefined && match!.value < 8, `expected value < 8, got ${match!.value}`);
});

// RB-061: LIVING_ROOM_MIN_WIDTH
test('RB-061: no violation for living room 12 ft wide', () => {
  const layout = makeLayout({
    rooms: [{ id: 'l1', type: 'living', x: 0, y: 0, width: 12, height: 16 }],
  });
  const v = runChecks(layout, ['RB-061']);
  assert(v.length === 0, 'expected no RB-061 for 12 ft living room');
});

test('RB-061: warning for living room narrower than 12 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'l1', type: 'living', x: 0, y: 0, width: 10, height: 15 }],
  });
  const v = runChecks(layout, ['RB-061']);
  const match = v.find(x => x.code === 'RB-061');
  assert(match !== undefined, 'expected RB-061 warning for 10 ft living room');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

test('RB-061: no violation for "living room" type 14 ft wide', () => {
  const layout = makeLayout({
    rooms: [{ id: 'l1', type: 'living room', x: 0, y: 0, width: 14, height: 18 }],
  });
  const v = runChecks(layout, ['RB-061']);
  assert(v.length === 0, 'expected no RB-061 for 14 ft "living room" type');
});

// RB-062: DINING_ROOM_MIN_WIDTH
test('RB-062: no violation for dining room 9 ft wide', () => {
  const layout = makeLayout({
    rooms: [{ id: 'd1', type: 'dining', x: 0, y: 0, width: 9, height: 12 }],
  });
  const v = runChecks(layout, ['RB-062']);
  assert(v.length === 0, 'expected no RB-062 for 9 ft dining room');
});

test('RB-062: warning for dining room narrower than 9 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'd1', type: 'dining', x: 0, y: 0, width: 7, height: 12 }],
  });
  const v = runChecks(layout, ['RB-062']);
  const match = v.find(x => x.code === 'RB-062');
  assert(match !== undefined, 'expected RB-062 warning for 7 ft dining room');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.value !== undefined && match!.value < 9, `expected value < 9, got ${match!.value}`);
});

// RB-063: KITCHEN_MAX_ASPECT_RATIO
test('RB-063: no violation for kitchen with 2:1 aspect ratio', () => {
  const layout = makeLayout({
    rooms: [{ id: 'k1', type: 'kitchen', x: 0, y: 0, width: 20, height: 10 }],
  });
  const v = runChecks(layout, ['RB-063']);
  assert(v.length === 0, 'expected no RB-063 for 2:1 kitchen');
});

test('RB-063: warning for kitchen with 4:1 aspect ratio', () => {
  const layout = makeLayout({
    rooms: [{ id: 'k1', type: 'kitchen', x: 0, y: 0, width: 4, height: 16 }],
  });
  const v = runChecks(layout, ['RB-063']);
  const match = v.find(x => x.code === 'RB-063');
  assert(match !== undefined, 'expected RB-063 warning for 4:1 kitchen');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

// RB-064: PRIMARY_BEDROOM_ADJACENT_BATHROOM
test('RB-064: no violation when bedroom is adjacent to bathroom', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1',  type: 'bedroom',  x: 0,  y: 0, width: 12, height: 12 },
      { id: 'ba1', type: 'bathroom', x: 12, y: 0, width: 6,  height: 8  },
    ],
  });
  const v = runChecks(layout, ['RB-064']);
  assert(v.length === 0, 'expected no RB-064 when bedroom touches bathroom');
});

test('RB-064: warning when no bedroom is adjacent to a bathroom', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1',  type: 'bedroom',  x: 0,  y: 0,  width: 12, height: 12 },
      { id: 'ba1', type: 'bathroom', x: 20, y: 20, width: 6,  height: 8  },
    ],
  });
  const v = runChecks(layout, ['RB-064']);
  const match = v.find(x => x.code === 'RB-064');
  assert(match !== undefined, 'expected RB-064 when no bedroom-bathroom adjacency');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
});

// RB-065: OFFICE_MIN_WIDTH
test('RB-065: no violation for office 8 ft wide', () => {
  const layout = makeLayout({
    rooms: [{ id: 'o1', type: 'office', x: 0, y: 0, width: 8, height: 10 }],
  });
  const v = runChecks(layout, ['RB-065']);
  assert(v.length === 0, 'expected no RB-065 for 8 ft office');
});

test('RB-065: warning for office narrower than 8 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'o1', type: 'office', x: 0, y: 0, width: 6, height: 10 }],
  });
  const v = runChecks(layout, ['RB-065']);
  const match = v.find(x => x.code === 'RB-065');
  assert(match !== undefined, 'expected RB-065 warning for 6 ft office');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

// RB-066: HALL_MIN_WIDTH
test('RB-066: no violation for hall 3 ft wide', () => {
  const layout = makeLayout({
    rooms: [{ id: 'h1', type: 'hall', x: 0, y: 0, width: 3, height: 20 }],
  });
  const v = runChecks(layout, ['RB-066']);
  assert(v.length === 0, 'expected no RB-066 for 3 ft hall');
});

test('RB-066: error for hall narrower than 3 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'h1', type: 'hall', x: 0, y: 0, width: 2, height: 20 }],
  });
  const v = runChecks(layout, ['RB-066']);
  const match = v.find(x => x.code === 'RB-066');
  assert(match !== undefined, 'expected RB-066 error for 2 ft hall');
  assert(match!.severity === 'error', `expected error, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

// RB-067: LAUNDRY_MIN_AREA
test('RB-067: no violation for laundry room 30 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'lau1', type: 'laundry', x: 0, y: 0, width: 6, height: 5 }], // 30 sq ft
  });
  const v = runChecks(layout, ['RB-067']);
  assert(v.length === 0, 'expected no RB-067 for 30 sq ft laundry');
});

test('RB-067: warning for laundry room under 30 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'lau1', type: 'laundry', x: 0, y: 0, width: 4, height: 6 }], // 24 sq ft
  });
  const v = runChecks(layout, ['RB-067']);
  const match = v.find(x => x.code === 'RB-067');
  assert(match !== undefined, 'expected RB-067 warning for 24 sq ft laundry');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

// RB-068: CLOSET_MIN_AREA
test('RB-068: no violation for closet 6 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'c1', type: 'closet', x: 0, y: 0, width: 2, height: 3 }], // 6 sq ft
  });
  const v = runChecks(layout, ['RB-068']);
  assert(v.length === 0, 'expected no RB-068 for 6 sq ft closet');
});

test('RB-068: warning for closet under 6 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'c1', type: 'closet', x: 0, y: 0, width: 1.5, height: 3 }], // 4.5 sq ft
  });
  const v = runChecks(layout, ['RB-068']);
  const match = v.find(x => x.code === 'RB-068');
  assert(match !== undefined, 'expected RB-068 warning for 4.5 sq ft closet');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.value !== undefined && match!.value < 6, `expected value < 6, got ${match!.value}`);
});

// RB-069: GARAGE_MIN_WIDTH
test('RB-069: no violation for garage 10 ft wide', () => {
  const layout = makeLayout({
    rooms: [{ id: 'g1', type: 'garage', x: 0, y: 0, width: 10, height: 20 }],
  });
  const v = runChecks(layout, ['RB-069']);
  assert(v.length === 0, 'expected no RB-069 for 10 ft garage');
});

test('RB-069: warning for garage narrower than 10 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'g1', type: 'garage', x: 0, y: 0, width: 8, height: 20 }],
  });
  const v = runChecks(layout, ['RB-069']);
  const match = v.find(x => x.code === 'RB-069');
  assert(match !== undefined, 'expected RB-069 warning for 8 ft garage');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

// RB-070: MAX_SINGLE_ROOM_DOMINANCE
test('RB-070: no violation when largest room is 50% of total', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'r1', type: 'living',  x: 0,  y: 0, width: 10, height: 10 }, // 100 sq ft
      { id: 'r2', type: 'bedroom', x: 10, y: 0, width: 10, height: 10 }, // 100 sq ft
    ],
  });
  const v = runChecks(layout, ['RB-070']);
  assert(v.length === 0, 'expected no RB-070 for 50/50 split');
});

test('RB-070: warning when one room exceeds 50% of plan area', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'r1', type: 'living',  x: 0,  y: 0, width: 30, height: 20 }, // 600 sq ft
      { id: 'r2', type: 'bedroom', x: 30, y: 0, width: 5,  height: 20 }, // 100 sq ft
    ],
  });
  const v = runChecks(layout, ['RB-070']);
  const match = v.find(x => x.code === 'RB-070');
  assert(match !== undefined, 'expected RB-070 warning when one room > 50%');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.roomIds?.includes('r1'), 'expected dominant room r1 in roomIds');
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

// RB-071: ENTRY_MIN_AREA
test('RB-071: no violation for entry 20 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'e1', type: 'entry', x: 0, y: 0, width: 4, height: 5 }], // 20 sq ft
  });
  const v = runChecks(layout, ['RB-071']);
  assert(v.length === 0, 'expected no RB-071 for 20 sq ft entry');
});

test('RB-071: warning for entry under 20 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'e1', type: 'entry', x: 0, y: 0, width: 3, height: 4 }], // 12 sq ft
  });
  const v = runChecks(layout, ['RB-071']);
  const match = v.find(x => x.code === 'RB-071');
  assert(match !== undefined, 'expected RB-071 warning for 12 sq ft entry');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.value !== undefined && match!.value < 20, `expected value < 20, got ${match!.value}`);
});

test('RB-071: no violation for entry exactly 20 sq ft (5×4)', () => {
  const layout = makeLayout({
    rooms: [{ id: 'e1', type: 'entry', x: 0, y: 0, width: 5, height: 4 }], // 20 sq ft
  });
  const v = runChecks(layout, ['RB-071']);
  assert(v.length === 0, 'expected no RB-071 for exactly 20 sq ft entry');
});

// RB-072: BATHROOM_ASPECT_RATIO
test('RB-072: no violation for bathroom with 2:1 aspect ratio', () => {
  const layout = makeLayout({
    rooms: [{ id: 'b1', type: 'bathroom', x: 0, y: 0, width: 5, height: 10 }], // 2:1
  });
  const v = runChecks(layout, ['RB-072']);
  assert(v.length === 0, 'expected no RB-072 for 2:1 bathroom');
});

test('RB-072: warning for bathroom with 4:1 aspect ratio', () => {
  const layout = makeLayout({
    rooms: [{ id: 'b1', type: 'bathroom', x: 0, y: 0, width: 3, height: 12 }], // 4:1
  });
  const v = runChecks(layout, ['RB-072']);
  const match = v.find(x => x.code === 'RB-072');
  assert(match !== undefined, 'expected RB-072 warning for 4:1 bathroom');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

// RB-073: KITCHEN_MIN_DEPTH
test('RB-073: no violation for kitchen 8 ft in longer dimension', () => {
  const layout = makeLayout({
    rooms: [{ id: 'k1', type: 'kitchen', x: 0, y: 0, width: 8, height: 10 }], // longer = 10
  });
  const v = runChecks(layout, ['RB-073']);
  assert(v.length === 0, 'expected no RB-073 for kitchen with 10 ft longer dimension');
});

test('RB-073: warning for kitchen with longer dimension under 8 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'k1', type: 'kitchen', x: 0, y: 0, width: 5, height: 6 }], // longer = 6
  });
  const v = runChecks(layout, ['RB-073']);
  const match = v.find(x => x.code === 'RB-073');
  assert(match !== undefined, 'expected RB-073 warning for kitchen with 6 ft longer dimension');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.value !== undefined && match!.value < 8, `expected value < 8, got ${match!.value}`);
});

// RB-074: LIVING_ROOM_ASPECT_RATIO
test('RB-074: no violation for living room with 2:1 aspect ratio', () => {
  const layout = makeLayout({
    rooms: [{ id: 'l1', type: 'living', x: 0, y: 0, width: 12, height: 24 }], // 2:1
  });
  const v = runChecks(layout, ['RB-074']);
  assert(v.length === 0, 'expected no RB-074 for 2:1 living room');
});

test('RB-074: warning for living room with 3:1 aspect ratio', () => {
  const layout = makeLayout({
    rooms: [{ id: 'l1', type: 'living', x: 0, y: 0, width: 8, height: 24 }], // 3:1
  });
  const v = runChecks(layout, ['RB-074']);
  const match = v.find(x => x.code === 'RB-074');
  assert(match !== undefined, 'expected RB-074 warning for 3:1 living room');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

test('RB-074: no violation for "living room" type with 2:1 ratio', () => {
  const layout = makeLayout({
    rooms: [{ id: 'l1', type: 'living room', x: 0, y: 0, width: 10, height: 20 }], // 2:1
  });
  const v = runChecks(layout, ['RB-074']);
  assert(v.length === 0, 'expected no RB-074 for 2:1 "living room" type');
});

// RB-075: GARAGE_MIN_DEPTH
test('RB-075: no violation for garage 20 ft deep', () => {
  const layout = makeLayout({
    rooms: [{ id: 'g1', type: 'garage', x: 0, y: 0, width: 10, height: 20 }], // longer = 20
  });
  const v = runChecks(layout, ['RB-075']);
  assert(v.length === 0, 'expected no RB-075 for 20 ft deep garage');
});

test('RB-075: warning for garage only 15 ft deep', () => {
  const layout = makeLayout({
    rooms: [{ id: 'g1', type: 'garage', x: 0, y: 0, width: 10, height: 15 }], // longer = 15
  });
  const v = runChecks(layout, ['RB-075']);
  const match = v.find(x => x.code === 'RB-075');
  assert(match !== undefined, 'expected RB-075 warning for 15 ft deep garage');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.value !== undefined && match!.value < 18, `expected value < 18, got ${match!.value}`);
});

// RB-076: STAIR_MIN_AREA
test('RB-076: no violation for stair room 40 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 's1', type: 'stair', x: 0, y: 0, width: 4, height: 10 }], // 40 sq ft
  });
  const v = runChecks(layout, ['RB-076']);
  assert(v.length === 0, 'expected no RB-076 for 40 sq ft stair');
});

test('RB-076: error for stair room under 40 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 's1', type: 'stair', x: 0, y: 0, width: 3.5, height: 8 }], // 28 sq ft
  });
  const v = runChecks(layout, ['RB-076']);
  const match = v.find(x => x.code === 'RB-076');
  assert(match !== undefined, 'expected RB-076 error for 28 sq ft stair');
  assert(match!.severity === 'error', `expected error, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

// RB-077: MAX_BEDROOMS_PER_BATH
test('RB-077: no violation for 4 bedrooms with 1 bathroom', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',  x: 0,  y: 0, width: 10, height: 10 },
      { id: 'b2', type: 'bedroom',  x: 10, y: 0, width: 10, height: 10 },
      { id: 'b3', type: 'bedroom',  x: 20, y: 0, width: 10, height: 10 },
      { id: 'b4', type: 'bedroom',  x: 30, y: 0, width: 10, height: 10 },
      { id: 'ba', type: 'bathroom', x: 0,  y: 10, width: 6, height: 8 },
    ],
  });
  const v = runChecks(layout, ['RB-077']);
  assert(v.length === 0, 'expected no RB-077 for 4:1 bed:bath ratio');
});

test('RB-077: warning for 5 bedrooms with 1 bathroom', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',  x: 0,  y: 0, width: 10, height: 10 },
      { id: 'b2', type: 'bedroom',  x: 10, y: 0, width: 10, height: 10 },
      { id: 'b3', type: 'bedroom',  x: 20, y: 0, width: 10, height: 10 },
      { id: 'b4', type: 'bedroom',  x: 30, y: 0, width: 10, height: 10 },
      { id: 'b5', type: 'bedroom',  x: 40, y: 0, width: 10, height: 10 },
      { id: 'ba', type: 'bathroom', x: 0,  y: 10, width: 6, height: 8 },
    ],
  });
  const v = runChecks(layout, ['RB-077']);
  const match = v.find(x => x.code === 'RB-077');
  assert(match !== undefined, 'expected RB-077 warning for 5:1 bed:bath ratio');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.value !== undefined && match!.value > 4, `expected value > 4, got ${match!.value}`);
});

// RB-078: OFFICE_ASPECT_RATIO
test('RB-078: no violation for office with 2:1 aspect ratio', () => {
  const layout = makeLayout({
    rooms: [{ id: 'o1', type: 'office', x: 0, y: 0, width: 8, height: 16 }], // 2:1
  });
  const v = runChecks(layout, ['RB-078']);
  assert(v.length === 0, 'expected no RB-078 for 2:1 office');
});

test('RB-078: warning for office with 3:1 aspect ratio', () => {
  const layout = makeLayout({
    rooms: [{ id: 'o1', type: 'office', x: 0, y: 0, width: 8, height: 24 }], // 3:1
  });
  const v = runChecks(layout, ['RB-078']);
  const match = v.find(x => x.code === 'RB-078');
  assert(match !== undefined, 'expected RB-078 warning for 3:1 office');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

// RB-079: ENTRY_ADJACENT_LIVING
test('RB-079: no violation when entry is adjacent to living room', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'e1', type: 'entry',  x: 0,  y: 0, width: 5, height: 5 },
      { id: 'l1', type: 'living', x: 5,  y: 0, width: 14, height: 14 },
    ],
  });
  const v = runChecks(layout, ['RB-079']);
  assert(v.length === 0, 'expected no RB-079 when entry touches living room');
});

test('RB-079: info when entry is not adjacent to living room', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'e1', type: 'entry',  x: 0,  y: 0, width: 5,  height: 5  },
      { id: 'l1', type: 'living', x: 20, y: 20, width: 14, height: 14 },
    ],
  });
  const v = runChecks(layout, ['RB-079']);
  const match = v.find(x => x.code === 'RB-079');
  assert(match !== undefined, 'expected RB-079 when entry is not adjacent to living room');
  assert(match!.severity === 'info', `expected info, got ${match!.severity}`);
  assert(match!.roomIds?.includes('e1'), 'expected entry id in roomIds');
});

// RB-080: DINING_MIN_DEPTH
test('RB-080: no violation for dining room 10 ft in longer dimension', () => {
  const layout = makeLayout({
    rooms: [{ id: 'd1', type: 'dining', x: 0, y: 0, width: 9, height: 12 }], // longer = 12
  });
  const v = runChecks(layout, ['RB-080']);
  assert(v.length === 0, 'expected no RB-080 for dining room with 12 ft longer dimension');
});

test('RB-080: warning for dining room with longer dimension under 10 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'd1', type: 'dining', x: 0, y: 0, width: 7, height: 9 }], // longer = 9
  });
  const v = runChecks(layout, ['RB-080']);
  const match = v.find(x => x.code === 'RB-080');
  assert(match !== undefined, 'expected RB-080 warning for dining room with 9 ft longer dimension');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.value !== undefined && match!.value < 10, `expected value < 10, got ${match!.value}`);
});

// ── Generator applyRepairAction pipeline sanity-check ────────────────────────
// Verifies: invalid plan → violation with suggestedFix → apply fix → improves.
// Import is dynamic so this file stays runnable without the generator package
// when the generator hasn't been built, but the test itself uses a static import.

import { applyRepairAction } from '../../generator/src/index.js';

console.log('\nGenerator applyRepairAction pipeline');

test('applyRepairAction: resizeRoom fix resolves RB-060 bedroom-too-narrow violation', () => {
  // Bedroom only 6 ft wide — triggers RB-060 (Bedroom Minimum Width).
  const narrow = makeLayout({
    rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 6, height: 14 }],
  });
  const before = runChecks(narrow, ['RB-060']);
  const violation = before.find(v => v.code === 'RB-060');
  assert(violation !== undefined, 'expected RB-060 violation before fix');
  const fix = violation!.suggestedFixes?.[0];
  assert(fix !== undefined, 'expected at least one suggestedFix');
  assert(fix!.type === 'resizeRoom', `expected resizeRoom fix, got ${fix!.type}`);

  // Apply the fix and re-check.
  const fixed = applyRepairAction(narrow, fix!);
  const after = runChecks(fixed, ['RB-060']);
  assert(after.find(v => v.code === 'RB-060') === undefined, 'expected RB-060 to be resolved after applying fix');
});

test('applyRepairAction: moveRoom fix does not mutate original layout', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [{ id: 'r1', type: 'laundry', x: 10, y: 10, width: 6, height: 6 }],
  });
  const origX = layout.rooms[0].x;
  const fix = { type: 'moveRoom' as const, roomId: 'r1', dx: -10, dy: 0 };
  const fixed = applyRepairAction(layout, fix);
  assert(layout.rooms[0].x === origX, 'original layout must not be mutated');
  assert(fixed.rooms[0].x === origX + fix.dx, 'fixed layout room should be moved');
});

test('applyRepairAction: swapRooms fix swaps x/y positions', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'a', type: 'kitchen', x: 0,  y: 0, width: 10, height: 10 },
      { id: 'b', type: 'dining',  x: 20, y: 0, width: 10, height: 10 },
    ],
  });
  const fix = { type: 'swapRooms' as const, roomIdA: 'a', roomIdB: 'b' };
  const fixed = applyRepairAction(layout, fix);
  const a = fixed.rooms.find(r => r.id === 'a')!;
  const b = fixed.rooms.find(r => r.id === 'b')!;
  assert(a.x === 20, `expected a.x=20 after swap, got ${a.x}`);
  assert(b.x === 0,  `expected b.x=0 after swap, got ${b.x}`);
});

// RB-081: LIVING_DINING_ADJACENT
test('RB-081: no violation when living and dining are adjacent', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'l1', type: 'living', x: 0,  y: 0, width: 15, height: 15 },
      { id: 'd1', type: 'dining', x: 15, y: 0, width: 12, height: 12 },
    ],
  });
  const v = runChecks(layout, ['RB-081']);
  assert(v.length === 0, 'expected no RB-081 when living and dining are adjacent');
});

test('RB-081: info when living and dining are not adjacent', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'l1', type: 'living', x: 0,  y: 0,  width: 15, height: 15 },
      { id: 'd1', type: 'dining', x: 30, y: 30, width: 12, height: 12 },
    ],
  });
  const v = runChecks(layout, ['RB-081']);
  const match = v.find(x => x.code === 'RB-081');
  assert(match !== undefined, 'expected RB-081 info when living and dining not adjacent');
  assert(match!.severity === 'info', `expected info, got ${match!.severity}`);
});

// RB-082: STAIR_ACCESSIBLE_FROM_CIRCULATION
test('RB-082: no violation when stair is adjacent to hall', () => {
  const layout = makeLayout({
    rooms: [
      { id: 's1', type: 'stair', x: 0, y: 0, width: 8, height: 10 },
      { id: 'h1', type: 'hall',  x: 8, y: 0, width: 5, height: 10 },
    ],
  });
  const v = runChecks(layout, ['RB-082']);
  assert(v.length === 0, 'expected no RB-082 when stair is adjacent to hall');
});

test('RB-082: warning when stair is not adjacent to any circulation space', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [
      { id: 's1', type: 'stair',   x: 0,  y: 0,  width: 8,  height: 10 },
      { id: 'b1', type: 'bedroom', x: 20, y: 20, width: 12, height: 12 },
    ],
  });
  const v = runChecks(layout, ['RB-082']);
  const match = v.find(x => x.code === 'RB-082');
  assert(match !== undefined, 'expected RB-082 warning when stair not adjacent to circulation');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
});

// RB-083: OFFICE_NOT_ADJACENT_LAUNDRY
test('RB-083: no violation when office is not adjacent to laundry', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [
      { id: 'o1', type: 'office',  x: 0,  y: 0,  width: 10, height: 10 },
      { id: 'l1', type: 'laundry', x: 30, y: 30, width: 6,  height: 6  },
    ],
  });
  const v = runChecks(layout, ['RB-083']);
  assert(v.length === 0, 'expected no RB-083 when office is not adjacent to laundry');
});

test('RB-083: warning when office is adjacent to laundry', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'o1', type: 'office',  x: 0,  y: 0, width: 10, height: 10 },
      { id: 'l1', type: 'laundry', x: 10, y: 0, width: 6,  height: 8  },
    ],
  });
  const v = runChecks(layout, ['RB-083']);
  const match = v.find(x => x.code === 'RB-083');
  assert(match !== undefined, 'expected RB-083 warning when office is adjacent to laundry');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'swapRooms'), 'expected swapRooms fix');
});

// RB-084: PANTRY_MIN_AREA
test('RB-084: no violation for pantry 15 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'p1', type: 'pantry', x: 0, y: 0, width: 3, height: 5 }], // 15 sq ft
  });
  const v = runChecks(layout, ['RB-084']);
  assert(v.length === 0, 'expected no RB-084 for 15 sq ft pantry');
});

test('RB-084: warning for pantry under 15 sq ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'p1', type: 'pantry', x: 0, y: 0, width: 2, height: 5 }], // 10 sq ft
  });
  const v = runChecks(layout, ['RB-084']);
  const match = v.find(x => x.code === 'RB-084');
  assert(match !== undefined, 'expected RB-084 warning for 10 sq ft pantry');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.value !== undefined && match!.value < 15, `expected value < 15, got ${match!.value}`);
});

// RB-085: BATHROOM_NOT_ADJACENT_LIVING
test('RB-085: no violation when bathroom is not adjacent to living', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [
      { id: 'ba', type: 'bathroom', x: 0,  y: 0,  width: 6,  height: 8  },
      { id: 'lr', type: 'living',   x: 30, y: 30, width: 15, height: 15 },
    ],
  });
  const v = runChecks(layout, ['RB-085']);
  assert(v.length === 0, 'expected no RB-085 when bathroom is not adjacent to living');
});

test('RB-085: warning when bathroom is adjacent to living room', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'ba', type: 'bathroom', x: 0,  y: 0, width: 6,  height: 8  },
      { id: 'lr', type: 'living',   x: 6,  y: 0, width: 15, height: 15 },
    ],
  });
  const v = runChecks(layout, ['RB-085']);
  const match = v.find(x => x.code === 'RB-085');
  assert(match !== undefined, 'expected RB-085 warning when bathroom is adjacent to living room');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
});

// RB-086: LIVING_ROOM_MIN_DEPTH
test('RB-086: no violation for living room with longer dim 14 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'l1', type: 'living', x: 0, y: 0, width: 14, height: 12 }],
  });
  const v = runChecks(layout, ['RB-086']);
  assert(v.length === 0, 'expected no RB-086 for living room with 14 ft longer dim');
});

test('RB-086: info for living room with longer dim under 14 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'l1', type: 'living', x: 0, y: 0, width: 12, height: 12 }],
  });
  const v = runChecks(layout, ['RB-086']);
  const match = v.find(x => x.code === 'RB-086');
  assert(match !== undefined, 'expected RB-086 info for living room with 12 ft max dim');
  assert(match!.severity === 'info', `expected info, got ${match!.severity}`);
  assert(match!.value !== undefined && match!.value < 14, `expected value < 14, got ${match!.value}`);
});

// RB-087: DINING_ROOM_ASPECT_RATIO
test('RB-087: no violation for dining room with 1.5:1 aspect ratio', () => {
  const layout = makeLayout({
    rooms: [{ id: 'd1', type: 'dining', x: 0, y: 0, width: 10, height: 15 }],
  });
  const v = runChecks(layout, ['RB-087']);
  assert(v.length === 0, 'expected no RB-087 for 1.5:1 dining room');
});

test('RB-087: warning for dining room with 3:1 aspect ratio', () => {
  const layout = makeLayout({
    rooms: [{ id: 'd1', type: 'dining', x: 0, y: 0, width: 5, height: 15 }],
  });
  const v = runChecks(layout, ['RB-087']);
  const match = v.find(x => x.code === 'RB-087');
  assert(match !== undefined, 'expected RB-087 warning for 3:1 dining room');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.suggestedFixes?.some(f => f.type === 'resizeRoom'), 'expected resizeRoom fix');
});

// RB-088: CLOSET_MIN_DEPTH
test('RB-088: no violation for closet 2 ft deep', () => {
  const layout = makeLayout({
    rooms: [{ id: 'c1', type: 'closet', x: 0, y: 0, width: 2, height: 5 }],
  });
  const v = runChecks(layout, ['RB-088']);
  assert(v.length === 0, 'expected no RB-088 for closet with 2 ft shorter dim');
});

test('RB-088: warning for closet shallower than 2 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'c1', type: 'closet', x: 0, y: 0, width: 1.5, height: 4 }],
  });
  const v = runChecks(layout, ['RB-088']);
  const match = v.find(x => x.code === 'RB-088');
  assert(match !== undefined, 'expected RB-088 warning for 1.5 ft deep closet');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.value !== undefined && match!.value < 2, `expected value < 2, got ${match!.value}`);
});

// RB-089: LAUNDRY_MIN_WIDTH
test('RB-089: no violation for laundry room 5 ft wide', () => {
  const layout = makeLayout({
    rooms: [{ id: 'lau1', type: 'laundry', x: 0, y: 0, width: 5, height: 8 }],
  });
  const v = runChecks(layout, ['RB-089']);
  assert(v.length === 0, 'expected no RB-089 for 5 ft wide laundry');
});

test('RB-089: warning for laundry room narrower than 5 ft', () => {
  const layout = makeLayout({
    rooms: [{ id: 'lau1', type: 'laundry', x: 0, y: 0, width: 4, height: 8 }],
  });
  const v = runChecks(layout, ['RB-089']);
  const match = v.find(x => x.code === 'RB-089');
  assert(match !== undefined, 'expected RB-089 warning for 4 ft wide laundry');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.value !== undefined && match!.value < 5, `expected value < 5, got ${match!.value}`);
});

// RB-090: GROSS_AREA_PER_BEDROOM
test('RB-090: no violation when gross area per bedroom >= 350 sq ft', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0,  width: 12, height: 12 }, // 144
      { id: 'b2', type: 'bedroom', x: 12, y: 0,  width: 12, height: 12 }, // 144
      { id: 'l1', type: 'living',  x: 0,  y: 12, width: 20, height: 20 }, // 400
      { id: 'k1', type: 'kitchen', x: 20, y: 12, width: 10, height: 15 }, // 150
    ], // total 838, 2 beds → 419 ≥ 350
  });
  const v = runChecks(layout, ['RB-090']);
  assert(v.length === 0, 'expected no RB-090 when gross area per bedroom >= 350');
});

test('RB-090: warning when gross area per bedroom is under 350 sq ft', () => {
  const layout = makeLayout({
    dimensions: { width: 60, depth: 60 },
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0,  y: 0,  width: 10, height: 10 }, // 100
      { id: 'b2', type: 'bedroom', x: 10, y: 0,  width: 10, height: 10 }, // 100
      { id: 'b3', type: 'bedroom', x: 20, y: 0,  width: 10, height: 10 }, // 100
      { id: 'l1', type: 'living',  x: 0,  y: 10, width: 15, height: 15 }, // 225
    ], // total 525, 3 beds → 175 < 350
  });
  const v = runChecks(layout, ['RB-090']);
  const match = v.find(x => x.code === 'RB-090');
  assert(match !== undefined, 'expected RB-090 warning when gross area per bedroom < 350');
  assert(match!.severity === 'warning', `expected warning, got ${match!.severity}`);
  assert(match!.value !== undefined && match!.value < 350, `expected value < 350, got ${match!.value}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
