/**
 * Phase B integration tests:
 *   1. Deterministic discovery + maxFiles selection
 *   2. Within-run deduplication
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { discoverFiles } from '../discovery';
import { runIngest } from '../ingest';
import { IngestConfig } from '../types';

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'archivox-test-'));
}

function writeFile(dir: string, name: string, content: string | Buffer): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, content);
  return p;
}

// ── test fixtures ─────────────────────────────────────────────────────────────

const tmpDirs: string[] = [];

function createTmpDir(): string {
  const d = makeTmpDir();
  tmpDirs.push(d);
  return d;
}

afterEach(() => {
  for (const d of tmpDirs.splice(0)) {
    try {
      fs.rmSync(d, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

// ── Test 1: Deterministic discovery + maxFiles ────────────────────────────────

describe('discoverFiles — deterministic maxFiles selection', () => {
  it('always selects the first N files in sorted (alphabetical) order', () => {
    const inputDir = createTmpDir();

    // Create 5 PNG files named out-of-alpha order so we can verify sorting.
    // Using PNG (image stub) avoids any parser throwing on arbitrary content.
    for (const name of ['echo.png', 'bravo.png', 'alpha.png', 'delta.png', 'charlie.png']) {
      writeFile(inputDir, name, `dummy content for ${name}`);
    }

    const result = discoverFiles(inputDir, 3);
    const processed = result.files.filter((f) => !f.skipped);

    // Exactly 3 files should be processed (maxFiles=3)
    expect(processed).toHaveLength(3);

    // They must be the first 3 alphabetically
    expect(processed.map((f) => f.relativePath)).toEqual(['alpha.png', 'bravo.png', 'charlie.png']);
  });

  it('produces the same selection on a second independent call (stable sort)', () => {
    const inputDir = createTmpDir();

    for (const name of ['z.png', 'a.png', 'm.png', 'b.png', 'n.png']) {
      writeFile(inputDir, name, `content ${name}`);
    }

    const run1 = discoverFiles(inputDir, 2).files.filter((f) => !f.skipped).map((f) => f.relativePath);
    const run2 = discoverFiles(inputDir, 2).files.filter((f) => !f.skipped).map((f) => f.relativePath);

    expect(run1).toEqual(run2);
    expect(run1).toEqual(['a.png', 'b.png']);
  });
});

// ── Test 2: Within-run deduplication ─────────────────────────────────────────

describe('runIngest — within-run deduplication', () => {
  it('writes one plan directory for two files with identical bytes, marks second as deduped', async () => {
    const inputDir = createTmpDir();
    const corpusDir = createTmpDir();

    // Two PNG files with identical content → same sha256 → same plan_id
    const identicalContent = Buffer.from('identical-png-bytes-for-dedup-test');
    writeFile(inputDir, 'plan-a.png', identicalContent);
    writeFile(inputDir, 'plan-b.png', identicalContent);

    const config: IngestConfig = {
      inputPath: inputDir,
      corpusPath: corpusDir,
      runTag: 'test-dedupe',
      maxFiles: null,
      dryRun: false,
      adjacencyThreshold: 50,
      labelMaxDistance: 500,
    };

    const manifestPath = await runIngest(config);

    // Exactly ONE plan directory must exist (dedupe prevents double-write)
    const plansDir = path.join(corpusDir, 'plans');
    const planIds = fs.readdirSync(plansDir);
    expect(planIds).toHaveLength(1);

    // Manifest was written
    expect(fs.existsSync(manifestPath)).toBe(true);

    // Manifest records both files: one normal, one deduped
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.ingestedPlans).toHaveLength(2);

    const dedupedEntries = manifest.ingestedPlans.filter((p: { deduped?: boolean }) => p.deduped === true);
    const normalEntries = manifest.ingestedPlans.filter((p: { deduped?: boolean }) => !p.deduped);
    expect(dedupedEntries).toHaveLength(1);
    expect(normalEntries).toHaveLength(1);

    // Summary counts reflect deduplication
    expect(manifest.summary.totalIngested).toBe(1);
    expect(manifest.summary.totalDeduped).toBe(1);
  });

  it('dryRun still writes the manifest without creating plan directories', async () => {
    const inputDir = createTmpDir();
    const corpusDir = createTmpDir();

    writeFile(inputDir, 'floor-plan.png', Buffer.from('some-plan-bytes'));

    const config: IngestConfig = {
      inputPath: inputDir,
      corpusPath: corpusDir,
      runTag: 'test-dryrun',
      maxFiles: null,
      dryRun: true,
      adjacencyThreshold: 50,
      labelMaxDistance: 500,
    };

    const manifestPath = await runIngest(config);

    // Manifest must have been written (dryRun no longer suppresses it)
    expect(fs.existsSync(manifestPath)).toBe(true);

    // No per-plan directories should be created
    const plansDir = path.join(corpusDir, 'plans');
    const planIds = fs.existsSync(plansDir) ? fs.readdirSync(plansDir) : [];
    expect(planIds).toHaveLength(0);

    // Manifest records the dry-run flag
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.config.dryRun).toBe(true);
    expect(manifest.ingestedPlans[0].artifactPaths.planJson).toBe('(dry-run)');
  });
});
