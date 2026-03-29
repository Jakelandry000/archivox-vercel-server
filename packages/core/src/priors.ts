import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Shape of datasets/core-v1/priors.json (written by build-priors.mjs).
 * All fields optional to tolerate partial / future schema changes.
 */
export interface Priors {
  schemaVersion: string;
  generatedAt?: string;
  totalPlans: number;
  totalRooms: number;
  totalEdges: number;
  /** Room label → occurrence count across all training plans. */
  labelFreq: Record<string, number>;
  /** "labelA|labelB" (alphabetically sorted) → adjacency count. */
  adjacencyFreq: Record<string, number>;
}

// ── Path resolution ────────────────────────────────────────────────────────────

// From packages/core/src/ go up three levels to repo root, then into datasets/.
const DEFAULT_PRIORS_REL = '../../../datasets/core-v1/priors.json';

function resolveDefaultPath(): string {
  const envPath = typeof process !== 'undefined' ? process.env?.ARCHIVOX_PRIORS_PATH : undefined;
  if (envPath) return envPath;
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return resolve(__dirname, DEFAULT_PRIORS_REL);
  } catch {
    return DEFAULT_PRIORS_REL;
  }
}

// ── Cache ──────────────────────────────────────────────────────────────────────

let _cache: { resolvedPath: string; priors: Priors } | null = null;

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Load priors from a JSON file (cached after first successful load).
 *
 * - Defaults to ARCHIVOX_PRIORS_PATH env var, then repo datasets/core-v1/priors.json.
 * - Returns null if the file is missing or cannot be parsed; callers must handle null.
 */
export function loadPriors(path?: string): Priors | null {
  const resolved = path ?? resolveDefaultPath();
  if (_cache?.resolvedPath === resolved) return _cache.priors;
  try {
    const raw = readFileSync(resolved, 'utf8');
    const parsed = JSON.parse(raw) as Priors;
    _cache = { resolvedPath: resolved, priors: parsed };
    return parsed;
  } catch {
    return null;
  }
}

/** Raw adjacency count for a label pair (order-independent). */
export function getAdjacencyCount(priors: Priors, a: string, b: string): number {
  const key = a < b ? `${a}|${b}` : `${b}|${a}`;
  return priors.adjacencyFreq[key] ?? 0;
}

/**
 * Normalized adjacency score in [0, 1] = count / totalEdges.
 * Returns 0 if totalEdges is 0 or the pair is absent.
 */
export function getAdjacencyScore(priors: Priors, a: string, b: string): number {
  if (priors.totalEdges <= 0) return 0;
  return getAdjacencyCount(priors, a, b) / priors.totalEdges;
}

/** Raw label frequency count from training data. */
export function getLabelCount(priors: Priors, label: string): number {
  return priors.labelFreq[label] ?? 0;
}
