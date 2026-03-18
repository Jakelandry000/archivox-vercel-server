import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as child_process from 'child_process';
import { IngestManifest, IngestConfig, DiscoveredFile, ManifestPlanEntry } from './types';
import { TOOL_VERSION } from './version';

function getGitCommit(): string | null {
  try {
    return child_process
      .execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

export function generateRunId(runTag?: string | null): string {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = crypto.randomBytes(4).toString('hex');
  return runTag ? `${runTag}-${ts}` : `run-${ts}-${rand}`;
}

export function buildManifest(
  runId: string,
  config: IngestConfig,
  discoveredFiles: DiscoveredFile[],
  ingestedPlans: ManifestPlanEntry[],
): IngestManifest {
  const totalSkipped = discoveredFiles.filter((f) => f.skipped).length;
  const totalWarnings = ingestedPlans.reduce((s, p) => s + p.warnings.length, 0);
  const totalErrors = ingestedPlans.reduce((s, p) => s + p.errors.length, 0);

  return {
    schemaVersion: 'IngestManifest@v1',
    runId,
    timestamp: new Date().toISOString(),
    toolVersion: TOOL_VERSION,
    nodeVersion: process.version,
    platform: process.platform,
    gitCommit: getGitCommit(),
    config,
    discoveredFiles,
    ingestedPlans,
    summary: {
      totalDiscovered: discoveredFiles.length,
      totalSkipped,
      totalIngested: ingestedPlans.length,
      totalWarnings,
      totalErrors,
    },
  };
}

export function writeManifest(corpusPath: string, manifest: IngestManifest): string {
  const dir = path.join(corpusPath, 'manifests');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `ingest-${manifest.runId}.json`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, JSON.stringify(manifest, null, 2), 'utf-8');
  return filepath;
}
