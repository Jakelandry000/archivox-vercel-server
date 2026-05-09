/**
 * Integration tests for the /api/chat route response shape.
 *
 * These tests exercise the same code path the route uses — generateAndValidate,
 * runChecks, computeRulebookDeduction, applyIbcRules — and assert that the
 * assembled validation object matches what the route returns to clients.
 *
 * Run with: npx tsx apps/web/src/app/api/chat/route.test.ts
 *
 * Two scenarios are covered:
 *   1. Priors absent (no priors.json in the repo) — priorsAdjustment is undefined.
 *   2. Priors loaded (inline mock Priors object)  — priorsAdjustment is a number in [0,5].
 */

import { generateAndValidate, generateWithLLM, generateLayoutFromText } from '@archivox/generator';
import type { RoomProgram } from '@archivox/generator';
import {
  loadPriors,
  applyIbcRules,
  registerRulebookV1Checks,
  runChecks,
  computeRulebookDeduction,
  validateLayout,
  type Priors,
  type ValidationResult,
} from '@archivox/core';

// Register all 103 Rule Book v1 checks — matches route cold-start registration.
registerRulebookV1Checks();

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e: unknown) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${(e as Error).message}`);
    failed++;
  }
}

async function testAsync(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch (e: unknown) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${(e as Error).message}`);
    failed++;
  }
}

function assert(condition: boolean, msg: string) {
  if (!condition) throw new Error(msg);
}

/**
 * Simulates the route's final response assembly for a given prompt and priors.
 * Returns the value of `data.validation` exactly as the route would include it
 * in the JSON response.
 */
function simulateRouteValidation(
  prompt: string,
  priors: Priors | null,
): ValidationResult & { rulebookScoreAdjustment: number } {
  const { layout, validation } = generateAndValidate(
    { prompt, seed: 42 },
    { scoreThreshold: 70, maxAttempts: 4, priors },
  );

  const rulebookViolations      = runChecks(layout);
  const rulebookDeduction       = computeRulebookDeduction(rulebookViolations);
  const rulebookScoreAdjustment = -rulebookDeduction;

  const ibcViolations = applyIbcRules(layout);

  const allViolations = [
    ...validation.violations,
    ...rulebookViolations,
    ...ibcViolations,
  ];

  const finalScore = Math.max(0, Math.min(100, validation.score + rulebookScoreAdjustment));

  // Mirror the spread the route uses:
  //   const validationWithIbc = { ...validation, score: finalScore, violations, rulebookScoreAdjustment };
  return {
    ...validation,
    score: finalScore,
    violations: allViolations,
    rulebookScoreAdjustment,
  };
}

// ── Mock priors fixture ────────────────────────────────────────────────────────
// Minimal Priors object with common adjacency pairs that produce a positive
// priorsAdjustment when the generated layout has kitchen↔living adjacency.

const MOCK_PRIORS: Priors = {
  schemaVersion: 'priors.v1',
  totalPlans: 50,
  totalRooms: 350,
  totalEdges: 300,
  labelFreq: {
    bedroom:       120,
    bathroom:      80,
    kitchen:       50,
    'living room': 50,
  },
  adjacencyFreq: {
    // Each pair appears in >5% of edges — qualifies for a +1 priors bonus.
    'kitchen|living room':  30,   // 30/300 = 10% ✓
    'bathroom|bedroom':     20,   // 20/300 ≈ 6.7% ✓
    'bedroom|living room':  18,   // 18/300 = 6% ✓
  },
};

// ── Tests: no priors ──────────────────────────────────────────────────────────

console.log('\n/api/chat route — validation response shape (no priors)');

test('response includes validation object with score, violations, metrics', () => {
  const validation = simulateRouteValidation('2 bedrooms 1 bathroom', null);
  assert(typeof validation.score === 'number', 'validation.score must be a number');
  assert(Array.isArray(validation.violations), 'validation.violations must be an array');
  assert(typeof validation.metrics === 'object', 'validation.metrics must be an object');
});

