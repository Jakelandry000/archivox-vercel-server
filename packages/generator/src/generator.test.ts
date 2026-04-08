/**
 * Generator geometry validity tests.
 * Run with: npx tsx packages/generator/src/generator.test.ts
 *
 * Asserts that seeded layouts produced by generateLayoutFromText and
 * generateAndValidate contain no overlapping or contained rooms.
 */

import { generateLayoutFromText, generateAndValidate } from './index.js';
import { LayoutV1 } from '@archivox/core';

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

/** Returns the intersection area of two axis-aligned rooms, or 0. */
function overlapArea(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): number {
  const ox = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
  const oy = Math.min(ay + ah, by + bh) - Math.max(ay, by);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

/** True if room a is fully contained within room b. */
function isContained(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
): boolean {
  return ax >= bx && ay >= by && ax + aw <= bx + bw && ay + ah <= by + bh;
}

/**
 * Asserts that no two rooms in the layout overlap by more than epsilon,
 * and that no room is fully contained within another.
 */
function assertNoOverlapOrContainment(layout: LayoutV1, label: string, eps = 1e-6) {
  const rooms = layout.rooms;
  for (let i = 0; i < rooms.length; i++) {
    const a = rooms[i];
    for (let j = i + 1; j < rooms.length; j++) {
      const b = rooms[j];
      const oa = overlapArea(a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height);
      if (oa > eps) {
        // Distinguish containment from partial overlap
        if (
          isContained(a.x, a.y, a.width, a.height, b.x, b.y, b.width, b.height) ||
          isContained(b.x, b.y, b.width, b.height, a.x, a.y, a.width, a.height)
        ) {
          throw new Error(
            `${label}: CONTAINMENT between "${a.id}" and "${b.id}" (overlap=${oa.toFixed(2)} sq ft)`,
          );
        }
        throw new Error(
          `${label}: OVERLAP between "${a.id}" and "${b.id}" (overlap=${oa.toFixed(2)} sq ft)`,
        );
      }
    }
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\ngenerateLayoutFromText — geometry validity');

test('small-1bed (28×22) single attempt has no overlaps or containment', () => {
  const layout = generateLayoutFromText({ prompt: '1 bedroom 1 bathroom', width: 28, depth: 22 });
  assertNoOverlapOrContainment(layout, 'small-1bed');
});

test('tiny (18×14) single attempt has no overlaps or containment', () => {
  const layout = generateLayoutFromText({ prompt: '1 bedroom 1 bathroom', width: 18, depth: 14 });
  assertNoOverlapOrContainment(layout, 'tiny');
});

test('mid-2bed (40×30) single attempt has no overlaps or containment', () => {
  const layout = generateLayoutFromText({ prompt: '2 bedrooms 2 bathrooms', width: 40, depth: 30 });
  assertNoOverlapOrContainment(layout, 'mid-2bed');
});

test('mid-3bed (50×36) single attempt has no overlaps or containment', () => {
  const layout = generateLayoutFromText({ prompt: '3 bedrooms 2 bathrooms', width: 50, depth: 36 });
  assertNoOverlapOrContainment(layout, 'mid-3bed');
});

test('garage-3bed (55×42) single attempt has no overlaps or containment', () => {
  const layout = generateLayoutFromText({
    prompt: '3 bedrooms 2 bathrooms garage',
    width: 55, depth: 42,
  });
  assertNoOverlapOrContainment(layout, 'garage-3bed');
});

test('meters-2bed (14×10m) single attempt has no overlaps or containment', () => {
  const layout = generateLayoutFromText({
    prompt: '2 bedrooms 2 bathrooms',
    units: 'meters', width: 14, depth: 10,
  });
  assertNoOverlapOrContainment(layout, 'meters-2bed');
});

console.log('\ngenerateLayoutFromText — seeded variants');

// Run 20 seeded variants of the problematic small template and assert no overlaps.
test('small-1bed: 20 seeded variants (seeds 1000-1019) have no overlaps or containment', () => {
  for (let seed = 1000; seed < 1020; seed++) {
    const layout = generateLayoutFromText({ prompt: '1 bedroom 1 bathroom', width: 28, depth: 22, seed });
    assertNoOverlapOrContainment(layout, `small-1bed seed=${seed}`);
  }
});

test('tiny: 10 seeded variants (seeds 1000-1009) have no overlaps or containment', () => {
  for (let seed = 1000; seed < 1010; seed++) {
    const layout = generateLayoutFromText({ prompt: '1 bedroom 1 bathroom', width: 18, depth: 14, seed });
    assertNoOverlapOrContainment(layout, `tiny seed=${seed}`);
  }
});

console.log('\ngenerateAndValidate — no ROOM_CONTAINMENT or ROOM_OVERLAP violations');

test('generateAndValidate(small-1bed, maxAttempts=1) has no overlap/containment violations', () => {
  const result = generateAndValidate(
    { prompt: '1 bedroom 1 bathroom', width: 28, depth: 22, seed: 1000 },
    { maxAttempts: 1, priors: null },
  );
  const bad = result.validation.violations.filter(
    v => v.code === 'ROOM_CONTAINMENT' || v.code === 'ROOM_OVERLAP',
  );
  assert(bad.length === 0, `Expected 0 overlap/containment violations, got ${bad.length}: ${JSON.stringify(bad.map(v => v.code))}`);
});

test('generateAndValidate(tiny, maxAttempts=1) has no overlap/containment violations', () => {
  const result = generateAndValidate(
    { prompt: '1 bedroom 1 bathroom', width: 18, depth: 14, seed: 1009 },
    { maxAttempts: 1, priors: null },
  );
  const bad = result.validation.violations.filter(
    v => v.code === 'ROOM_CONTAINMENT' || v.code === 'ROOM_OVERLAP',
  );
  assert(bad.length === 0, `Expected 0 violations, got ${bad.length}: ${JSON.stringify(bad.map(v => v.code))}`);
});

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
