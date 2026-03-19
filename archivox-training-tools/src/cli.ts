#!/usr/bin/env node
/**
 * ArchiVox Training Tools CLI
 *
 * Subcommands:
 *   ingest    --input <path> --corpus <path> [--runTag <tag>] [--maxFiles N] [--dryRun]
 *   validate  --corpus <path>
 *   summarize --corpus <path>
 */

import * as fs from 'fs';
import * as path from 'path';
import { runIngest } from './ingest';
import { listCorpusPlans, readPlanSpec, readGraphSpec, readPlanMetrics, getPlanPaths } from './corpus';
import { validatePlan } from './validation';
import { IngestConfig } from './types';
import { TOOL_VERSION } from './version';

const HELP = `
archivox-training-tools v${TOOL_VERSION}

Usage:
  node dist/cli.js <command> [options]

Commands:
  ingest     Ingest source files into a corpus
  validate   Re-run validation on an existing corpus
  summarize  Print corpus summary (counts, warnings)

ingest options:
  --input    <path>    Path to source file, directory, or ZIP (required)
  --corpus   <path>    Path to corpus output directory (required)
  --runTag   <string>  Human-readable tag for this run (optional)
  --maxFiles <N>       Limit number of files processed (optional)
  --dryRun             Discover + manifest only; skip writing derived outputs

validate options:
  --corpus   <path>    Path to existing corpus (required)

summarize options:
  --corpus   <path>    Path to existing corpus (required)

Global:
  --help               Show this help message
`.trim();

// ─── Arg parsing ─────────────────────────────────────────────────────────────

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') {
      args['help'] = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else if (!arg.startsWith('-')) {
      args['command'] = arg;
    }
  }
  return args;
}

function requireArg(args: Args, key: string, command: string): string {
  const val = args[key];
  if (!val || typeof val !== 'string') {
    console.error(`[error] --${key} is required for the "${command}" command.`);
    process.exit(1);
  }
  return val;
}

// ─── ingest ──────────────────────────────────────────────────────────────────

async function cmdIngest(args: Args): Promise<void> {
  const inputPath = requireArg(args, 'input', 'ingest');
  const corpusPath = requireArg(args, 'corpus', 'ingest');
  const runTag = typeof args['runTag'] === 'string' ? args['runTag'] : null;
  const maxFilesRaw = args['maxFiles'];
  const maxFiles =
    typeof maxFilesRaw === 'string' && /^\d+$/.test(maxFilesRaw)
      ? parseInt(maxFilesRaw, 10)
      : null;
  const dryRun = args['dryRun'] === true;

  const config: IngestConfig = {
    inputPath: path.resolve(inputPath),
    corpusPath: path.resolve(corpusPath),
    runTag,
    maxFiles,
    dryRun,
    adjacencyThreshold: 50,   // 50 units (mm by default)
    labelMaxDistance: 500,    // 500 units fallback label search radius
  };

  await runIngest(config);
}

// ─── validate ────────────────────────────────────────────────────────────────

async function cmdValidate(args: Args): Promise<void> {
  const corpusPath = requireArg(args, 'corpus', 'validate');
  const resolved = path.resolve(corpusPath);

  const planIds = listCorpusPlans(resolved);
  if (planIds.length === 0) {
    console.log(`[validate] No plans found in corpus: ${resolved}`);
    return;
  }

  console.log(`[validate] Validating ${planIds.length} plan(s) in ${resolved}`);

  let totalWarnings = 0;
  let totalErrors = 0;

  for (const planId of planIds) {
    const plan = readPlanSpec(resolved, planId);
    const graph = readGraphSpec(resolved, planId);
    const metrics = validatePlan(plan, graph);
    totalWarnings += metrics.warnings.length;
    totalErrors += metrics.errors.length;

    // Write updated metrics.json back to corpus.
    const metricsPath = getPlanPaths(resolved, planId).metricsJson;
    fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2), 'utf-8');

    console.log(
      `  ${planId.slice(0, 12)}… warnings=${metrics.warnings.length} errors=${metrics.errors.length}` +
        ` labels=${metrics.labelCoveragePercent.toFixed(1)}%` +
        ` components=${metrics.counts.components ?? '?'}`,
    );
  }

  console.log(`[validate] Total: warnings=${totalWarnings} errors=${totalErrors}`);
}

// ─── summarize ───────────────────────────────────────────────────────────────

async function cmdSummarize(args: Args): Promise<void> {
  const corpusPath = requireArg(args, 'corpus', 'summarize');
  const resolved = path.resolve(corpusPath);

  const planIds = listCorpusPlans(resolved);
  const countByType: Record<string, number> = {};
  let totalRooms = 0;
  let totalLabeled = 0;
  let totalWarnings = 0;
  let totalErrors = 0;
  let totalEdges = 0;
  let totalComponents = 0;
  let plansWithMetrics = 0;

  for (const planId of planIds) {
    const plan = readPlanSpec(resolved, planId);
    const type = plan.source.type;
    countByType[type] = (countByType[type] ?? 0) + 1;
    totalRooms += plan.rooms.length;
    totalLabeled += plan.rooms.filter((r) => r.label !== null).length;
    totalWarnings += plan.qualitySignals.filter((s) => s.level === 'warning').length;
    totalErrors += plan.qualitySignals.filter((s) => s.level === 'error').length;

    // Enrich with metrics.json when available.
    try {
      const metrics = readPlanMetrics(resolved, planId);
      totalEdges += metrics.counts.edgesTotal ?? 0;
      totalComponents += metrics.counts.components ?? 0;
      plansWithMetrics++;
    } catch {
      // metrics.json may not exist for older corpus entries.
    }
  }

  // List manifests
  const manifestDir = path.join(resolved, 'manifests');
  const manifests = fs.existsSync(manifestDir) ? fs.readdirSync(manifestDir).filter((f) => f.endsWith('.json')) : [];

  console.log('');
  console.log(`ArchiVox Corpus Summary`);
  console.log(`  Corpus path : ${resolved}`);
  console.log(`  Plans       : ${planIds.length}`);
  console.log(`  By type     : ${JSON.stringify(countByType)}`);
  console.log(`  Total rooms : ${totalRooms}`);
  console.log(`  Labeled     : ${totalLabeled} / ${totalRooms} (${totalRooms > 0 ? ((totalLabeled / totalRooms) * 100).toFixed(1) : '0.0'}%)`);
  if (plansWithMetrics > 0) {
    console.log(`  Total edges : ${totalEdges}`);
    console.log(`  Components  : ${totalComponents} (across ${plansWithMetrics} plans with metrics)`);
  }
  console.log(`  Warnings    : ${totalWarnings}`);
  console.log(`  Errors      : ${totalErrors}`);
  console.log(`  Manifests   : ${manifests.length}`);
  console.log('');
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);

  if (args['help'] || argv.length === 0) {
    console.log(HELP);
    process.exit(0);
  }

  const command = args['command'] as string | undefined;

  switch (command) {
    case 'ingest':
      await cmdIngest(args);
      break;
    case 'validate':
      await cmdValidate(args);
      break;
    case 'summarize':
      await cmdSummarize(args);
      break;
    default:
      console.error(`[error] Unknown command: "${command ?? ''}"`);
      console.error('Run with --help for usage.');
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('[fatal]', (err as Error).message);
  process.exit(1);
});
