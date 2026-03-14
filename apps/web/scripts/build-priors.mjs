import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const DERIVED_DIR = process.env.ARCHIVOX_DERIVED_DIR || path.resolve(process.cwd(), '../../datasets/core-v1/derived');
const PRIORS_PATH = process.env.ARCHIVOX_PRIORS || path.resolve(process.cwd(), '../../datasets/core-v1/priors.json');

function stats(nums) {
  const xs = nums.filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const q = (p) => xs[Math.min(xs.length - 1, Math.max(0, Math.floor(p * (xs.length - 1))))];
  const sum = xs.reduce((s, n) => s + n, 0);
  return {
    n: xs.length,
    min: xs[0],
    p25: q(0.25),
    median: q(0.5),
    p75: q(0.75),
    max: xs[xs.length - 1],
    mean: sum / xs.length
  };
}

async function main() {
  await fsp.mkdir(path.dirname(PRIORS_PATH), { recursive: true });
  if (!fs.existsSync(DERIVED_DIR)) throw new Error(`Derived dir not found: ${DERIVED_DIR}`);

  const files = (await fsp.readdir(DERIVED_DIR)).filter((f) => f.endsWith('.plangraph.json'));
  const plans = [];
  for (const f of files) {
    const p = JSON.parse(await fsp.readFile(path.join(DERIVED_DIR, f), 'utf8'));
    plans.push(p);
  }

  const byLabel = new Map();
  const adjacencyCounts = new Map();
  const roomCountsByPlan = [];

  for (const plan of plans) {
    roomCountsByPlan.push(plan.roomCount ?? (plan.rooms?.length ?? 0));

    const rooms = Array.isArray(plan.rooms) ? plan.rooms : [];
    for (const r of rooms) {
      const label = String(r.label ?? 'UNKNOWN');
      if (!byLabel.has(label)) byLabel.set(label, { areas: [], aspect: [], squareish: [] });
      const acc = byLabel.get(label);
      acc.areas.push(Number(r.area));
      acc.aspect.push(Number(r.aspectRatio));
      acc.squareish.push(Number(r.squareish));
    }

    const idToLabel = new Map(rooms.map((r) => [r.id, String(r.label ?? 'UNKNOWN')]));
    const adj = Array.isArray(plan.adjacency) ? plan.adjacency : [];
    for (const e of adj) {
      const a = idToLabel.get(e.a) ?? 'UNKNOWN';
      const b = idToLabel.get(e.b) ?? 'UNKNOWN';
      const key = a < b ? `${a}::${b}` : `${b}::${a}`;
      adjacencyCounts.set(key, (adjacencyCounts.get(key) ?? 0) + 1);
    }
  }

  const roomShapePriors = {};
  for (const [label, acc] of byLabel.entries()) {
    roomShapePriors[label] = {
      area: stats(acc.areas),
      aspectRatio: stats(acc.aspect),
      squareish: stats(acc.squareish)
    };
  }

  // Convert adjacency counts to probabilities by normalizing over plans where both labels exist.
  const labels = Array.from(byLabel.keys());
  const labelPresence = new Map();
  for (const label of labels) labelPresence.set(label, 0);

  // presence count per label per plan
  const presenceByPlan = plans.map((plan) => {
    const present = new Set((plan.rooms ?? []).map((r) => String(r.label ?? 'UNKNOWN')));
    return present;
  });

  const pairDenom = new Map();
  for (const present of presenceByPlan) {
    for (const a of present) {
      for (const b of present) {
        if (a >= b) continue;
        const key = `${a}::${b}`;
        pairDenom.set(key, (pairDenom.get(key) ?? 0) + 1);
      }
    }
  }

  const adjacencyPriors = {};
  for (const [key, count] of adjacencyCounts.entries()) {
    const denom = pairDenom.get(key) ?? null;
    const [a, b] = key.split('::');
    if (!adjacencyPriors[a]) adjacencyPriors[a] = {};
    if (!adjacencyPriors[b]) adjacencyPriors[b] = {};
    const prob = denom ? count / denom : null;
    adjacencyPriors[a][b] = { count, denom, prob };
    adjacencyPriors[b][a] = { count, denom, prob };
  }

  const priors = {
    createdAt: new Date().toISOString(),
    corpus: { planCount: plans.length, roomCountStats: stats(roomCountsByPlan) },
    roomShapePriors,
    adjacencyPriors,
    notes: [
      'Priors are computed from extracted PlanGraphs (labeled polygons + best-effort adjacency).',
      'Adjacency currently uses a simple epsilon-based polygon distance heuristic; tune EPS for cleaner statistics.'
    ]
  };

  await fsp.writeFile(PRIORS_PATH, JSON.stringify(priors, null, 2), 'utf8');
  console.log(`Wrote priors: ${PRIORS_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
