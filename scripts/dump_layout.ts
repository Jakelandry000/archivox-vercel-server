/**
 * Diagnostic script — scripts/dump_layout.ts
 * Usage: npx tsx scripts/dump_layout.ts [layout-id ...]
 *
 * Regenerates layouts deterministically and dumps:
 *   • Room list with bounds
 *   • All violations (base validator + RB rule checks), grouped by severity
 *   • Geometry relationships: containment & overlap pairs
 *   • Gross-to-net efficiency
 *
 * Default IDs (from the 200-run batch, seeds 1000-1002):
 *   small-1bed__s1000   mid-2bed__s1001   mid-3bed__s1002
 *
 * No new dependencies — uses only existing packages via npx tsx.
 */

import { generateAndValidate } from '../packages/generator/src/index.js';
import { runChecks } from '../packages/core/src/ruleChecks.js';

// ── Minimal copy of the prompt corpus needed for ID→input resolution ──────────

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

const PROMPT_BY_LABEL = new Map(PROMPTS.map(p => [p.label, p.input]));

// ── Geometry helpers (mirrors validator internals) ─────────────────────────────

function roomArea(r: { width: number; height: number }) {
  return r.width * r.height;
}

function overlapArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): number {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

function isContainedIn(
  inner: { x: number; y: number; width: number; height: number },
  outer: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width  <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

// ── Parse IDs from CLI args (or use defaults) ──────────────────────────────────

const DEFAULT_IDS = ['small-1bed__s1000', 'mid-2bed__s1001', 'mid-3bed__s1002'];
const ids = process.argv.slice(2).filter(a => !a.startsWith('-'));
const targetIds = ids.length > 0 ? ids : DEFAULT_IDS;

// ── Main loop ─────────────────────────────────────────────────────────────────

for (const id of targetIds) {
  const sep = id.lastIndexOf('__s');
  if (sep === -1) {
    console.error(`Bad ID format (expected "label__s<seed>"): ${id}`);
    process.exit(1);
  }
  const label = id.slice(0, sep);
  const seed  = parseInt(id.slice(sep + 3), 10);
  const templateInput = PROMPT_BY_LABEL.get(label);
  if (!templateInput) {
    console.error(`Unknown template label "${label}" in ID "${id}". Known labels: ${[...PROMPT_BY_LABEL.keys()].join(', ')}`);
    process.exit(1);
  }

  const gen = generateAndValidate(
    { ...templateInput, seed },
    { maxAttempts: 1, priors: null },
  );
  const layout    = gen.layout;
  const baseViols = gen.validation.violations;
  const rbViols   = runChecks(layout);
  const allViols  = [...baseViols, ...rbViols];

  const rooms  = layout.rooms.filter(r => r.width > 0 && r.height > 0);
  const W      = layout.dimensions.width;
  const D      = layout.dimensions.depth;
  const totalRoomArea = rooms.reduce((s, r) => s + roomArea(r), 0);
  const gtn    = W * D > 0 ? totalRoomArea / (W * D) : 0;

  console.log('\n' + '═'.repeat(70));
  console.log(`  Layout: ${id}`);
  console.log(`  Template: "${label}"   prompt: "${templateInput.prompt}"`);
  console.log(`  Seed: ${seed}   Canvas: ${W}×${D} ${layout.units}   Rooms: ${rooms.length}`);
  console.log(`  Base score: ${gen.validation.score}   GTN: ${(gtn * 100).toFixed(1)}%   Total room area: ${totalRoomArea.toFixed(1)} / ${(W*D).toFixed(1)} sq ${layout.units}`);
  console.log('═'.repeat(70));

  // ── Room list ──────────────────────────────────────────────────────────────
  console.log('\n  ROOMS');
  console.log('  ' + '─'.repeat(68));
  console.log('  ' + 'ID'.padEnd(26) + 'Type'.padEnd(16) + 'x'.padStart(6) + 'y'.padStart(6) + 'w'.padStart(6) + 'h'.padStart(6) + 'area'.padStart(8));
  for (const r of rooms) {
    const area = (r.width * r.height).toFixed(1);
    console.log(
      '  ' +
      r.id.padEnd(26) +
      r.type.padEnd(16) +
      r.x.toFixed(1).padStart(6) +
      r.y.toFixed(1).padStart(6) +
      r.width.toFixed(1).padStart(6) +
      r.height.toFixed(1).padStart(6) +
      area.padStart(8)
    );
  }

  // ── Geometry relationships ─────────────────────────────────────────────────
  const geomIssues: string[] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i], b = rooms[j];
      const oa = overlapArea(a, b);
      if (oa <= 0) continue;
      const smaller = Math.min(roomArea(a), roomArea(b));
      const ratio   = smaller > 0 ? oa / smaller : 1;
      if (isContainedIn(a, b)) {
        geomIssues.push(`  CONTAINMENT: "${a.id}" fully inside "${b.id}"`);
      } else if (isContainedIn(b, a)) {
        geomIssues.push(`  CONTAINMENT: "${b.id}" fully inside "${a.id}"`);
      } else {
        geomIssues.push(`  OVERLAP ${(ratio*100).toFixed(1)}%: "${a.id}" ↔ "${b.id}"  (overlap=${oa.toFixed(1)} sq ${layout.units})`);
      }
    }
  }
  if (geomIssues.length > 0) {
    console.log('\n  GEOMETRY ISSUES (' + geomIssues.length + ')');
    console.log('  ' + '─'.repeat(68));
    for (const g of geomIssues) console.log(g);
  } else {
    console.log('\n  GEOMETRY: no overlaps or containment');
  }

  // ── Violations ────────────────────────────────────────────────────────────
  console.log('\n  VIOLATIONS (' + allViols.length + ' total)');
  console.log('  ' + '─'.repeat(68));
  if (allViols.length === 0) {
    console.log('  (none)');
  } else {
    for (const sev of ['error', 'warning', 'info'] as const) {
      const filtered = allViols.filter(v => v.severity === sev);
      if (filtered.length === 0) continue;
      const label2 = sev === 'error' ? 'ERRORS' : sev === 'warning' ? 'WARNINGS' : 'INFO';
      console.log(`\n  ${label2} (${filtered.length})`);
      for (const v of filtered) {
        const rooms2 = v.roomIds?.length ? ` [${v.roomIds.join(', ')}]` : '';
        console.log(`  • [${v.code}]${rooms2}`);
        console.log(`    ${v.message}`);
      }
    }
  }
}

console.log('\n' + '═'.repeat(70) + '\n');
