/**
 * Batch validation script — scripts/batch_validate.ts
 * Usage: npx tsx scripts/batch_validate.ts [--count 200] [--out docs/batch_results_200.jsonl]
 *
 * Generates N layouts with varied prompts/seeds, validates each with the
 * full rule suite (base validator + RB rule checks), then prints a report.
 * With --out <path>, also writes one JSONL record per layout to that file.
 * No new deps required — uses only existing packages via npx tsx.
 */

import fs from 'node:fs';
import path from 'node:path';
import { generateAndValidate } from '../packages/generator/src/index.js';
import { runChecks } from '../packages/core/src/ruleChecks.js';

// ── Prompt corpus ─────────────────────────────────────────────────────────────

const PROMPTS: Array<{ label: string; input: Parameters<typeof generateAndValidate>[0] }> = [
  { label: 'small-1bed',     input: { prompt: '1 bedroom 1 bathroom',              width: 28, depth: 22 } },
  { label: 'mid-2bed',       input: { prompt: '2 bedrooms 2 bathrooms',            width: 40, depth: 30 } },
  { label: 'mid-3bed',       input: { prompt: '3 bedrooms 2 bathrooms',            width: 50, depth: 36 } },
  { label: 'large-4bed',     input: { prompt: '4 bedrooms 3 bathrooms',            width: 60, depth: 48 } },
  { label: 'garage-2bed',    input: { prompt: '2 bedrooms 1 bathroom garage',      width: 44, depth: 34 } },
  { label: 'garage-3bed',    input: { prompt: '3 bedrooms 2 bathrooms garage',     width: 55, depth: 42 } },
  { label: 'office-2bed',    input: { prompt: '2 bedrooms 1 bathroom office',      width: 42, depth: 32 } },
  { label: 'laundry-2bed',   input: { prompt: '2 bedrooms 2 bathrooms laundry',    width: 44, depth: 32 } },
  { label: 'garage-laundry', input: { prompt: '3 bedrooms 2 bathrooms garage laundry', width: 58, depth: 44 } },
  { label: 'tiny',           input: { prompt: '1 bedroom 1 bathroom',              width: 18, depth: 14 } },
  { label: 'wide-3bed',      input: { prompt: '3 bedrooms 2 bathrooms',            width: 70, depth: 24 } },
  { label: 'square-3bed',    input: { prompt: '3 bedrooms 2 bathrooms',            width: 45, depth: 45 } },
  { label: 'meters-2bed',    input: { prompt: '2 bedrooms 2 bathrooms', units: 'meters', width: 14, depth: 10 } },
  { label: 'meters-3bed',    input: { prompt: '3 bedrooms 2 bathrooms', units: 'meters', width: 18, depth: 13 } },
  { label: 'big-6bed',       input: { prompt: '6 bedrooms 4 bathrooms office laundry', width: 80, depth: 60 } },
  { label: 'cramped-3bed',   input: { prompt: '3 bedrooms 2 bathrooms',            width: 32, depth: 24 } },
  { label: 'full-featured',  input: { prompt: '4 bedrooms 3 bathrooms office laundry garage', width: 65, depth: 52 } },
  { label: 'all-default',    input: { prompt: '' } },
  { label: 'narrow-long',    input: { prompt: '2 bedrooms 1 bathroom',             width: 25, depth: 60 } },
  { label: 'large-garage',   input: { prompt: '2 bedrooms 2 bathrooms garage',     width: 36, depth: 28 } },
];

// ── CLI args: --count, --out ──────────────────────────────────────────────────

const countArg = process.argv.indexOf('--count');
const N = countArg !== -1 ? parseInt(process.argv[countArg + 1] ?? '200', 10) : 200;

const outArg = process.argv.indexOf('--out');
const outFile: string | null = outArg !== -1 ? (process.argv[outArg + 1] ?? null) : null;

// ── Run batch ─────────────────────────────────────────────────────────────────

type RunRecord = {
  id: string;
  seed: number;
  template: string;
  prompt: string;
  baseScore: number;
  violations: Array<{ code: string; severity: string }>;
  hasErrors: boolean;
};

const results: RunRecord[] = [];

for (let i = 0; i < N; i++) {
  const template = PROMPTS[i % PROMPTS.length];
  const seed = 1000 + i; // deterministic, reproducible

  const gen = generateAndValidate(
    { ...template.input, seed },
    { maxAttempts: 1, priors: null }, // single attempt so we see raw generator output
  );

  // Merge base violations + RB rule check violations
  const rbViolations = runChecks(gen.layout);
  const allViolations = [
    ...gen.validation.violations.map(v => ({ code: v.code, severity: v.severity })),
    ...rbViolations.map(v => ({ code: v.code, severity: v.severity })),
  ];

  results.push({
    id: `${template.label}__s${seed}`,
    seed,
    template: template.label,
    prompt: template.input.prompt,
    baseScore: gen.validation.score,
    violations: allViolations,
    hasErrors: allViolations.some(v => v.severity === 'error'),
  });
}

// ── Analysis ──────────────────────────────────────────────────────────────────

