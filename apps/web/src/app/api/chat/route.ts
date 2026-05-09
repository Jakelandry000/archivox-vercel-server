import { NextResponse } from 'next/server';
import { generateWithLLM } from '@archivox/generator';
import { generateAutoCadScr, generateFloorPlanSvg } from '@archivox/engines';
import { loadPriors, applyIbcRules, registerRulebookV1Checks, runChecks, computeRulebookDeduction } from '@archivox/core';

// Register all 103 Rule Book v1 checks once per cold start.
registerRulebookV1Checks();

// Load once per cold start; null if datasets/core-v1/priors.json is absent.
const _priors = loadPriors();
if (!_priors) {
  console.warn('[api/chat] Priors file not found; layout scoring will run without priors.');
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const prompt = String(body?.prompt ?? '').slice(0, 2000);

  if (!prompt.trim()) {
    return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
  }

  const { layout, validation, attempts, meta: llmMeta } = await generateWithLLM(
    { prompt },
    { scoreThreshold: 70, maxAttempts: 4, priors: _priors }
  );

  // Run Rule Book v1 checks (R-001–R-103) and fold their deductions into score.
  const rulebookViolations = runChecks(layout);
  const rulebookDeduction   = computeRulebookDeduction(rulebookViolations);
  const rulebookScoreAdjustment = -rulebookDeduction;

  // Append IBC soft violations (warnings/info only).
  const ibcViolations = applyIbcRules(layout);

  const allViolations = [
    ...validation.violations,
    ...rulebookViolations,
    ...ibcViolations,
  ];

  // Recompute score to include rulebook deductions.  The generator's internal
  // loop used the base score (base violations only) for attempt comparison;
  // this final score is what clients and downstream consumers receive.
  const finalScore = Math.max(0, Math.min(100, validation.score + rulebookScoreAdjustment));

  const validationWithIbc = {
    ...validation,
    score: finalScore,
    violations: allViolations,
    rulebookScoreAdjustment,
  };

  const { svg } = generateFloorPlanSvg(layout);
  const { script } = generateAutoCadScr(layout);

  // Build priors metadata (aggregate counts only — no raw dataset content).
  const priorsMeta = _priors
    ? {
        loaded: true,
        labelsCount: Object.keys(_priors.labelFreq).length,
        adjacencyPairsCount: Object.keys(_priors.adjacencyFreq).length,
        topLabels: Object.entries(_priors.labelFreq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([label]) => label),
      }
    : { loaded: false, labelsCount: 0, adjacencyPairsCount: 0, topLabels: [] as string[] };

  return NextResponse.json({
    prompt,
    layout,
    svg,
    script,
    validation: validationWithIbc,
    priorsMeta,
    meta: {
      attempts,
      debug: llmMeta.debug,
      notes: [
        'Layout generated via LLM planner (Claude) when ANTHROPIC_API_KEY is set.',
        'Falls back to deterministic heuristic when API key is absent or call fails.',
      ],
    },
  });
}
