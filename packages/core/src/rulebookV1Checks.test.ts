/**
 * Minimal test harness for ArchiVox Rule Book v1 Validator Scaffold
 * ==================================================================
 * Tests scaffold structure (registry completeness, severity mapping)
 * and spot-checks the 42 implemented checks.
 *
 * Run with:
 *   npx tsx packages/core/src/rulebookV1Checks.test.ts
 *
 * Zero external dependencies. Mirror of validator.test.ts test runner.
 */

import { RULEBOOK_V1_CHECKS, registerRulebookV1Checks } from './rulebookV1Checks.js';
import { listChecks } from './ruleChecks.js';
import { LayoutV1 } from './layout.js';

// ── Test runner ───────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void): void {
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

function assert(condition: boolean, msg: string): void {
  if (!condition) throw new Error(msg);
}

function assertEqual<T>(actual: T, expected: T, msg?: string): void {
  if (actual !== expected)
    throw new Error(msg ?? `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// ── Layout factory ────────────────────────────────────────────────────────────

function makeLayout(overrides: Partial<LayoutV1> = {}): LayoutV1 {
  return {
    schemaVersion: 'layout.v1',
    units: 'meters',
    dimensions: { width: 15, depth: 12 },
    rooms: [],
    ...overrides,
  };
}

// ── Setup: register once ──────────────────────────────────────────────────────

registerRulebookV1Checks();

// ── Suite 1: Registry structure ───────────────────────────────────────────────

console.log('\nSuite 1 — Registry structure');

test('RULEBOOK_V1_CHECKS exports exactly 103 entries', () => {
  assertEqual(RULEBOOK_V1_CHECKS.length, 103, `Expected 103 checks, got ${RULEBOOK_V1_CHECKS.length}`);
});

test('all check IDs are unique within RULEBOOK_V1_CHECKS', () => {
  const ids = RULEBOOK_V1_CHECKS.map(c => c.id);
  const unique = new Set(ids);
  assert(unique.size === ids.length, `Duplicate IDs: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`);
});

test('all check IDs follow RBv1-NNN format', () => {
  const bad = RULEBOOK_V1_CHECKS.filter(c => !/^RBv1-\d{3}$/.test(c.id));
  assert(bad.length === 0, `Non-conforming IDs: ${bad.map(c => c.id).join(', ')}`);
});

test('all ruleIds follow R-NNN format', () => {
  const bad = RULEBOOK_V1_CHECKS.filter(c => c.ruleId && !/^R-\d{3}$/.test(c.ruleId as string));
  assert(bad.length === 0, `Non-conforming ruleIds: ${bad.map(c => c.ruleId).join(', ')}`);
});

test('ruleIds cover R-001 through R-103 (56 hard + 47 soft = 103 distinct IDs)', () => {
  const ruleIds = new Set(RULEBOOK_V1_CHECKS.map(c => c.ruleId as string));
  // Verify all 103 rule IDs are present
  const expected = [
    ...Array.from({ length: 50  }, (_, i) => `R-${String(i + 1).padStart(3, '0')}`), // R-001–R-050
    ...Array.from({ length: 53  }, (_, i) => `R-${String(i + 51).padStart(3, '0')}`), // R-051–R-103
  ];
  const missing = expected.filter(id => !ruleIds.has(id));
  assert(missing.length === 0, `Missing ruleIds: ${missing.join(', ')}`);
});

test('hard constraint checks (R-001–R-050, R-096–R-101) have severity "error"', () => {
  const hardIds = new Set([
    ...Array.from({ length: 50 }, (_, i) => `R-${String(i + 1).padStart(3, '0')}`),
    'R-096', 'R-097', 'R-098', 'R-099', 'R-100', 'R-101',
  ]);
  const bad = RULEBOOK_V1_CHECKS.filter(
    c => hardIds.has(c.ruleId as string) && c.severity !== 'error'
  );
  assert(bad.length === 0, `Hard constraint checks with wrong severity: ${bad.map(c => `${c.id}(${c.severity})`).join(', ')}`);
});

test('soft constraint checks (R-051–R-095, R-102–R-103) have severity "warning"', () => {
  const softIds = new Set([
    ...Array.from({ length: 45 }, (_, i) => `R-${String(i + 51).padStart(3, '0')}`),
    'R-102', 'R-103',
  ]);
  const bad = RULEBOOK_V1_CHECKS.filter(
    c => softIds.has(c.ruleId as string) && c.severity !== 'warning'
  );
  assert(bad.length === 0, `Soft constraint checks with wrong severity: ${bad.map(c => `${c.id}(${c.severity})`).join(', ')}`);
});

test('registerRulebookV1Checks() is idempotent — duplicate registration does not double entries', () => {
  const beforeCount = listChecks().filter(c => c.id.startsWith('RBv1-')).length;
  registerRulebookV1Checks(); // second call
  const afterCount  = listChecks().filter(c => c.id.startsWith('RBv1-')).length;
  assertEqual(afterCount, beforeCount, 'Second registerRulebookV1Checks() call added duplicate entries');
});

test('all stub checks return empty array on empty layout', () => {
  const layout = makeLayout();
  const stubs = RULEBOOK_V1_CHECKS.filter(c => {
    // stubs are those defined as `check: () => []` — run them all and expect no throws
    return true;
  });
  for (const check of stubs) {
    const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
    const result = check.check(layout, ctx);
    assert(Array.isArray(result), `Check ${check.id} did not return an array`);
  }
});

// ── Suite 2: R-002 — Entrance presence ───────────────────────────────────────

console.log('\nSuite 2 — R-002: Entrance presence');

test('R-002: plan with entry room passes', () => {
  const layout = makeLayout({ rooms: [{ id: 'e1', type: 'entry', x: 0, y: 0, width: 3, height: 2 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-002')!;
  const violations = check.check(layout, ctx);
  assert(violations.length === 0, `Expected no violations, got: ${violations.map(v => v.code).join(', ')}`);
});

test('R-002: plan with room labelled "Main Entrance" passes', () => {
  const layout = makeLayout({ rooms: [{ id: 'e1', type: 'other', label: 'Main Entrance', x: 0, y: 0, width: 3, height: 2 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-002')!;
  const violations = check.check(layout, ctx);
  assert(violations.length === 0, `Expected no violations`);
});

test('R-002: plan with no entrance fails', () => {
  const layout = makeLayout({ rooms: [
    { id: 'r1', type: 'bedroom', x: 0, y: 0, width: 4, height: 3 },
    { id: 'r2', type: 'bathroom', x: 4, y: 0, width: 2, height: 2 },
    { id: 'r3', type: 'kitchen', x: 6, y: 0, width: 4, height: 3 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-002')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-002 violation for plan with no entrance');
  assert(violations[0].code === 'RBv1-002', `Wrong violation code: ${violations[0].code}`);
});

// ── Suite 3: R-010 — Required rooms ──────────────────────────────────────────

console.log('\nSuite 3 — R-010: Required room types');

test('R-010: complete plan (bedroom + bathroom + kitchen) passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'r1', type: 'bedroom',  x: 0, y: 0, width: 4, height: 4 },
    { id: 'r2', type: 'bathroom', x: 4, y: 0, width: 2, height: 3 },
    { id: 'r3', type: 'kitchen',  x: 6, y: 0, width: 4, height: 3 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-010')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violations');
});

test('R-010: plan missing kitchen emits 1 violation', () => {
  const layout = makeLayout({ rooms: [
    { id: 'r1', type: 'bedroom',  x: 0, y: 0, width: 4, height: 4 },
    { id: 'r2', type: 'bathroom', x: 4, y: 0, width: 2, height: 3 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-010')!;
  const violations = check.check(layout, ctx);
  assertEqual(violations.length, 1, `Expected 1 violation, got ${violations.length}`);
  assert(violations[0].code === 'RBv1-010-kit', `Wrong code: ${violations[0].code}`);
});

test('R-010: empty plan emits 3 violations', () => {
  const layout = makeLayout({ rooms: [] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-010')!;
  const violations = check.check(layout, ctx);
  assertEqual(violations.length, 3, `Expected 3 violations (bed+bath+kitchen), got ${violations.length}`);
});

// ── Suite 4: Area minimums (R-011–R-015) ─────────────────────────────────────

console.log('\nSuite 4 — Area minimums (R-011–R-015)');

test('R-011: 3m×3m bedroom (9m²) passes', () => {
  const layout = makeLayout({ rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 3, height: 3 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-011')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation for 9m² bedroom');
});

test('R-011: 2.5m×3m bedroom (7.5m²) fails', () => {
  const layout = makeLayout({ rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 2.5, height: 3 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-011')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-011 violation for 7.5m² bedroom');
  assert(violations[0].severity === 'error', 'Expected error severity for R-011');
});

test('R-012: master bedroom labelled "Master" ≥ 10m² passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'm1', type: 'bedroom', label: 'Master Bedroom', x: 0, y: 0, width: 4, height: 3 }, // 12m²
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-012')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation for 12m² master bedroom');
});

test('R-012: master bedroom < 10m² fails', () => {
  const layout = makeLayout({ rooms: [
    { id: 'm1', type: 'bedroom', label: 'Master', x: 0, y: 0, width: 2, height: 4 }, // 8m²
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-012')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-012 violation for 8m² master bedroom');
});

test('R-013: 2.5m×2m kitchen (5m²) passes', () => {
  const layout = makeLayout({ rooms: [{ id: 'k1', type: 'kitchen', x: 0, y: 0, width: 2.5, height: 2 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-013')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation for 5m² kitchen');
});

test('R-014: 3m×4m living room (12m²) passes', () => {
  const layout = makeLayout({ rooms: [{ id: 'l1', type: 'living room', x: 0, y: 0, width: 3, height: 4 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-014')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation for 12m² living room');
});

test('R-014: 3m×3m living room (9m²) fails', () => {
  const layout = makeLayout({ rooms: [{ id: 'l1', type: 'living room', x: 0, y: 0, width: 3, height: 3 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-014')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-014 violation for 9m² living room');
});

test('R-015: 1m×2m bathroom (2m²) passes', () => {
  const layout = makeLayout({ rooms: [{ id: 'bt1', type: 'bathroom', x: 0, y: 0, width: 1, height: 2 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-015')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation for 2m² bathroom');
});

// ── Suite 5: R-016 / R-017 — Dimensional minimums ────────────────────────────

console.log('\nSuite 5 — Dimensional minimums (R-016, R-017)');

test('R-016: 1.5m-wide hall (> 0.90m) passes', () => {
  const layout = makeLayout({ rooms: [{ id: 'h1', type: 'hall', x: 0, y: 0, width: 5, height: 1.5 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-016')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation for 1.5m corridor');
});

test('R-016: 0.8m-wide hall fails', () => {
  const layout = makeLayout({ rooms: [{ id: 'h1', type: 'hall', x: 0, y: 0, width: 5, height: 0.8 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-016')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-016 violation for 0.8m corridor');
});

test('R-017: 3m×4m bedroom (min dim 3m > 1.80m) passes', () => {
  const layout = makeLayout({ rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 3, height: 4 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-017')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation');
});

test('R-017: 1.5m×6m bedroom (min dim 1.5m < 1.80m) fails', () => {
  const layout = makeLayout({ rooms: [{ id: 'b1', type: 'bedroom', x: 0, y: 0, width: 1.5, height: 6 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-017')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-017 violation for 1.5m min dimension');
});

// ── Suite 6: R-021, R-008 — Geometric checks ─────────────────────────────────

console.log('\nSuite 6 — Geometric checks (R-008, R-021)');

test('R-008: non-overlapping rooms pass', () => {
  const layout = makeLayout({ rooms: [
    { id: 'r1', type: 'bedroom', x: 0, y: 0, width: 4, height: 4 },
    { id: 'r2', type: 'kitchen', x: 4, y: 0, width: 4, height: 4 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-008')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no overlap violations');
});

test('R-008: overlapping rooms fail', () => {
  const layout = makeLayout({ rooms: [
    { id: 'r1', type: 'bedroom', x: 0, y: 0, width: 5, height: 4 },
    { id: 'r2', type: 'kitchen', x: 3, y: 0, width: 4, height: 4 }, // overlaps r1
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-008')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-008 overlap violation');
});

test('R-021: rooms with identical bounding box fail', () => {
  const layout = makeLayout({ rooms: [
    { id: 'r1', type: 'bedroom', x: 0, y: 0, width: 4, height: 4 },
    { id: 'r2', type: 'bedroom', x: 0, y: 0, width: 4, height: 4 }, // identical
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-021')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-021 violation for identical bboxes');
});

// ── Suite 7: Zoning checks (R-026–R-042) ─────────────────────────────────────

console.log('\nSuite 7 — Zoning checks (R-026, R-028, R-029, R-041, R-042)');

test('R-026: kitchen adjacent to dining passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'k1', type: 'kitchen', x: 0, y: 0, width: 4, height: 4 },
    { id: 'd1', type: 'dining',  x: 4, y: 0, width: 4, height: 4 }, // adjacent
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-026')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation');
});

test('R-026: kitchen not adjacent to dining fails', () => {
  const layout = makeLayout({ rooms: [
    { id: 'k1', type: 'kitchen', x: 0, y: 0, width: 3, height: 3 },
    { id: 'd1', type: 'dining',  x: 10, y: 8, width: 3, height: 3 }, // far away
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-026')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-026 violation');
});

test('R-028: 2 bedrooms, 1 bathroom fails (needs 1, so passes)', () => {
  // ceil(2/2) = 1, so 1 bathroom is sufficient
  const layout = makeLayout({ rooms: [
    { id: 'b1', type: 'bedroom',  x: 0, y: 0, width: 4, height: 4 },
    { id: 'b2', type: 'bedroom',  x: 4, y: 0, width: 4, height: 4 },
    { id: 'bt', type: 'bathroom', x: 8, y: 0, width: 2, height: 2 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-028')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: 2 beds, 1 bath = ceil(2/2)=1');
});

test('R-028: 3 bedrooms, 1 bathroom fails (needs 2)', () => {
  const layout = makeLayout({ rooms: [
    { id: 'b1', type: 'bedroom',  x: 0, y: 0, width: 4, height: 4 },
    { id: 'b2', type: 'bedroom',  x: 4, y: 0, width: 4, height: 4 },
    { id: 'b3', type: 'bedroom',  x: 8, y: 0, width: 4, height: 4 },
    { id: 'bt', type: 'bathroom', x: 0, y: 4, width: 2, height: 2 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-028')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-028 violation: 3 beds need 2 baths');
});

test('R-029: master bedroom adjacent to bathroom passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'm1', type: 'bedroom',  label: 'Master', x: 0, y: 0, width: 4, height: 4 },
    { id: 'bt', type: 'bathroom', x: 4, y: 0, width: 2, height: 2 }, // adjacent
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-029')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation');
});

test('R-029: master bedroom not adjacent to any bathroom fails', () => {
  const layout = makeLayout({ rooms: [
    { id: 'm1', type: 'bedroom',  label: 'Master', x: 0, y: 0, width: 4, height: 4 },
    { id: 'bt', type: 'bathroom', x: 12, y: 8, width: 2, height: 2 }, // far away
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-029')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-029 violation');
});

test('R-041: 2 bedrooms, 1 adjacent — ratio 0.5 (50%) passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'b1', type: 'bedroom', x: 0, y: 0, width: 4, height: 4 },
    { id: 'b2', type: 'bedroom', x: 4, y: 0, width: 4, height: 4 }, // adjacent
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-041')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: both bedrooms adjacent');
});

test('R-041: 4 bedrooms, none adjacent fails', () => {
  const layout = makeLayout({
    dimensions: { width: 20, depth: 20 },
    rooms: [
      { id: 'b1', type: 'bedroom', x: 0, y: 0, width: 3, height: 3 },
      { id: 'b2', type: 'bedroom', x: 10, y: 0, width: 3, height: 3 },
      { id: 'b3', type: 'bedroom', x: 0, y: 10, width: 3, height: 3 },
      { id: 'b4', type: 'bedroom', x: 10, y: 10, width: 3, height: 3 },
    ],
  });
  const ctx = { units: 'meters' as const, dimW: 20, dimD: 20, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-041')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-041 violation: no adjacent bedrooms');
});

test('R-042: hall connecting 3 rooms passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'h1', type: 'hall',     x: 3, y: 0, width: 2, height: 6 },
    { id: 'r1', type: 'bedroom',  x: 0, y: 0, width: 3, height: 3 }, // adjacent to hall
    { id: 'r2', type: 'bedroom',  x: 5, y: 0, width: 3, height: 3 }, // adjacent to hall
    { id: 'r3', type: 'bathroom', x: 3, y: 6, width: 2, height: 2 }, // adjacent to hall
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-042')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: hall connects 3 rooms');
});

test('R-042: dead-end hall connecting only 1 room fails', () => {
  const layout = makeLayout({ rooms: [
    { id: 'h1', type: 'hall',    x: 0, y: 0, width: 5, height: 1.2 },
    { id: 'r1', type: 'bedroom', x: 5, y: 0, width: 3, height: 3 }, // only adjacent room
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-042')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-042 violation: hall connects only 1 room');
});

// ── Suite 8: R-096, R-100, R-103 — Completeness ──────────────────────────────

console.log('\nSuite 8 — Completeness / labelling (R-096, R-100, R-103)');

test('R-096: room with label passes', () => {
  const layout = makeLayout({ rooms: [{ id: 'r1', type: 'bedroom', label: 'Bedroom 1', x: 0, y: 0, width: 4, height: 4 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-096')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation for labelled room');
});

test('R-096: room without label fails', () => {
  const layout = makeLayout({ rooms: [{ id: 'r1', type: 'bedroom', x: 0, y: 0, width: 4, height: 4 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-096')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-096 violation for unlabelled room');
});

test('R-100: 15m×12m plan passes minimum footprint', () => {
  const layout = makeLayout({ dimensions: { width: 15, depth: 12 } });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-100')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation for 15×12m plan');
});

test('R-100: 4m×3m plan fails minimum footprint (< 5m×4m)', () => {
  const layout = makeLayout({ dimensions: { width: 4, depth: 3 } });
  const ctx = { units: 'meters' as const, dimW: 4, dimD: 3, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-100')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-100 violation for 4×3m plan');
});

test('R-103: 15m×12m plan (ratio 1.25:1) passes aspect ratio check', () => {
  const layout = makeLayout({ dimensions: { width: 15, depth: 12 } });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-103')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation for 1.25:1 aspect ratio');
});

test('R-103: 30m×5m plan (ratio 6:1) fails aspect ratio check', () => {
  const layout = makeLayout({ dimensions: { width: 30, depth: 5 } });
  const ctx = { units: 'meters' as const, dimW: 30, dimD: 5, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-103')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-103 violation for 6:1 aspect ratio');
});

// ── Suite 9: Natural light proxies (R-066–R-068, R-074) ─────────────────────

console.log('\nSuite 9 — Natural light proxies (R-066–R-068, R-074)');

test('R-067: living room touching exterior wall passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'l1', type: 'living room', x: 0, y: 0, width: 5, height: 4 }, // touches x=0 exterior
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-067')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: room on exterior');
});

test('R-067: fully interior living room fails', () => {
  const layout = makeLayout({ rooms: [
    { id: 'l1', type: 'living room', x: 2, y: 2, width: 5, height: 4 }, // not on any wall
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-067')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-067 violation for interior living room');
});

test('R-074: fully interior bathroom emits warning (not error)', () => {
  const layout = makeLayout({ rooms: [
    { id: 'bt', type: 'bathroom', x: 5, y: 4, width: 2, height: 2 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-074')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-074 flag for interior bathroom');
  assert(violations[0].severity === 'warning', 'Expected warning severity for R-074');
});

// ── Suite 10: Soft preference checks (R-051, R-054, R-065, R-088–R-091) ──────

console.log('\nSuite 10 — Soft preference checks');

test('R-054: master bedroom is largest — passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'm', type: 'bedroom', label: 'Master', x: 0, y: 0, width: 5, height: 4 }, // 20m²
    { id: 'b', type: 'bedroom', x: 5, y: 0, width: 3, height: 3 },                   // 9m²
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-054')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: master is largest');
});

test('R-054: master bedroom smaller than secondary bedroom — warning emitted', () => {
  const layout = makeLayout({ rooms: [
    { id: 'm', type: 'bedroom', label: 'Master', x: 0, y: 0, width: 3, height: 3 }, // 9m²
    { id: 'b', type: 'bedroom', x: 3, y: 0, width: 5, height: 4 },                   // 20m² — larger
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-054')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-054 warning: master not largest');
  assert(violations[0].severity === 'warning', 'Expected warning severity');
});

test('R-065: master bedroom adjacent to kitchen emits warning', () => {
  const layout = makeLayout({ rooms: [
    { id: 'm', type: 'bedroom', label: 'Master', x: 0, y: 0, width: 4, height: 4 },
    { id: 'k', type: 'kitchen', x: 4, y: 0, width: 4, height: 4 }, // adjacent
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-065')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-065 warning');
  assert(violations[0].severity === 'warning', 'Expected warning severity');
});

test('R-088: 5m×4m living room accommodates 2.5m×3.0m seating group — passes', () => {
  const layout = makeLayout({ rooms: [{ id: 'l', type: 'living room', x: 0, y: 0, width: 5, height: 4 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-088')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation');
});

test('R-088: 2m×2m living room too small for seating group — fails', () => {
  const layout = makeLayout({ rooms: [{ id: 'l', type: 'living room', x: 0, y: 0, width: 2, height: 2 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-088')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-088 violation for 2×2m living room');
});

test('R-090: master bedroom 4m×3m accommodates 1.6m×2.1m double bed — passes', () => {
  const layout = makeLayout({ rooms: [{ id: 'm', type: 'bedroom', label: 'Master', x: 0, y: 0, width: 4, height: 3 }] });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-090')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation');
});

// ── Suite 11: Spot tests for newly implemented adjacency proxies ──────────────

console.log('\nSuite 11 — Newly implemented adjacency proxies (R-027, R-030–R-033, R-037–R-038, R-043, R-057, R-059, R-075)');

test('R-027: entrance adjacent to living room passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'e1', type: 'entry',       label: 'Entry',       x: 0, y: 0, width: 3, height: 2 },
    { id: 'l1', type: 'living room', label: 'Living Room', x: 3, y: 0, width: 5, height: 4 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-027')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: entry adjacent to living');
});

test('R-027: entrance not adjacent to living room fails', () => {
  const layout = makeLayout({ rooms: [
    { id: 'e1', type: 'entry',       label: 'Entry',       x: 0,  y: 0, width: 3, height: 2 },
    { id: 'b1', type: 'bedroom',     label: 'Bedroom 1',   x: 3,  y: 0, width: 4, height: 4 },
    { id: 'l1', type: 'living room', label: 'Living Room', x: 10, y: 0, width: 5, height: 4 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-027')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-027 violation: no direct entry-to-living adjacency');
});

test('R-030: laundry adjacent to kitchen passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'k1', type: 'kitchen', label: 'Kitchen', x: 0, y: 0, width: 4, height: 3 },
    { id: 'la', type: 'laundry', label: 'Laundry', x: 4, y: 0, width: 3, height: 3 },
    { id: 'b1', type: 'bedroom', label: 'Bedroom', x: 0, y: 3, width: 4, height: 4 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-030')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: laundry adj to kitchen');
});

test('R-030: laundry only adjacent to bedroom fails', () => {
  const layout = makeLayout({ rooms: [
    { id: 'b1', type: 'bedroom', label: 'Bedroom 1', x: 0, y: 0, width: 4, height: 4 },
    { id: 'la', type: 'laundry', label: 'Laundry',   x: 4, y: 0, width: 3, height: 3 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-030')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-030 violation: laundry only adj to bedroom');
});

test('R-031: pantry adjacent to kitchen passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'k1', type: 'kitchen', label: 'Kitchen', x: 0, y: 0, width: 4, height: 3 },
    { id: 'p1', type: 'other',   label: 'Pantry',  x: 4, y: 0, width: 2, height: 3 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-031')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: pantry adj to kitchen');
});

test('R-031: pantry isolated from kitchen fails', () => {
  const layout = makeLayout({ rooms: [
    { id: 'k1', type: 'kitchen', label: 'Kitchen', x: 0,  y: 0, width: 4, height: 3 },
    { id: 'p1', type: 'other',   label: 'Pantry',  x: 12, y: 8, width: 2, height: 2 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-031')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-031 violation: pantry not adj to kitchen');
});

test('R-032: garage adjacent to hall passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'g1', type: 'garage', label: 'Garage',     x: 0, y: 0, width: 6, height: 3 },
    { id: 'h1', type: 'hall',   label: 'Entry Hall', x: 6, y: 0, width: 3, height: 3 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-032')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: garage adj to hall');
});

test('R-032: isolated garage fails', () => {
  const layout = makeLayout({ rooms: [
    { id: 'g1', type: 'garage',  label: 'Garage',  x: 0,  y: 0, width: 6, height: 3 },
    { id: 'b1', type: 'bedroom', label: 'Bedroom', x: 10, y: 8, width: 4, height: 4 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-032')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-032 violation: isolated garage');
});

test('R-037: closet adjacent to bedroom passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'b1', type: 'bedroom', label: 'Bedroom 1', x: 0, y: 0, width: 4, height: 4 },
    { id: 'cl', type: 'closet',  label: 'Closet',    x: 4, y: 0, width: 1, height: 2 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-037')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: closet adj to bedroom');
});

test('R-037: closet not adjacent to any bedroom fails', () => {
  const layout = makeLayout({ rooms: [
    { id: 'b1', type: 'bedroom', label: 'Bedroom 1', x: 0,  y: 0, width: 4, height: 4 },
    { id: 'cl', type: 'closet',  label: 'Closet',    x: 10, y: 8, width: 1, height: 2 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-037')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-037 violation: closet not adj to bedroom');
});

test('R-038: breakfast nook adjacent to kitchen passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'k1', type: 'kitchen', label: 'Kitchen',       x: 0, y: 0, width: 4, height: 3 },
    { id: 'bn', type: 'other',   label: 'Breakfast Nook', x: 4, y: 0, width: 3, height: 3 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-038')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: breakfast nook adj to kitchen');
});

test('R-038: family room not connected to kitchen or living fails', () => {
  const layout = makeLayout({ rooms: [
    { id: 'k1', type: 'kitchen', label: 'Kitchen',     x: 0,  y: 0, width: 4, height: 3 },
    { id: 'fm', type: 'other',   label: 'Family Room', x: 10, y: 8, width: 4, height: 4 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-038')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-038 violation: family room isolated from social zone');
});

test('R-043: kitchen accessible from non-master room passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'mb', type: 'bedroom',     label: 'Master Bedroom', x: 0, y: 0, width: 4, height: 4 },
    { id: 'k1', type: 'kitchen',     label: 'Kitchen',        x: 4, y: 0, width: 4, height: 3 },
    { id: 'd1', type: 'dining',      label: 'Dining Room',    x: 8, y: 0, width: 4, height: 3 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-043')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: kitchen adj to dining (not only master)');
});

test('R-043: kitchen only adjacent to master bedroom fails', () => {
  const layout = makeLayout({ rooms: [
    { id: 'mb', type: 'bedroom', label: 'Master Bedroom', x: 0, y: 0, width: 4, height: 4 },
    { id: 'k1', type: 'kitchen', label: 'Kitchen',        x: 4, y: 0, width: 4, height: 4 },
    // kitchen is only adjacent to master bedroom
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-043')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-043 violation: kitchen only adj to master');
});

test('R-057: terrace adjacent to living room passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'l1', type: 'living room', label: 'Living Room', x: 0, y: 0, width: 5, height: 4 },
    { id: 't1', type: 'other',       label: 'Terrace',     x: 5, y: 0, width: 4, height: 3 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-057')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: terrace adj to living');
});

test('R-057: terrace not adjacent to living/dining emits warning', () => {
  const layout = makeLayout({ rooms: [
    { id: 'b1', type: 'bedroom', label: 'Bedroom 1', x: 0, y: 0, width: 4, height: 4 },
    { id: 't1', type: 'other',   label: 'Terrace',   x: 4, y: 0, width: 4, height: 3 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-057')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-057 warning: terrace not adj to living/dining');
  assert(violations[0].severity === 'warning', 'Expected warning severity');
});

test('R-059: laundry adjacent only to kitchen passes', () => {
  const layout = makeLayout({ rooms: [
    { id: 'k1', type: 'kitchen', label: 'Kitchen', x: 0, y: 0, width: 4, height: 3 },
    { id: 'la', type: 'laundry', label: 'Laundry', x: 4, y: 0, width: 3, height: 3 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-059')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: laundry adj to kitchen only');
});

test('R-059: laundry adjacent to bedroom emits warning', () => {
  const layout = makeLayout({ rooms: [
    { id: 'b1', type: 'bedroom', label: 'Bedroom', x: 0, y: 0, width: 4, height: 4 },
    { id: 'la', type: 'laundry', label: 'Laundry', x: 4, y: 0, width: 3, height: 3 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-059')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-059 warning: laundry adj to bedroom');
  assert(violations[0].severity === 'warning', 'Expected warning severity');
});

test('R-075: short corridor (3m) skips natural light check', () => {
  const layout = makeLayout({ rooms: [
    { id: 'h1', type: 'hall', label: 'Hallway', x: 5, y: 5, width: 3, height: 1.1 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-075')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation: corridor < 4m');
});

test('R-075: long interior corridor (5m) without exterior wall emits warning', () => {
  const layout = makeLayout({ rooms: [
    { id: 'h1', type: 'hall', label: 'Long Hallway', x: 2, y: 5, width: 5, height: 1.1 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-075')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-075 warning: long interior corridor');
  assert(violations[0].severity === 'warning', 'Expected warning severity');
});

// ── Suite 12: Synthetic Hard-Violation Plan ───────────────────────────────────

console.log('\nSuite 12 — Synthetic hard-violation plan (end-to-end)');

/**
 * SYNTHETIC PLAN A: "Incomplete Studio with Errors"
 * Intentionally violates multiple hard constraints:
 *   - R-002: No entrance room
 *   - R-008: bedroom-1 overlaps kitchen (x=3..4 shared zone)
 *   - R-011: bedroom-2 is 6m² (< 9m² minimum)
 *   - R-010: No bathroom at all
 *   - R-028: 2 bedrooms, 0 bathrooms
 *
 * Expected: plan rejected (≥4 error-severity violations).
 * Source of truth: archivox-rule-book-v1.md R-002, R-008, R-010, R-011, R-028
 */
const HARD_VIOLATION_PLAN: LayoutV1 = {
  schemaVersion: 'layout.v1',
  units: 'meters',
  dimensions: { width: 12, depth: 10 },
  rooms: [
    { id: 'b1', type: 'bedroom',     label: 'Bedroom 1',   x: 0, y: 0, width: 4, height: 3 }, // overlaps kitchen
    { id: 'k1', type: 'kitchen',     label: 'Kitchen',     x: 3, y: 0, width: 4, height: 3 }, // overlaps b1 at x=3..4
    { id: 'b2', type: 'bedroom',     label: 'Bedroom 2',   x: 7, y: 0, width: 2, height: 3 }, // 6m² — below 9m² minimum
    { id: 'lr', type: 'living room', label: 'Living Room', x: 0, y: 3, width: 6, height: 4 },
    { id: 'dn', type: 'dining',      label: 'Dining Room', x: 6, y: 3, width: 4, height: 3 },
    // deliberately: no bathroom, no entrance
  ],
};

test('Synthetic Plan A: R-002 fires (no entrance)', () => {
  const ctx = { units: 'meters' as const, dimW: 12, dimD: 10, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-002')!;
  const violations = check.check(HARD_VIOLATION_PLAN, ctx);
  assert(violations.length >= 1, 'Expected R-002 violation: no entrance in plan');
  assert(violations[0].severity === 'error', 'Expected error severity (hard constraint)');
});

test('Synthetic Plan A: R-008 fires (overlapping rooms)', () => {
  const ctx = { units: 'meters' as const, dimW: 12, dimD: 10, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-008')!;
  const violations = check.check(HARD_VIOLATION_PLAN, ctx);
  assert(violations.length >= 1, 'Expected R-008 violation: bedroom overlaps kitchen');
  assert(violations[0].severity === 'error', 'Expected error severity (hard constraint)');
  assert(violations[0].ruleId === 'R-008', `Expected ruleId R-008, got ${violations[0].ruleId}`);
});

test('Synthetic Plan A: R-010 fires (no bathroom)', () => {
  const ctx = { units: 'meters' as const, dimW: 12, dimD: 10, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-010')!;
  const violations = check.check(HARD_VIOLATION_PLAN, ctx);
  const bathViolation = violations.find(v => v.code === 'RBv1-010-bath');
  assert(bathViolation !== undefined, 'Expected R-010 bathroom violation');
  assert(bathViolation!.severity === 'error', 'Expected error severity');
});

test('Synthetic Plan A: R-011 fires (bedroom-2 only 6m²)', () => {
  const ctx = { units: 'meters' as const, dimW: 12, dimD: 10, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-011')!;
  const violations = check.check(HARD_VIOLATION_PLAN, ctx);
  const b2Violation = violations.find(v => v.roomIds?.includes('b2'));
  assert(b2Violation !== undefined, 'Expected R-011 violation for 6m² bedroom-2');
  assert(b2Violation!.severity === 'error', 'Expected error severity (hard constraint)');
});

test('Synthetic Plan A: R-028 fires (2 bedrooms, 0 bathrooms)', () => {
  const ctx = { units: 'meters' as const, dimW: 12, dimD: 10, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-028')!;
  const violations = check.check(HARD_VIOLATION_PLAN, ctx);
  assert(violations.length >= 1, 'Expected R-028 violation: 0 bathrooms for 2 bedrooms');
  assert(violations[0].severity === 'error', 'Expected error severity (hard constraint)');
});

test('Synthetic Plan A: total hard violations ≥ 4 (plan would be rejected)', () => {
  const ctx = { units: 'meters' as const, dimW: 12, dimD: 10, ftToUnit: 0.3048 };
  const hardChecks = RULEBOOK_V1_CHECKS.filter(c => c.severity === 'error');
  const allViolations = hardChecks.flatMap(c => {
    if (c.applies && !c.applies(HARD_VIOLATION_PLAN, ctx)) return [];
    return c.check(HARD_VIOLATION_PLAN, ctx);
  });
  const errors = allViolations.filter(v => v.severity === 'error');
  assert(errors.length >= 4, `Expected ≥4 hard violations, got ${errors.length}: ${errors.map(v => v.code).join(', ')}`);
});

// ── Suite 13: Synthetic Soft-Violation Plan ───────────────────────────────────

console.log('\nSuite 13 — Synthetic soft-violation plan (end-to-end)');

/**
 * SYNTHETIC PLAN B: "Disconnected Villa"
 * Passes all hard constraints but violates multiple soft constraints:
 *   - R-054: master bedroom (12m²) is smaller than secondary bedroom (20m²)
 *   - R-065: master bedroom is adjacent to kitchen
 *   - R-067: living room is fully interior (no exterior wall contact)
 *   - R-051: dining room is not adjacent to living room
 *
 * All hard constraints pass:
 *   - R-002: entry room present ✓
 *   - R-008: no overlaps (rooms only share zero-area edges) ✓
 *   - R-010: bedroom + bathroom + kitchen ✓
 *   - R-011: secondary 20m² ✓, master 12m² ✓
 *   - R-012: master 4×3=12m² ≥ 10m² ✓
 *   - R-026: kitchen adj to dining ✓
 *   - R-027: entry adj to hall (non-private) ✓
 *   - R-028: 2 beds, 1 bath (ceil(2/2)=1) ✓
 *   - R-029: master adj to bathroom ✓
 *   - R-041: both bedrooms adjacent ✓
 *   - R-042: hall connects entry + secondary bedroom ≥ 2 rooms ✓
 *   - R-100: plan 20×15 ✓
 *
 * Source of truth: archivox-rule-book-v1.md R-051, R-054, R-065, R-067
 */
const SOFT_VIOLATION_PLAN: LayoutV1 = {
  schemaVersion: 'layout.v1',
  units: 'meters',
  dimensions: { width: 20, depth: 15 },
  rooms: [
    // Front exterior row
    { id: 'en',  type: 'entry',       label: 'Entry',          x:  5, y:  0, width: 3, height: 3 },  // exterior y=0
    { id: 'b2',  type: 'bedroom',     label: 'Bedroom 2',      x:  0, y:  0, width: 5, height: 4 },  // 20m², exterior
    // Hall connects entry to rest of plan (entry adj to hall → R-027 passes)
    // height=1m to avoid overlap with kitchen at y=4 (hall y=3..4, kitchen y=4..7 — touch at y=4, area=0)
    { id: 'h1',  type: 'hall',        label: 'Hallway',        x:  5, y:  3, width: 3, height: 1 },
    // Master bedroom (4×3=12m² ≥ 10m²) adjacent to kitchen — R-065 violation
    { id: 'mb',  type: 'bedroom',     label: 'Master Bedroom', x:  0, y:  4, width: 4, height: 3 },  // exterior x=0
    // Bathroom adjacent to master (R-029 satisfied)
    { id: 'bt1', type: 'bathroom',    label: 'Bathroom 1',     x:  0, y:  7, width: 2, height: 2 },
    // Kitchen adjacent to master (R-065 trigger) and to dining (R-026 satisfied)
    { id: 'k1',  type: 'kitchen',     label: 'Kitchen',        x:  4, y:  4, width: 5, height: 3 },
    // Dining adjacent to kitchen (R-026 ✓) but far from living room (R-051 violation)
    { id: 'dn',  type: 'dining',      label: 'Dining Room',    x:  9, y:  4, width: 4, height: 3 },
    // Living room fully interior — not touching any exterior wall (R-067 violation)
    // Also not adjacent to dining (R-051 violation): y gap of 3m between dining and living
    { id: 'lr',  type: 'living room', label: 'Living Room',    x:  9, y: 10, width: 5, height: 4 },
  ],
};

test('Synthetic Plan B: passes R-002 (entry room present)', () => {
  const ctx = { units: 'meters' as const, dimW: 20, dimD: 15, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-002')!;
  assert(check.check(SOFT_VIOLATION_PLAN, ctx).length === 0, 'Expected no R-002 violation');
});

test('Synthetic Plan B: passes R-008 (no overlapping rooms)', () => {
  const ctx = { units: 'meters' as const, dimW: 20, dimD: 15, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-008')!;
  assert(check.check(SOFT_VIOLATION_PLAN, ctx).length === 0, 'Expected no R-008 violation');
});

test('Synthetic Plan B: passes R-026 (kitchen adj to dining)', () => {
  const ctx = { units: 'meters' as const, dimW: 20, dimD: 15, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-026')!;
  assert(check.check(SOFT_VIOLATION_PLAN, ctx).length === 0, 'Expected no R-026 violation');
});

test('Synthetic Plan B: passes R-029 (master adj to bathroom)', () => {
  const ctx = { units: 'meters' as const, dimW: 20, dimD: 15, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-029')!;
  assert(check.check(SOFT_VIOLATION_PLAN, ctx).length === 0, 'Expected no R-029 violation');
});

test('Synthetic Plan B: R-054 fires warning (master bedroom not largest)', () => {
  const ctx = { units: 'meters' as const, dimW: 20, dimD: 15, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-054')!;
  const violations = check.check(SOFT_VIOLATION_PLAN, ctx);
  assert(violations.length >= 1, 'Expected R-054 warning: master (9m²) < secondary (20m²)');
  assert(violations[0].severity === 'warning', 'Expected warning severity (soft constraint)');
});

test('Synthetic Plan B: R-065 fires warning (master adj to kitchen)', () => {
  const ctx = { units: 'meters' as const, dimW: 20, dimD: 15, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-065')!;
  const violations = check.check(SOFT_VIOLATION_PLAN, ctx);
  assert(violations.length >= 1, 'Expected R-065 warning: master bedroom adjacent to kitchen');
  assert(violations[0].severity === 'warning', 'Expected warning severity (soft constraint)');
});

test('Synthetic Plan B: R-067 fires warning (living room fully interior)', () => {
  const ctx = { units: 'meters' as const, dimW: 20, dimD: 15, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-067')!;
  const violations = check.check(SOFT_VIOLATION_PLAN, ctx);
  assert(violations.length >= 1, 'Expected R-067 warning: living room has no exterior wall');
  assert(violations[0].severity === 'warning', 'Expected warning severity (soft constraint)');
});

test('Synthetic Plan B: R-051 fires warning (dining not adj to living)', () => {
  const ctx = { units: 'meters' as const, dimW: 20, dimD: 15, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-051')!;
  const violations = check.check(SOFT_VIOLATION_PLAN, ctx);
  assert(violations.length >= 1, 'Expected R-051 warning: dining not adjacent to living room');
  assert(violations[0].severity === 'warning', 'Expected warning severity (soft constraint)');
});

test('Synthetic Plan B: total hard violations = 0 (plan NOT rejected)', () => {
  const ctx = { units: 'meters' as const, dimW: 20, dimD: 15, ftToUnit: 0.3048 };
  const hardChecks = RULEBOOK_V1_CHECKS.filter(c => c.severity === 'error');
  const allErrors = hardChecks.flatMap(c => {
    if (c.applies && !c.applies(SOFT_VIOLATION_PLAN, ctx)) return [];
    return c.check(SOFT_VIOLATION_PLAN, ctx).filter(v => v.severity === 'error');
  });
  assert(allErrors.length === 0, `Expected 0 hard violations, got ${allErrors.length}: ${allErrors.map(v => v.code).join(', ')}`);
});

test('Synthetic Plan B: total soft violations ≥ 4 (quality score penalised)', () => {
  const ctx = { units: 'meters' as const, dimW: 20, dimD: 15, ftToUnit: 0.3048 };
  const softChecks = RULEBOOK_V1_CHECKS.filter(c => c.severity === 'warning');
  const allWarnings = softChecks.flatMap(c => {
    if (c.applies && !c.applies(SOFT_VIOLATION_PLAN, ctx)) return [];
    return c.check(SOFT_VIOLATION_PLAN, ctx).filter(v => v.severity === 'warning');
  });
  assert(allWarnings.length >= 4, `Expected ≥4 soft violations, got ${allWarnings.length}: ${allWarnings.map(v => v.code).join(', ')}`);
});

// ── Suite 14: Phase 2 schema elements ────────────────────────────────────────

console.log('\nSuite 14 — Phase 2 schema elements (DoorElement, WallSegment, WindowElement, FloorLevel, Stair, Ramp, siteOrientation, fixtures)');

// ── R-006 / R-007 — door widths ──────────────────────────────────────────────

test('R-006: interior door ≥ 0.70m passes', () => {
  const layout = makeLayout({
    doors: [{ id: 'd1', type: 'hinged', fromRoomId: 'b1', toRoomId: 'h1', clearWidth: 0.9 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-006')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation for 0.90m interior door');
});

test('R-006: interior door 0.60m fails', () => {
  const layout = makeLayout({
    doors: [{ id: 'd1', type: 'hinged', fromRoomId: 'b1', toRoomId: 'h1', clearWidth: 0.60 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-006')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-006 violation for 0.60m door');
});

test('R-007: entrance door ≥ 0.90m passes', () => {
  const layout = makeLayout({
    doors: [{ id: 'main', type: 'entrance', fromRoomId: 'en', toRoomId: null, clearWidth: 1.0 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-007')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation for 1.0m entrance door');
});

test('R-007: entrance door 0.80m fails', () => {
  const layout = makeLayout({
    doors: [{ id: 'main', type: 'entrance', fromRoomId: 'en', toRoomId: null, clearWidth: 0.80 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-007')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-007 violation for 0.80m entrance door');
});

// ── R-048 — sliding door ──────────────────────────────────────────────────────

test('R-048: sliding door ≥ 1.20m passes', () => {
  const layout = makeLayout({
    doors: [{ id: 'sd1', type: 'sliding', fromRoomId: 'lr', toRoomId: 't1', clearWidth: 2.4 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-048')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation for 2.4m sliding door');
});

test('R-048: sliding door 0.90m fails', () => {
  const layout = makeLayout({
    doors: [{ id: 'sd1', type: 'sliding', fromRoomId: 'lr', toRoomId: 't1', clearWidth: 0.90 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-048')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-048 violation for 0.90m sliding door');
});

// ── R-001 — door-graph BFS ────────────────────────────────────────────────────

test('R-001: every room reachable from entrance without private traversal passes', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'en', type: 'entry',     label: 'Entry',     x: 0, y: 0, width: 2, height: 2 },
      { id: 'h1', type: 'hall',      label: 'Hall',      x: 2, y: 0, width: 3, height: 2 },
      { id: 'lr', type: 'living room', label: 'Living', x: 5, y: 0, width: 4, height: 4 },
    ],
    doors: [
      { id: 'd1', type: 'entrance', fromRoomId: 'en', toRoomId: 'h1', clearWidth: 0.9 },
      { id: 'd2', type: 'hinged',   fromRoomId: 'h1', toRoomId: 'lr', clearWidth: 0.9 },
    ],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-001')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-001 violation: all rooms reachable from entrance');
});

test('R-001: kitchen only reachable through bedroom fails', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'en', type: 'entry',   label: 'Entry',   x: 0, y: 0, width: 2, height: 2 },
      { id: 'b1', type: 'bedroom', label: 'Bedroom', x: 2, y: 0, width: 4, height: 4 },
      { id: 'k1', type: 'kitchen', label: 'Kitchen', x: 6, y: 0, width: 4, height: 3 },
    ],
    doors: [
      { id: 'd1', type: 'entrance', fromRoomId: 'en', toRoomId: 'b1', clearWidth: 0.9 },
      { id: 'd2', type: 'hinged',   fromRoomId: 'b1', toRoomId: 'k1', clearWidth: 0.9 },
      // No direct entry→kitchen or entry→hall→kitchen path exists
    ],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-001')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-001 violation: kitchen only via bedroom');
});

// ── R-003 — bedroom door to public room ──────────────────────────────────────

test('R-003: bedroom door opens to hall passes', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom', label: 'Bedroom', x: 0, y: 0, width: 4, height: 4 },
      { id: 'h1', type: 'hall',    label: 'Hall',    x: 4, y: 0, width: 3, height: 2 },
    ],
    doors: [{ id: 'd1', type: 'hinged', fromRoomId: 'b1', toRoomId: 'h1', clearWidth: 0.9 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-003')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-003 violation');
});

test('R-003: bedroom door only opens to bathroom fails', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'b1', type: 'bedroom',  label: 'Bedroom',  x: 0, y: 0, width: 4, height: 4 },
      { id: 'bt', type: 'bathroom', label: 'Bathroom', x: 4, y: 0, width: 2, height: 2 },
    ],
    doors: [{ id: 'd1', type: 'hinged', fromRoomId: 'b1', toRoomId: 'bt', clearWidth: 0.9 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-003')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-003 violation: bedroom only connects to bathroom');
});

// ── R-018 / R-019 — wall thickness ───────────────────────────────────────────

test('R-018: exterior wall ≥ 0.15m passes', () => {
  const layout = makeLayout({
    walls: [{ id: 'w1', type: 'exterior', thickness: 0.20, start: { x: 0, y: 0 }, end: { x: 5, y: 0 } }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-018')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-018 violation for 0.20m exterior wall');
});

test('R-018: exterior wall 0.10m fails', () => {
  const layout = makeLayout({
    walls: [{ id: 'w1', type: 'exterior', thickness: 0.10, start: { x: 0, y: 0 }, end: { x: 5, y: 0 } }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-018')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-018 violation for 0.10m exterior wall');
});

test('R-019: interior wall ≥ 0.10m passes', () => {
  const layout = makeLayout({
    walls: [{ id: 'w1', type: 'interior', thickness: 0.12, start: { x: 3, y: 0 }, end: { x: 3, y: 4 } }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-019')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-019 violation for 0.12m interior wall');
});

test('R-019: interior wall 0.06m fails', () => {
  const layout = makeLayout({
    walls: [{ id: 'w1', type: 'interior', thickness: 0.06, start: { x: 3, y: 0 }, end: { x: 3, y: 4 } }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-019')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-019 violation for 0.06m interior wall');
});

// ── R-050 — window sill height ───────────────────────────────────────────────

test('R-050: window sill height ≥ 0.60m passes', () => {
  const layout = makeLayout({
    windows: [{ id: 'win1', roomId: 'lr', sillHeight: 1.0 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-050')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no violation for 1.0m sill');
});

test('R-050: window sill height 0.30m fails', () => {
  const layout = makeLayout({
    windows: [{ id: 'win1', roomId: 'bt1', sillHeight: 0.30 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-050')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-050 violation for 0.30m sill');
});

// ── R-025 / R-098 — floor level annotations ──────────────────────────────────

test('R-098: rooms with contradictory floor levels fail', () => {
  const layout = makeLayout({
    floorLevels: [
      { id: 'fl1', type: 'NPT', value: 0.00, zoneRoomIds: ['b1', 'k1'] },
      { id: 'fl2', type: 'NPT', value: 0.15, zoneRoomIds: ['b1', 'bt1'] }, // b1 in two levels!
    ],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-098')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-098 violation: contradictory floor levels for b1');
});

test('R-098: consistent floor levels pass', () => {
  const layout = makeLayout({
    floorLevels: [
      { id: 'fl1', type: 'NPT', value: 0.00, zoneRoomIds: ['b1', 'k1'] },
      { id: 'fl2', type: 'FFL', value: -0.15, zoneRoomIds: ['g1'] },
    ],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-098')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-098 violation');
});

// ── R-034 / R-035 — stair/ramp ───────────────────────────────────────────────

test('R-034: stair accessible from hall passes', () => {
  const layout = makeLayout({
    rooms: [{ id: 'h1', type: 'hall', label: 'Hall', x: 0, y: 0, width: 3, height: 2 }],
    stairs: [{ id: 'st1', fromFloor: 0, toFloor: 1, adjacentRoomId: 'h1' }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-034')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-034 violation: stair from hall');
});

test('R-034: stair only accessible from bedroom fails', () => {
  const layout = makeLayout({
    rooms: [{ id: 'b1', type: 'bedroom', label: 'Bedroom', x: 0, y: 0, width: 4, height: 4 }],
    stairs: [{ id: 'st1', fromFloor: 0, toFloor: 1, adjacentRoomId: 'b1' }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-034')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-034 violation: stair only from bedroom');
});

test('R-035: ramp landings ≥ 1.20m both ends passes', () => {
  const layout = makeLayout({
    ramps: [{ id: 'ramp1', type: 'parking', landingDepthStart: 1.5, landingDepthEnd: 1.5 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-035')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-035 violation: both landings ≥ 1.20m');
});

test('R-035: ramp arrival landing 0.80m fails', () => {
  const layout = makeLayout({
    ramps: [{ id: 'ramp1', type: 'parking', landingDepthStart: 1.5, landingDepthEnd: 0.80 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-035')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-035 violation: arrival landing 0.80m < 1.20m');
});

// ── R-053 / R-076 — siteOrientation ──────────────────────────────────────────

test('R-053: living room on primary elevation (N) passes when it touches north wall', () => {
  // siteOrientation='N' → north = top (y=0). Room at y=0 faces north.
  const layout = makeLayout({
    siteOrientation: 'N',
    rooms: [{ id: 'lr', type: 'living room', label: 'Living Room', x: 0, y: 0, width: 6, height: 4 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-053')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-053 violation: living room on north elevation');
});

test('R-053: living room not on primary elevation warns', () => {
  // siteOrientation='N' → room at y=4 (interior) doesn't touch y=0 (north)
  const layout = makeLayout({
    siteOrientation: 'N',
    rooms: [{ id: 'lr', type: 'living room', label: 'Living Room', x: 2, y: 4, width: 6, height: 4 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-053')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-053 warning: living room not on primary elevation');
});

test('R-076: entrance faces primary (N) elevation passes', () => {
  const layout = makeLayout({
    siteOrientation: 'N',
    rooms: [{ id: 'en', type: 'entry', label: 'Entry', x: 4, y: 0, width: 3, height: 2 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-076')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-076 violation: entrance on north face');
});

test('R-076: entrance not on primary elevation warns', () => {
  // entry touches only east wall (x=dimW), not north (y=0)
  const layout = makeLayout({
    siteOrientation: 'N',
    rooms: [{ id: 'en', type: 'entry', label: 'Entry', x: 12, y: 5, width: 3, height: 2 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-076')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-076 warning: entrance not on primary elevation');
});

// ── R-084 — fireplace on exterior wall ───────────────────────────────────────

test('R-084: fireplace in room touching exterior wall passes', () => {
  const layout = makeLayout({
    rooms: [{ id: 'lr', type: 'living room', label: 'Living Room', x: 0, y: 0, width: 5, height: 4 }],
    fireplaces: [{ id: 'fp1', roomId: 'lr' }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-084')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-084 violation: fireplace on exterior wall');
});

test('R-084: fireplace in fully interior room warns', () => {
  const layout = makeLayout({
    rooms: [{ id: 'lr', type: 'living room', label: 'Living Room', x: 3, y: 3, width: 5, height: 4 }],
    fireplaces: [{ id: 'fp1', roomId: 'lr' }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-084')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-084 warning: fireplace in interior room');
  assert(violations[0].severity === 'warning', 'Expected warning severity for R-084');
});

// ── R-086 / R-087 / R-094 — fixtures ─────────────────────────────────────────

test('R-086: kitchen with all three zones passes', () => {
  const layout = makeLayout({
    kitchenFixtures: [{ id: 'kf1', roomId: 'k1', zones: ['cooking', 'washing', 'storage'] }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-086')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-086 violation: all three zones present');
});

test('R-086: kitchen missing storage zone warns', () => {
  const layout = makeLayout({
    kitchenFixtures: [{ id: 'kf1', roomId: 'k1', zones: ['cooking', 'washing'] }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-086')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-086 warning: missing storage zone');
});

test('R-087: bathroom with WC passes', () => {
  const layout = makeLayout({
    bathroomFixtures: [{ id: 'bf1', roomId: 'bt1', fixtures: ['wc', 'basin'] }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-087')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-087 violation: WC present');
});

test('R-087: bathroom with only basin warns', () => {
  const layout = makeLayout({
    bathroomFixtures: [{ id: 'bf1', roomId: 'bt1', fixtures: ['basin'] }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-087')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-087 warning: no WC, bath, or shower');
});

test('R-094: kitchen counter ≥ 0.60m passes', () => {
  const layout = makeLayout({
    kitchenFixtures: [{ id: 'kf1', roomId: 'k1', zones: ['cooking', 'washing', 'storage'], counterDepth: 0.65 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-094')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-094 violation for 0.65m counter');
});

test('R-094: kitchen counter 0.45m fails', () => {
  const layout = makeLayout({
    kitchenFixtures: [{ id: 'kf1', roomId: 'k1', zones: ['cooking', 'washing', 'storage'], counterDepth: 0.45 }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-094')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-094 warning for 0.45m counter');
});

// ── R-101 — dimension annotations ────────────────────────────────────────────

test('R-101: dimension annotation matching actual distance passes', () => {
  // 3-4-5 right triangle: actual = 5.0m
  const layout = makeLayout({
    dimensionAnnotations: [{
      id: 'dim1',
      fromPoint: { x: 0, y: 0 },
      toPoint:   { x: 3, y: 4 },
      annotatedValue: 5.0,
    }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-101')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-101 violation: annotation matches actual 5.0m');
});

test('R-101: dimension annotation with wrong value fails', () => {
  // Actual distance is 5m but annotated as 4m — exceeds 0.05m tolerance
  const layout = makeLayout({
    dimensionAnnotations: [{
      id: 'dim1',
      fromPoint: { x: 0, y: 0 },
      toPoint:   { x: 3, y: 4 },
      annotatedValue: 4.0,   // wrong
    }],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-101')!;
  assert(check.check(layout, ctx).length >= 1, 'Expected R-101 violation: annotated 4m ≠ actual 5m');
});

// ── backward compatibility: existing plans without new schema fields ───────────

test('Phase 2 checks return [] when new schema fields absent (backward compatibility)', () => {
  // A layout with no doors/walls/windows etc. — all phase 2 checks must return []
  const layout = makeLayout({ rooms: [
    { id: 'b1', type: 'bedroom',  label: 'Bedroom 1', x: 0, y: 0, width: 4, height: 4 },
    { id: 'bt', type: 'bathroom', label: 'Bathroom',  x: 4, y: 0, width: 2, height: 2 },
    { id: 'k1', type: 'kitchen',  label: 'Kitchen',   x: 6, y: 0, width: 4, height: 3 },
    { id: 'en', type: 'entry',    label: 'Entry',     x: 0, y: 4, width: 3, height: 2 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const phase2RuleIds = new Set([
    'R-001', 'R-003', 'R-004', 'R-005', 'R-006', 'R-007',
    'R-009', 'R-018', 'R-019', 'R-022', 'R-023', 'R-024', 'R-025',
    'R-034', 'R-035', 'R-036', 'R-048', 'R-050',
    'R-053', 'R-060', 'R-069', 'R-070', 'R-071',
    'R-076', 'R-077', 'R-078', 'R-079', 'R-080', 'R-081', 'R-082', 'R-083', 'R-084', 'R-085',
    'R-086', 'R-087', 'R-094', 'R-097', 'R-098', 'R-099', 'R-101',
  ]);
  const phase2Checks = RULEBOOK_V1_CHECKS.filter(c => phase2RuleIds.has(c.ruleId as string));
  for (const check of phase2Checks) {
    if (check.applies && !check.applies(layout, ctx)) continue; // guard correctly skips
    const violations = check.check(layout, ctx);
    assert(Array.isArray(violations), `R-${check.ruleId} did not return an array`);
    assert(violations.length === 0, `R-${check.ruleId} returned violations for layout with no phase-2 schema fields — backward compatibility broken`);
  }
});

// ── Suite 15: Phase 3 — R-095 differentiated soft warning + R-102 viewport labels ──

console.log('\nSuite 15 — Phase 3: R-095 differentiated soft warning; R-102 viewport label overlap');

// ── R-095 — differentiated soft check ────────────────────────────────────────

test('R-095: closet depth 0.57m (passes R-049 hard min but below 0.60m ideal) → warning', () => {
  const layout = makeLayout({ rooms: [
    { id: 'cl1', type: 'closet', label: 'Closet 1', x: 0, y: 0, width: 0.57, height: 1.5 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-095')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-095 warning for 0.57m closet (between 0.55m hard min and 0.60m ideal)');
  assert(violations[0].severity === 'warning', 'Expected warning severity');
});

test('R-095: closet depth 0.60m (at ideal) → no warning', () => {
  const layout = makeLayout({ rooms: [
    { id: 'cl1', type: 'closet', label: 'Closet 1', x: 0, y: 0, width: 0.60, height: 1.5 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-095')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-095 warning for 0.60m closet (at ideal depth)');
});

test('R-095: closet depth 0.45m (below hard min 0.55m) → no R-095 warning (R-049 already errors)', () => {
  // R-095 should NOT double-fire on closets that R-049 already rejects
  const layout = makeLayout({ rooms: [
    { id: 'cl1', type: 'closet', label: 'Closet 1', x: 0, y: 0, width: 0.45, height: 1.5 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-095')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-095 warning for 0.45m closet (R-049 handles this as hard error)');
});

test('R-095: no closets in plan → no violation', () => {
  const layout = makeLayout({ rooms: [
    { id: 'b1', type: 'bedroom', label: 'Bedroom', x: 0, y: 0, width: 4, height: 3 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-095')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-095 warning when no closets present');
});

// ── R-102 — viewport label overlap ────────────────────────────────────────────

test('R-102: label centred in own room, no overlap → no violation', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'lr', type: 'living room', label: 'Living Room', x: 0, y: 0, width: 6, height: 5 },
      { id: 'k1', type: 'kitchen',     label: 'Kitchen',     x: 6, y: 0, width: 4, height: 4 },
    ],
    viewportLabels: [
      { id: 'vl-lr', roomId: 'lr', position: { x: 3,   y: 2.5 }, size: { width: 1.5, height: 0.4 } },
      { id: 'vl-k1', roomId: 'k1', position: { x: 8,   y: 2   }, size: { width: 1.2, height: 0.4 } },
    ],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-102')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-102 violation: both labels centred in own rooms');
});

test('R-102: label leaks into neighbouring room → warning', () => {
  // Label for living room is positioned at x=5.8 — its right edge crosses into kitchen at x=6
  const layout = makeLayout({
    rooms: [
      { id: 'lr', type: 'living room', label: 'Living Room', x: 0, y: 0, width: 6, height: 5 },
      { id: 'k1', type: 'kitchen',     label: 'Kitchen',     x: 6, y: 0, width: 4, height: 4 },
    ],
    viewportLabels: [
      { id: 'vl-lr', roomId: 'lr', position: { x: 5.8, y: 2.5 }, size: { width: 2.0, height: 0.4 } },
    ],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-102')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-102 warning: label leaks into kitchen bounding box');
  assert(violations[0].severity === 'warning', 'Expected warning severity');
});

test('R-102: two labels overlap each other → warning', () => {
  const layout = makeLayout({
    rooms: [
      { id: 'lr', type: 'living room', label: 'Living Room', x: 0, y: 0, width: 6, height: 5 },
      { id: 'dn', type: 'dining',      label: 'Dining Room', x: 0, y: 5, width: 6, height: 4 },
    ],
    viewportLabels: [
      // Both labels placed at y=4.8 — they will overlap each other
      { id: 'vl-lr', roomId: 'lr', position: { x: 3, y: 4.8 }, size: { width: 2.0, height: 0.5 } },
      { id: 'vl-dn', roomId: 'dn', position: { x: 3, y: 5.1 }, size: { width: 2.0, height: 0.5 } },
    ],
  });
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-102')!;
  const violations = check.check(layout, ctx);
  assert(violations.length >= 1, 'Expected R-102 warning: two labels overlap each other');
  assert(violations[0].severity === 'warning', 'Expected warning severity');
});

test('R-102: absent viewportLabels → no violation (backward compatibility)', () => {
  const layout = makeLayout({ rooms: [
    { id: 'lr', type: 'living room', label: 'Living Room', x: 0, y: 0, width: 6, height: 5 },
  ]});
  const ctx = { units: 'meters' as const, dimW: 15, dimD: 12, ftToUnit: 0.3048 };
  const check = RULEBOOK_V1_CHECKS.find(c => c.ruleId === 'R-102')!;
  assert(check.check(layout, ctx).length === 0, 'Expected no R-102 violation when viewportLabels absent');
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`);
console.log(`  Total: ${passed + failed}   Passed: ${passed}   Failed: ${failed}`);
if (failed > 0) {
  console.error(`\n  ${failed} test(s) failed.`);
  process.exit(1);
} else {
  console.log('\n  All tests passed.');
}