const passCount = results.filter(r => !r.hasErrors && r.baseScore >= 70).length;
const zeroViolCount = results.filter(r => r.violations.length === 0).length;

// Count by code
const codeCount: Record<string, { count: number; severity: string }> = {};
for (const r of results) {
  for (const v of r.violations) {
    if (!codeCount[v.code]) codeCount[v.code] = { count: 0, severity: v.severity };
    codeCount[v.code].count++;
  }
}

// Sort descending by count
const sortedCodes = Object.entries(codeCount).sort((a, b) => b[1].count - a[1].count);

// Co-occurrence: per layout, which pairs appear together?
const pairCount: Record<string, number> = {};
for (const r of results) {
  const unique = [...new Set(r.violations.map(v => v.code))].sort();
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const key = `${unique[i]} + ${unique[j]}`;
      pairCount[key] = (pairCount[key] ?? 0) + 1;
    }
  }
}
const sortedPairs = Object.entries(pairCount).sort((a, b) => b[1] - a[1]);

// Example layout IDs for top 3 failing checks
const top3 = sortedCodes.slice(0, 3).map(([code]) => code);
const examplesMap: Record<string, string[]> = {};
for (const code of top3) {
  examplesMap[code] = results
    .filter(r => r.violations.some(v => v.code === code))
    .slice(0, 3)
    .map(r => r.id);
}

// Score distribution
const scoreGroups = { '90-100': 0, '70-89': 0, '50-69': 0, '0-49': 0 };
for (const r of results) {
  const s = r.baseScore;
  if (s >= 90) scoreGroups['90-100']++;
  else if (s >= 70) scoreGroups['70-89']++;
  else if (s >= 50) scoreGroups['50-69']++;
  else scoreGroups['0-49']++;
}

// ── Print report ──────────────────────────────────────────────────────────────

const pct = (n: number) => ((n / N) * 100).toFixed(1) + '%';

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  ArchiVox — Batch Validation Report');
console.log(`  N=${N} layouts | fixed seeds 1000..${999 + N}`);
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('── Overall ──────────────────────────────────────────────────');
console.log(`  Zero violations:     ${zeroViolCount} / ${N}  (${pct(zeroViolCount)})`);
console.log(`  No errors + score≥70 (pass): ${passCount} / ${N}  (${pct(passCount)})`);
console.log('  Score distribution:');
for (const [range, count] of Object.entries(scoreGroups)) {
  const bar = '█'.repeat(Math.round((count / N) * 40));
  console.log(`    ${range.padStart(7)}: ${String(count).padStart(4)}  ${bar}`);
}

console.log('\n── Top 15 Failing Checks ────────────────────────────────────');
console.log('  Rank  Code                              Count  /N     Sev');
console.log('  ────  ────────────────────────────────  ─────  ─────  ───');
for (const [code, { count, severity }] of sortedCodes.slice(0, 15)) {
  const sev = severity === 'error' ? 'ERR' : severity === 'warning' ? 'WRN' : 'INF';
  const rank = (sortedCodes.findIndex(([c]) => c === code) + 1).toString().padStart(4);
  console.log(`  ${rank}  ${code.padEnd(32)}  ${String(count).padStart(5)}  ${pct(count).padStart(5)}  ${sev}`);
}

console.log('\n── Top 10 Co-Occurring Failure Pairs ────────────────────────');
console.log('  Count  Pair');
for (const [pair, count] of sortedPairs.slice(0, 10)) {
  console.log(`  ${String(count).padStart(5)}  ${pair}`);
}

console.log('\n── Example Layout IDs for Top 3 Failing Checks ─────────────');
for (const code of top3) {
  console.log(`  ${code}:`);
  for (const id of examplesMap[code]) {
    console.log(`    • ${id}`);
  }
}

console.log('\n── Recommended Repair Priorities ────────────────────────────');
// Simple heuristic: sort by count*severity_weight
const weights: Record<string, number> = { error: 4, warning: 2, info: 1 };
const prioritized = sortedCodes
  .map(([code, { count, severity }]) => ({
    code,
    count,
    severity,
    score: count * (weights[severity] ?? 1),
  }))
  .sort((a, b) => b.score - a.score)
  .slice(0, 8);

for (const { code, count, severity, score } of prioritized) {
  const sev = severity === 'error' ? 'ERR' : severity === 'warning' ? 'WRN' : 'INF';
  console.log(`  [${sev}] ${code.padEnd(36)}  ${String(count).padStart(4)}/${N}  impact=${score}`);
}

console.log('\n═══════════════════════════════════════════════════════════════\n');

// ── Optional JSONL output ─────────────────────────────────────────────────────

if (outFile) {
  const absOut = path.resolve(outFile);
  const dir = path.dirname(absOut);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString();
  const lines = results.map(r => JSON.stringify({
    id: r.id,
    seed: r.seed,
    template: r.template,
    score: r.baseScore,
    violations: r.violations.map(v => ({ code: v.code, severity: v.severity, count: 1 })),
    timestamp,
  }));

  fs.writeFileSync(absOut, lines.join('\n') + '\n', 'utf8');
  console.log(`JSONL written → ${absOut}  (${lines.length} records)\n`);
}
