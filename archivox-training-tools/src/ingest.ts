/**
 * Main ingest orchestrator.
 *
 * For each discovered file:
 *  1. Parse (DXF → full; PDF/image → stub)
 *  2. Build PlanSpec + GraphSpec
 *  3. Validate + build metrics
 *  4. Write artifacts (unless dryRun)
 *  5. Accumulate manifest entry
 *
 * Deduplication: if two files in the same run share the same sha256, only the
 * first is written to disk; subsequent occurrences are recorded in the manifest
 * with deduped:true.
 */

import * as path from 'path';
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
import { warnIfSuspiciousPath } from './safety';
import { buildManifest, writeManifest, generateRunId } from './manifest';

function planIdFromFile(filePath: string): string {
  return sha256File(filePath);
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
  if (config.dryRun) log('[ingest] DRY RUN — no derived outputs will be written (manifest will still be written).');

  // ── Discovery ─────────────────────────────────────────────────────────────
  log('[ingest] Discovering files...');
  const { files, tmpDirs, inputType, stagingPath } = discoverFiles(
    config.inputPath,
    config.maxFiles ?? undefined,
  );

  const skipped = files.filter((f) => f.skipped);
  const toProcess = files.filter((f) => !f.skipped);

  log(
    `[ingest] Discovered ${files.length} file(s): ${toProcess.length} to process, ${skipped.length} skipped.`,
  );
  for (const s of skipped) {
    log(`  SKIP  ${s.relativePath} — ${s.skipReason}`);
  }

  // Always init corpus so manifests/ directory exists (even on dryRun).
  initCorpus(config.corpusPath);
  const suspiciousWarning = warnIfSuspiciousPath(config.corpusPath);
  if (suspiciousWarning) logErr(suspiciousWarning);

  // ── Per-file processing ───────────────────────────────────────────────────
  const ingestedPlans: ManifestPlanEntry[] = [];
  // Track plan_ids seen this run for within-run deduplication.
  const seenPlanIds = new Set<string>();

  for (const file of toProcess) {
    log(`[ingest] Processing: ${file.relativePath} (${file.type})`);

    let planSpec: PlanSpec;
    let graphSpec: GraphSpec;
    let metrics: PlanMetrics;

    try {
      const planId = planIdFromFile(file.path);
      const sha256 = planId; // plan_id IS the sha256

      // ── Deduplicate within this run ──────────────────────────────────────
      if (seenPlanIds.has(planId)) {
        log(`  DEDUP ${file.relativePath} — sha256 ${planId.slice(0, 12)}… already processed this run`);
        ingestedPlans.push({
          planId,
          sourceName: path.basename(file.path),
          sourceType: file.type as string,
          sha256,
          bytes: file.bytes,
          artifactPaths: {
            planJson: '(deduped)',
            graphJson: '(deduped)',
            metricsJson: '(deduped)',
          },
          warnings: [],
          errors: [],
          deduped: true,
        });
        continue;
      }

      seenPlanIds.add(planId);

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
          bytes: file.bytes,
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
          bytes: file.bytes,
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
      logErr(`  ERROR processing ${file.relativePath}: ${(err as Error).message}`);
      file.skipped = true;
      file.skipReason = `Processing error: ${(err as Error).message}`;
    }
  }

  // ── Manifest ──────────────────────────────────────────────────────────────
  const inputInfo = {
    originalPath: config.inputPath,
    type: inputType,
    stagingPath,
  };

  const manifest = buildManifest(runId, config, files, ingestedPlans, inputInfo);

  // Always write manifest (even on dryRun) — manifests/ dir was created by initCorpus above.
  const manifestPath = writeManifest(config.corpusPath, manifest);
  log(`[ingest] Manifest written: ${manifestPath}`);

  if (config.dryRun) {
    log('[ingest] DRY RUN complete — no derived outputs written.');
    log(JSON.stringify(manifest.summary, null, 2));
  }

  log(
    `[ingest] Done. Ingested: ${manifest.summary.totalIngested}` +
      ` Deduped: ${manifest.summary.totalDeduped}` +
      ` Warnings: ${manifest.summary.totalWarnings}` +
      ` Errors: ${manifest.summary.totalErrors}`,
  );

  cleanupTmpDirs(tmpDirs);
  return manifestPath;
}
