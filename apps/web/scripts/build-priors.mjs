#!/usr/bin/env node
/**
 * build-priors.mjs
 *
 * Reads all *.plangraph.json from datasets/core-v1/derived/ and writes
 * datasets/core-v1/priors.json aggregating label frequencies and
 * adjacency pair frequencies.
 *
 * Usage:
 *   node scripts/build-priors.mjs
 *
 * Env vars:
 *   DERIVED_DIR  path to derived/ folder  (default: <repo-root>/datasets/core-v1/derived)
 *   PRIORS_OUT   path for output JSON      (default: <repo-root>/datasets/core-v1/priors.json)
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));

const DERIVED_DIR = process.env.DERIVED_DIR ?? join(__dir, '../../../datasets/core-v1/derived');
const PRIORS_OUT  = process.env.PRIORS_OUT  ?? join(__dir, '../../../datasets/core-v1/priors.json');

function main() {
  let files;
  try {
    files = readdirSync(DERIVED_DIR).filter(f => f.endsWith('.plangraph.json'));
  } catch {
    console.error(`[priors] Cannot read derived dir: ${DERIVED_DIR}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('[priors] No .plangraph.json files found. Run dataset:extract first.');
    process.exit(1);
  }

  console.log(`[priors] Reading ${files.length} plan graphs from ${DERIVED_DIR}`);

  const labelFreq = {};         // label → count across all rooms
  const adjacencyFreq = {};     // "labelA|labelB" → count (sorted alphabetically)
  let totalRooms = 0;
  let totalEdges = 0;
  let totalPlans = 0;

  for (const file of files) {
    let plan;
    try {
      plan = JSON.parse(readFileSync(join(DERIVED_DIR, file), 'utf8'));
    } catch { continue; }

    if (!Array.isArray(plan.rooms)) continue;
    totalPlans++;

    const labelById = {};
    for (const room of plan.rooms) {
      totalRooms++;
      if (room.label) {
        labelFreq[room.label] = (labelFreq[room.label] ?? 0) + 1;
        labelById[room.id] = room.label;
      }
    }

    if (Array.isArray(plan.edges)) {
      for (const edge of plan.edges) {
        totalEdges++;
        const la = labelById[edge.a], lb = labelById[edge.b];
        if (la && lb) {
          const key = la < lb ? `${la}|${lb}` : `${lb}|${la}`;
          adjacencyFreq[key] = (adjacencyFreq[key] ?? 0) + 1;
        }
      }
    }
  }

  // Sort by frequency descending
  const sortedLabels = Object.entries(labelFreq).sort((a,b) => b[1]-a[1]);
  const sortedAdj    = Object.entries(adjacencyFreq).sort((a,b) => b[1]-a[1]);

  const priors = {
    schemaVersion: 'Priors@v1',
    generatedAt: new Date().toISOString(),
    totalPlans,
    totalRooms,
    totalEdges,
    labelFreq: Object.fromEntries(sortedLabels),
    adjacencyFreq: Object.fromEntries(sortedAdj),
  };

  writeFileSync(PRIORS_OUT, JSON.stringify(priors, null, 2));

  console.log(`[priors] Written: ${PRIORS_OUT}`);
  console.log(`[priors] Total plans=${totalPlans} rooms=${totalRooms} edges=${totalEdges}`);
  console.log('[priors] Top 10 labels:', sortedLabels.slice(0,10).map(([k,v])=>`${k}(${v})`).join(', '));
  console.log('[priors] Top 10 adjacency pairs:', sortedAdj.slice(0,10).map(([k,v])=>`${k}(${v})`).join(', '));
}

main();
