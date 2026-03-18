/**
 * Main ingest orchestrator.
 *
 * For each discovered file:
 *  1. Parse (DXF → full; PDF/image → stub)
 *  2. Build PlanSpec + GraphSpec
 *  3. Validate + build metrics
 *  4. Write artifacts (unless dryRun)
 *  5. Accumulate manifest entry
 */

import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';

import { IngestConfig, PlanSpec, GraphSpec, PlanMetrics, ManifestPlanEntry, QualitySignal } from './types';
import { TOOL_VERSION, SCHEMA_PLAN, SCHEMA_GRAPH } from './version';
import { discoverFiles, cleanupTmpDirs } from './discovery';
import { parseDxfFile } from './parsers/dxf';
import { parsePdfFile } from './parsers/pdf';
import { parseImageFile } from './parsers/image';
import { buildGraphSpec } from './graph';
import { validatePlan } from './validation';
import { initCorpus, writePlanArtifacts, sha256File } from './corpus';
import { buildManifest, writeManifest, generateRunId } from './manifest';

function planIdFromFile(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 40);
}

function log(msg: string): void {
  process.stdout.write(`${msg}\n`);
}

function logErr(msg: string): void {
  process.stderr.write(`${msg}\n`);
}

/**
 * Run the full ingest pipeline.
 * Returns the path to the written manifest.
 */
export async function runIngest(config: IngestConfig): Promise<string> {
  const runId = generateRunId(config.runTag);
  log(`[ingest] Run ID: ${runId}`);
  log(`[ingest] Input: ${config.inputPath}`);
  log(`[ingest] Corpus: ${config.corpusPath}`);
  if (config.dryRun) log('[ingest] DRY RUN — no derived outputs will be written.');

  // ── Discovery ─────────────────────────────────────────────────────────────
  log('[ingest] Discovering files...');
  const { files, tmpDirs } = discoverFiles(config.inputPath, config.maxFiles ?? undefined);

  const skipped = files.filter((f) => f.skipped);
  const toProcess = files.filter((f) => !f.skipped);

  log(`[ingest] Discovered ${files.length} file(s): ${toProcess.length} to process, ${skipped.length} skipped.`);
  for (const s of skipped) {
    log(`  SKIP  ${path.basename(s.path)} — ${s.skipReason}`);
  }

  if (!config.dryRun) {
    initCorpus(config.corpusPath);
  }

  // ── Per-file processing ───────────────────────────────────────────────────
  const ingestedPlans: ManifestPlanEntry[] = [];

  for (const file of toProcess) {
    log(`[ingest] Processing: ${path.basename(file.path)} (${file.type})`);

    let planSpec: PlanSpec;
    let graphSpec: GraphSpec;
    let metrics: PlanMetrics;

    try {
      const planId = planIdFromFile(file.path);
      const sha256 = sha256File(file.path);
      const now = new Date().toISOString();

      const source = {
        filename: path.basename(file.path),
        type: file.type as 'dxf' | 'pdf' | 'image',
        sha256,
        ingestTimestamp: now,
        toolVersion: TOOL_VERSION,
      };

      let parseWarnings: QualitySignal[] = [];
      let rooms: PlanSpec['rooms'] = [];
      let geometry: PlanSpec['geometry'];
      let labels: PlanSpec['labels'] = [];
      let units: PlanSpec['units'];

      if (file.type === 'dxf') {
        const result = parseDxfFile(file.path, config.labelMaxDistance);
        parseWarnings = result.warnings;
        rooms = result.rooms;
        geometry = result.geometry;
        labels = result.labels;
        units = result.units;
      } else if (file.type === 'pdf') {
        const result = await parsePdfFile(file.path);
        parseWarnings = result.warnings;
        rooms = [];
        geometry = result.geometry;
        labels = result.labels;
        units = result.units;
      } else {
        const result = await parseImageFile(file.path);
        parseWarnings = result.warnings;
        rooms = [];
        geometry = result.geometry;
        labels = result.labels;
        units = result.units;
      }

      planSpec = {
        schemaVersion: SCHEMA_PLAN,
        planId,
        source,
        units,
        geometry,
        labels,
        rooms,
        qualitySignals: parseWarnings,
      };

      graphSpec = buildGraphSpec(planId, rooms, { threshold: config.adjacencyThreshold });

      metrics = validatePlan(planSpec, graphSpec);

      // Merge validation signals back into planSpec
      planSpec.qualitySignals = [
        ...parseWarnings,
        ...metrics.warnings,
        ...metrics.errors,
      ];

      const warnings = planSpec.qualitySignals.filter((s) => s.level === 'warning');
      const errors = planSpec.qualitySignals.filter((s) => s.level === 'error');

      log(
        `  → planId=${planId.slice(0, 12)}… rooms=${rooms.length} labels=${labels.length}` +
          ` warnings=${warnings.length} errors=${errors.length}`,
      );

      if (!config.dryRun) {
        const artifactPaths = writePlanArtifacts(
          config.corpusPath,
          planId,
          file.path,
          planSpec,
          graphSpec,
          metrics,
        );

        ingestedPlans.push({
          planId,
          sourceName: source.filename,
          sourceType: source.type,
          sha256,
          artifactPaths: {
            planJson: artifactPaths.planJson,
            graphJson: artifactPaths.graphJson,
            metricsJson: artifactPaths.metricsJson,
          },
          warnings,
          errors,
        });
      } else {
        ingestedPlans.push({
          planId,
          sourceName: source.filename,
          sourceType: source.type,
          sha256,
          artifactPaths: {
            planJson: '(dry-run)',
            graphJson: '(dry-run)',
            metricsJson: '(dry-run)',
          },
          warnings,
          errors,
        });
      }
    } catch (err) {
      logErr(`  ERROR processing ${path.basename(file.path)}: ${(err as Error).message}`);
      // Mark the file as skipped in the discovered list with an error reason
      file.skipped = true;
      file.skipReason = `Processing error: ${(err as Error).message}`;
    }
  }

  // ── Manifest ──────────────────────────────────────────────────────────────
  const manifest = buildManifest(runId, config, files, ingestedPlans);
  let manifestPath: string;

  if (!config.dryRun) {
    manifestPath = writeManifest(config.corpusPath, manifest);
    log(`[ingest] Manifest written: ${manifestPath}`);
  } else {
    manifestPath = '(dry-run)';
    log('[ingest] DRY RUN complete — manifest not written.');
    log(JSON.stringify(manifest.summary, null, 2));
  }

  log(`[ingest] Done. Ingested: ${manifest.summary.totalIngested}, Warnings: ${manifest.summary.totalWarnings}, Errors: ${manifest.summary.totalErrors}`);

  cleanupTmpDirs(tmpDirs);
  return manifestPath;
}
