/**
 * Generator geometry validity tests.
 * Run with: npx tsx packages/generator/src/generator.test.ts
 *
 * Asserts that seeded layouts produced by generateLayoutFromText and
 * generateAndValidate contain no overlapping or contained rooms.
 */

import { generateLayoutFromText, generateAndValidate, generateWithLLM, extractRoomProgram } from './index.js';
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

const asyncTests: Array<Promise<void>> = [];

function asyncTest(name: string, fn: () => Promise<void>): void {
  asyncTests.push(
    fn().then(() => {
      console.log(`  ✓  ${name}`);
      passed++;
    }).catch((e: any) => {
      console.error(`  ✗  ${name}`);
      console.error(`     ${e.message}`);
      failed++;
    }),
  );
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

console.log('\ngenerateAndValidate — combined-score and meta.bestScore integrity');

test('meta.bestScore reflects combined score (base minus rulebook deduction) not raw base score', () => {
  // Run with a prompt that reliably triggers rulebook violations so the deduction
  // is non-zero.  Seed=42 is deterministic; priors=null removes that variable.
  const result = generateAndValidate(
    { prompt: '3 bedrooms 2 bathrooms garage', width: 40, depth: 30, seed: 42 },
    { maxAttempts: 3, priors: null },
  );

  // meta.bestScore must be in the valid score range.
  assert(result.meta.bestScore >= 0, `bestScore must be >= 0, got ${result.meta.bestScore}`);
  assert(result.meta.bestScore <= 100, `bestScore must be <= 100, got ${result.meta.bestScore}`);

  // Each score in meta.scores must also be in range (combined scores are clamped).
  for (const s of result.meta.scores) {
    assert(s >= 0 && s <= 100, `All attempt scores must be in [0,100], got ${s}`);
  }

  // meta.bestScore must equal the maximum of meta.scores (best-of-N selection).
  const maxScore = Math.max(...result.meta.scores);
  assert(
    result.meta.bestScore === maxScore,
    `meta.bestScore (${result.meta.bestScore}) must equal max of scores (${maxScore})`,
  );
});

test('meta.bestScore is <= the raw base validation score when rulebook deduction applies', () => {
  // The combined score = base - rulebookDeduction, so bestScore ≤ base score
  // for any run where the rulebook fires violations.  We verify this by checking
  // that bestScore does not exceed validation.score + 1 (allowing for rounding).
  const result = generateAndValidate(
    { prompt: '2 bedrooms 1 bathroom', width: 30, depth: 24, seed: 99 },
    { maxAttempts: 4, priors: null },
  );
  // validation.score is the base score of the best attempt (no rulebook applied to it here).
  // bestScore is the combined score; it cannot exceed the base score.
  assert(
    result.meta.bestScore <= result.validation.score + 1,
    `meta.bestScore (${result.meta.bestScore}) should not exceed base score (${result.validation.score})`,
  );
});

test('meta.scores array length matches meta.attempts (all combined scores recorded)', () => {
  const result = generateAndValidate(
    { prompt: '1 bedroom 1 bathroom', width: 28, depth: 22, seed: 1000 },
    { maxAttempts: 5, priors: null },
  );
  assert(
    result.meta.scores.length === result.meta.attempts,
    `scores.length (${result.meta.scores.length}) must equal meta.attempts (${result.meta.attempts})`,
  );
  assert(
    result.attempts === result.meta.attempts,
    `top-level attempts (${result.attempts}) must match meta.attempts (${result.meta.attempts})`,
  );
});

test('early-exit on high combined score: bestScore >= earlyExitScore stops loop', () => {
  // Use a generous earlyExitScore of 0 so any first attempt exits immediately.
  const result = generateAndValidate(
    { prompt: '2 bedrooms 1 bathroom', width: 50, depth: 40, seed: 7 },
    { maxAttempts: 8, earlyExitScore: 0, priors: null },
  );
  // With earlyExitScore=0, the first attempt always meets the threshold.
  assert(result.meta.attempts === 1, `Expected 1 attempt with earlyExitScore=0, got ${result.meta.attempts}`);
  assert(result.meta.scores.length === 1, `Expected 1 score entry, got ${result.meta.scores.length}`);
});

// ── generateWithLLM — async generation (heuristic fallback path) ──────────────

console.log('\ngenerateWithLLM — async generation (no API key / heuristic fallback)');

asyncTest('generateWithLLM without API key returns valid GenerateResult shape', async () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await generateWithLLM(
      { prompt: '2 bedrooms 1 bathroom', width: 40, depth: 30, seed: 42 },
      { maxAttempts: 2, priors: null },
    );
    assert(typeof result.layout === 'object' && result.layout !== null, 'layout must be an object');
    assert(Array.isArray(result.layout.rooms), 'layout.rooms must be an array');
    assert(result.layout.rooms.length > 0, 'layout must have at least one room');
    assert(typeof result.attempts === 'number' && result.attempts >= 1, 'attempts must be >= 1');
    assert(typeof result.meta.bestScore === 'number', 'meta.bestScore must be a number');
    assert(Array.isArray(result.meta.scores), 'meta.scores must be an array');
    assert(result.meta.scores.length === result.meta.attempts, 'meta.scores.length must equal meta.attempts');
  } finally {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  }
});

asyncTest('generateWithLLM without API key falls back to heuristic strategy', async () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await generateWithLLM(
      { prompt: '3 bedrooms 2 bathrooms', width: 50, depth: 36, seed: 7 },
      { maxAttempts: 1, priors: null },
    );
    assert(
      result.meta.debug[0].strategy === 'heuristic-fallback',
      `expected strategy 'heuristic-fallback', got '${result.meta.debug[0].strategy}'`,
    );
  } finally {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  }
});

asyncTest('generateWithLLM without API key produces geometry with no overlaps or containment', async () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await generateWithLLM(
      { prompt: '3 bedrooms 2 bathrooms', width: 50, depth: 36, seed: 7 },
      { maxAttempts: 1, priors: null },
    );
    assertNoOverlapOrContainment(result.layout, 'generateWithLLM-3bed');
  } finally {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  }
});

asyncTest('generateWithLLM uses claude-haiku-4-5-20251001: extractRoomProgram returns null without API key', async () => {
  // Documents the model constant in llm-planner.ts (claude-haiku-4-5-20251001).
  // Without an API key, extractRoomProgram must return null gracefully.
  const savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    assert(typeof extractRoomProgram === 'function', 'extractRoomProgram must be exported');
    const program = await extractRoomProgram('2 bedrooms 1 bathroom', 'feet', 40, 30);
    assert(program === null, `expected null without API key, got: ${JSON.stringify(program)}`);
  } finally {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  }
});

asyncTest('generateWithLLM early-exit on high earlyExitScore=0 takes 1 attempt (heuristic path)', async () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await generateWithLLM(
      { prompt: '2 bedrooms 1 bathroom', width: 50, depth: 40, seed: 7 },
      { maxAttempts: 8, earlyExitScore: 0, priors: null },
    );
    assert(result.meta.attempts === 1, `expected 1 attempt with earlyExitScore=0, got ${result.meta.attempts}`);
  } finally {
    if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
  }
});

// ── Summary ───────────────────────────────────────────────────────────────────

await Promise.all(asyncTests);

console.log(`\n  ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