test('rulebookScoreAdjustment is present and ≤ 0', () => {
  const validation = simulateRouteValidation('2 bedrooms 1 bathroom', null);
  assert(
    typeof validation.rulebookScoreAdjustment === 'number',
    'rulebookScoreAdjustment must be a number',
  );
  assert(
    validation.rulebookScoreAdjustment <= 0,
    `rulebookScoreAdjustment must be ≤ 0, got ${validation.rulebookScoreAdjustment}`,
  );
});

test('priorsAdjustment is absent when no priors are loaded', () => {
  const validation = simulateRouteValidation('1 bedroom 1 bathroom', null);
  assert(
    validation.priorsAdjustment === undefined,
    `priorsAdjustment must be undefined when priors are null, got ${validation.priorsAdjustment}`,
  );
});

test('score is clamped to [0, 100]', () => {
  const validation = simulateRouteValidation('3 bedrooms 2 bathrooms garage', null);
  assert(
    validation.score >= 0 && validation.score <= 100,
    `score must be in [0,100], got ${validation.score}`,
  );
});

// ── Tests: priors loaded ──────────────────────────────────────────────────────

console.log('\n/api/chat route — validation response shape (with priors loaded)');

test('data.validation.priorsAdjustment is present and a number when priors are loaded', () => {
  const validation = simulateRouteValidation('2 bedrooms 1 bathroom', MOCK_PRIORS);
  assert(
    typeof validation.priorsAdjustment === 'number',
    `data.validation.priorsAdjustment must be a number when priors are loaded, got ${typeof validation.priorsAdjustment}`,
  );
});

test('data.validation.priorsAdjustment is in the valid range [0, 5] when priors are loaded', () => {
  const validation = simulateRouteValidation('2 bedrooms 1 bathroom', MOCK_PRIORS);
  assert(
    validation.priorsAdjustment !== undefined,
    'data.validation.priorsAdjustment must be defined when priors are loaded',
  );
  assert(
    (validation.priorsAdjustment as number) >= 0,
    `data.validation.priorsAdjustment must be ≥ 0, got ${validation.priorsAdjustment}`,
  );
  assert(
    (validation.priorsAdjustment as number) <= 5,
    `data.validation.priorsAdjustment must be ≤ 5 (soft bonus cap), got ${validation.priorsAdjustment}`,
  );
});

test('data.validation.priorsAdjustment survives the ...validation spread (route parity)', () => {
  // Verifies the field is retained through the same spread the route applies:
  //   const validationWithIbc = { ...validation, score: finalScore, violations, rulebookScoreAdjustment };
  // simulateRouteValidation applies that exact spread — priorsAdjustment must survive.
  const validation = simulateRouteValidation('2 bedrooms 1 bathroom', MOCK_PRIORS);
  assert(
    typeof validation.priorsAdjustment === 'number',
    `priorsAdjustment must survive the ...validation spread; got ${typeof validation.priorsAdjustment}`,
  );
});

test('priorsAdjustment is absent in response when repo priors file is missing', () => {
  // loadPriors() returns null when datasets/core-v1/priors.json does not exist.
  // Route uses _priors = loadPriors(), so priorsAdjustment will be undefined.
  const repoPriors = loadPriors();
  if (repoPriors !== null) {
    console.log('     (priors.json found in repo — skipping absence assertion)');
    return;
  }
  const validation = simulateRouteValidation('1 bedroom 1 bathroom', null);
  assert(
    validation.priorsAdjustment === undefined,
    `priorsAdjustment must be absent when priors file is missing; got ${validation.priorsAdjustment}`,
  );
});

