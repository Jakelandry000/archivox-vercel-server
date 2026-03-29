import * as fs from 'fs';
import * as path from 'path';
import { PlanSpec, GraphSpec, PlanMetrics } from './types';
import { assertSafeOutputPath, warnIfSuspiciousPath } from './safety';
import { sha256Buffer, sha256File } from './utils/hash';

export interface CorpusPaths {
  sourceDir: string;
  derivedDir: string;
  planJson: string;
  graphJson: string;
  metricsJson: string;
  previewPng: string;
}

/**
 * Returns the canonical directory layout for a plan inside the corpus.
 * corpus/plans/<planId>/source/ and corpus/plans/<planId>/derived/
 */
export function getPlanPaths(corpusPath: string, planId: string): CorpusPaths {
  const base = path.join(corpusPath, 'plans', planId);
  const sourceDir = path.join(base, 'source');
  const derivedDir = path.join(base, 'derived');
  return {
    sourceDir,
    derivedDir,
    planJson: path.join(derivedDir, 'plan.json'),
    graphJson: path.join(derivedDir, 'graph.json'),
    metricsJson: path.join(derivedDir, 'metrics.json'),
    previewPng: path.join(derivedDir, 'preview.png'),
  };
}

// Re-exported for backwards compatibility — primary implementation is in utils/hash.ts
export { sha256Buffer, sha256File } from './utils/hash';

/**
 * Writes all derived artifacts for a plan to the corpus directory.
 * Validates the output path is not inside a web-served directory.
 */
export function writePlanArtifacts(
  corpusPath: string,
  planId: string,
  sourceFilePath: string,
  plan: PlanSpec,
  graph: GraphSpec,
  metrics: PlanMetrics,
): CorpusPaths {
  // Safety guard
  assertSafeOutputPath(corpusPath);
  const warning = warnIfSuspiciousPath(corpusPath);
  if (warning) {
    process.stderr.write(`${warning}\n`);
  }

  const paths = getPlanPaths(corpusPath, planId);

  fs.mkdirSync(paths.sourceDir, { recursive: true });
  fs.mkdirSync(paths.derivedDir, { recursive: true });

  // Copy original source file
  const ext = path.extname(sourceFilePath);
  const destSource = path.join(paths.sourceDir, `original${ext}`);
  fs.copyFileSync(sourceFilePath, destSource);

  // Write derived JSON artifacts
  fs.writeFileSync(paths.planJson, JSON.stringify(plan, null, 2), 'utf-8');
  fs.writeFileSync(paths.graphJson, JSON.stringify(graph, null, 2), 'utf-8');
  fs.writeFileSync(paths.metricsJson, JSON.stringify(metrics, null, 2), 'utf-8');

  return paths;
}

/**
 * Ensures corpus top-level directories exist.
 */
export function initCorpus(corpusPath: string): void {
  assertSafeOutputPath(corpusPath);
  fs.mkdirSync(path.join(corpusPath, 'manifests'), { recursive: true });
  fs.mkdirSync(path.join(corpusPath, 'plans'), { recursive: true });
}

/**
 * Reads all plan.json files from the corpus and returns their planIds.
 */
export function listCorpusPlans(corpusPath: string): string[] {
  const plansDir = path.join(corpusPath, 'plans');
  if (!fs.existsSync(plansDir)) return [];
  return fs.readdirSync(plansDir).filter((name) => {
    const planJson = path.join(plansDir, name, 'derived', 'plan.json');
    return fs.existsSync(planJson);
  });
}

/**
 * Reads a PlanSpec from the corpus.
 */
export function readPlanSpec(corpusPath: string, planId: string): PlanSpec {
  const p = getPlanPaths(corpusPath, planId);
  return JSON.parse(fs.readFileSync(p.planJson, 'utf-8')) as PlanSpec;
}

/**
 * Reads a GraphSpec from the corpus.
 */
export function readGraphSpec(corpusPath: string, planId: string): GraphSpec {
  const p = getPlanPaths(corpusPath, planId);
  return JSON.parse(fs.readFileSync(p.graphJson, 'utf-8')) as GraphSpec;
}

/**
 * Reads a PlanMetrics from the corpus.
 */
export function readPlanMetrics(corpusPath: string, planId: string): PlanMetrics {
  const p = getPlanPaths(corpusPath, planId);
  return JSON.parse(fs.readFileSync(p.metricsJson, 'utf-8')) as PlanMetrics;
}