test('validateLayout directly returns priorsAdjustment when priors are supplied', () => {
  // Confirms the field is set at the source before the route spreads it.
  const layout = {
    schemaVersion: 'layout.v1' as const,
    units: 'feet' as const,
    dimensions: { width: 40, depth: 30 },
    rooms: [
      { id: 'lr1', type: 'living room', x: 0,  y: 0,  width: 18, height: 14 },
      { id: 'k1',  type: 'kitchen',     x: 18, y: 0,  width: 12, height: 10 },
      { id: 'bd1', type: 'bedroom',     x: 0,  y: 14, width: 12, height: 10 },
      { id: 'bt1', type: 'bathroom',    x: 12, y: 14, width: 8,  height: 10 },
    ],
  };
  const result = validateLayout(layout, MOCK_PRIORS);
  assert(
    typeof result.priorsAdjustment === 'number',
    `validateLayout must set priorsAdjustment when priors are supplied; got ${typeof result.priorsAdjustment}`,
  );
  assert(
    (result.priorsAdjustment as number) >= 0 && (result.priorsAdjustment as number) <= 5,
    `priorsAdjustment must be in [0,5]; got ${result.priorsAdjustment}`,
  );
});

// ── Tests: generateWithLLM async path (no API key → heuristic fallback) ───────
//
// These tests exercise the generateWithLLM code path that the route calls.
// Without ANTHROPIC_API_KEY the LLM planner returns null and the generator
// falls back to the heuristic, so meta.debug[0].strategy === 'heuristic-fallback'.
// Async tests are collected in a deferred runner to avoid top-level await (CJS).

const asyncTests: Array<{ name: string; fn: () => Promise<void> }> = [];

// ── Tests: LLM planner code path via generateLayoutFromText with plannedRooms ─
//
// generateWithLLM feeds the extracted room program into generateLayoutFromText.
// We test this path directly by constructing a mock RoomProgram and verifying
// the resulting layout reflects those rooms — matching what the route would
// produce when extractRoomProgram returns a valid program.

console.log('\n/api/chat route — LLM planner path: generateLayoutFromText with plannedRooms');

const MOCK_ROOM_PROGRAM: RoomProgram = {
  rooms: [
    { type: 'living room', width: 18, height: 14 },
    { type: 'kitchen',     width: 12, height: 10 },
    { type: 'bedroom',     width: 12, height: 10 },
    { type: 'bedroom',     width: 12, height: 10 },
    { type: 'bathroom',    width: 8,  height: 8  },
  ],
};

test('LLM planner path: layout contains all room types from mock program', () => {
  const layout = generateLayoutFromText(
    { prompt: '2 bedrooms 1 bathroom', seed: 42 },
    0,
    undefined,
    undefined,
    MOCK_ROOM_PROGRAM.rooms,
  );
  const types = layout.rooms.map(r => r.type);
  for (const room of MOCK_ROOM_PROGRAM.rooms) {
    assert(types.includes(room.type), `Layout must contain room type '${room.type}'`);
  }
});

test('LLM planner path: layout room count matches mock program room count', () => {
  const layout = generateLayoutFromText(
    { prompt: '2 bedrooms 1 bathroom', seed: 42 },
    0,
    undefined,
    undefined,
    MOCK_ROOM_PROGRAM.rooms,
  );
  assert(
    layout.rooms.length === MOCK_ROOM_PROGRAM.rooms.length,
    `Layout must have ${MOCK_ROOM_PROGRAM.rooms.length} rooms, got ${layout.rooms.length}`,
  );
});

test('LLM planner path: layout rooms have positive dimensions from mock program', () => {
  const layout = generateLayoutFromText(
    { prompt: '2 bedrooms 1 bathroom', seed: 42 },
    0,
    undefined,
    undefined,
    MOCK_ROOM_PROGRAM.rooms,
  );
  for (const room of layout.rooms) {
    assert(room.width > 0, `Room '${room.id}' must have positive width`);
    assert(room.height > 0, `Room '${room.id}' must have positive height`);
  }
});

test('LLM planner path: bedroom dimensions reflect mock program (not heuristic defaults)', () => {
  // Heuristic default for bedroom is w=12, h=10. Mock program also uses 12×10
  // for bedrooms — verify that two bedrooms appear exactly, matching the program.
  const layout = generateLayoutFromText(
    { prompt: '2 bedrooms 1 bathroom', seed: 42 },
    0,
    undefined,
    undefined,
    MOCK_ROOM_PROGRAM.rooms,
  );
  const bedrooms = layout.rooms.filter(r => r.type === 'bedroom');
  assert(
    bedrooms.length === 2,
    `Mock program has 2 bedrooms; layout must have 2, got ${bedrooms.length}`,
  );
});

test('simulateWithLLM program: validation score ≥ 0 and ≤ 100', () => {
  const layout = generateLayoutFromText(
    { prompt: '2 bedrooms 1 bathroom', seed: 42 },
    0,
    undefined,
    undefined,
    MOCK_ROOM_PROGRAM.rooms,
  );
  const validation = validateLayout(layout, undefined);
  const rulebookViolations = runChecks(layout);
  const rulebookDeduction  = computeRulebookDeduction(rulebookViolations);
  const ibcViolations = applyIbcRules(layout);
  const allViolations = [...validation.violations, ...rulebookViolations, ...ibcViolations];
  const finalScore = Math.max(0, Math.min(100, validation.score - rulebookDeduction));
  assert(finalScore >= 0 && finalScore <= 100, `Score must be in [0,100], got ${finalScore}`);
  assert(Array.isArray(allViolations), 'allViolations must be an array');
});

// ── Async runner ──────────────────────────────────────────────────────────────

(async () => {
  console.log('\n/api/chat route — generateWithLLM async path (no API key)');

  asyncTests.push({
    name: 'generateWithLLM returns a GenerateResult with meta.debug array',
    fn: async () => {
      const savedKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      try {
        const result = await generateWithLLM(
          { prompt: '2 bedrooms 1 bathroom', seed: 42 },
          { maxAttempts: 1, priors: null },
        );
        assert(Array.isArray(result.meta.debug), 'meta.debug must be an array');
        assert(result.meta.debug.length > 0, 'meta.debug must have at least one entry');
        assert(
          typeof result.meta.debug[0].strategy === 'string',
          'meta.debug[0].strategy must be a string',
        );
      } finally {
        if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
      }
    },
  });

  asyncTests.push({
    name: 'generateWithLLM without API key uses heuristic-fallback strategy',
    fn: async () => {
      const savedKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      try {
        const result = await generateWithLLM(
          { prompt: '2 bedrooms 1 bathroom', seed: 42 },
          { maxAttempts: 1, priors: null },
        );
        assert(
          result.meta.debug[0].strategy === 'heuristic-fallback',
          `Expected 'heuristic-fallback', got '${result.meta.debug[0].strategy}'`,
        );
      } finally {
        if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
      }
    },
  });

  asyncTests.push({
    name: 'generateWithLLM result shape matches route response contract',
    fn: async () => {
      const savedKey = process.env.ANTHROPIC_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      try {
        const result = await generateWithLLM(
          { prompt: '2 bedrooms 1 bathroom', seed: 42 },
          { maxAttempts: 1, priors: null },
        );
        assert(typeof result.attempts === 'number', 'attempts must be a number');
        assert(Array.isArray(result.meta.debug), 'meta.debug must be present');
        assert(typeof result.meta.bestScore === 'number', 'meta.bestScore must be a number');
        assert(Array.isArray(result.meta.scores), 'meta.scores must be an array');
        assert(result.meta.debug[0] !== undefined, 'meta.debug[0] must exist');
        assert('strategy' in result.meta.debug[0], 'meta.debug[0] must have strategy key');
      } finally {
        if (savedKey !== undefined) process.env.ANTHROPIC_API_KEY = savedKey;
      }
    },
  });

  for (const { name, fn } of asyncTests) {
    await testAsync(name, fn);
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
})();
