/**
 * scripts/ingest_dxf.ts
 *
 * Skeleton: parse DXF floor-plan files into LayoutV1 room records, compute
 * an adjacency graph, and write the result to /data/ for offline use.
 *
 * Usage:
 *   npx tsx scripts/ingest_dxf.ts <file.dxf> [--units feet|meters] [--out data/]
 *
 * IMPORTANT: /data/ is excluded from the web bundle (see next.config.ts) and
 * must never be exposed to the client.
 *
 * DXF parsing strategy (no external library required):
 *  - Read the file as plain text; DXF is an ASCII group-code format.
 *  - Walk the ENTITIES section; collect LWPOLYLINE closed polygons as room boundaries.
 *  - Convert vertices to axis-aligned bounding boxes (Room2D).
 *  - Compute pairwise adjacency (shared or near-touching edges).
 *  - Write one JSON file per DXF: data/<name>.layout.json
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { LayoutV1, Room2D, Units } from '../packages/core/src/index.js';

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: npx tsx scripts/ingest_dxf.ts <file.dxf> [--units feet|meters] [--out <dir>]');
  process.exit(1);
}

const dxfPath = args[0];
const unitsArg = args.includes('--units') ? args[args.indexOf('--units') + 1] : 'feet';
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'data';
const units: Units = unitsArg === 'meters' ? 'meters' : 'feet';

// ── DXF parser ────────────────────────────────────────────────────────────────

interface DxfGroupCode {
  code: number;
  value: string;
}

function parseDxfGroupCodes(text: string): DxfGroupCode[] {
  const lines = text.split(/\r?\n/);
  const codes: DxfGroupCode[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    const value = lines[i + 1].trim();
    if (!Number.isNaN(code)) codes.push({ code, value });
  }
  return codes;
}

interface RawPolyline {
  /** LAYER name from the DXF entity */
  layer: string;
  vertices: { x: number; y: number }[];
  closed: boolean;
}

function extractLwPolylines(codes: DxfGroupCode[]): RawPolyline[] {
  const polys: RawPolyline[] = [];
  let i = 0;

  while (i < codes.length) {
    if (codes[i].code === 0 && codes[i].value === 'LWPOLYLINE') {
      let layer = '0';
      let closed = false;
      const vertices: { x: number; y: number }[] = [];
      let pendingX: number | null = null;
      i++;

      while (i < codes.length && !(codes[i].code === 0)) {
        const { code, value } = codes[i];
        if (code === 8) layer = value;
        // Flag 1 = closed polyline
        if (code === 70) closed = (parseInt(value, 10) & 1) === 1;
        if (code === 10) pendingX = parseFloat(value);
        if (code === 20 && pendingX !== null) {
          vertices.push({ x: pendingX, y: parseFloat(value) });
          pendingX = null;
        }
        i++;
      }

      if (vertices.length >= 3) {
        polys.push({ layer, vertices, closed });
      }
    } else {
      i++;
    }
  }

  return polys;
}

// ── Unit normalisation ────────────────────────────────────────────────────────

/**
 * Auto-detect scale: DXF files may be in mm, cm, inches, or feet.
 * Heuristic: if the median vertex coordinate is > 500, assume mm → feet.
 */
function detectScaleFactor(polys: RawPolyline[], targetUnits: Units): number {
  const coords: number[] = [];
  for (const p of polys) {
    for (const v of p.vertices) {
      coords.push(Math.abs(v.x), Math.abs(v.y));
    }
  }
  coords.sort((a, b) => a - b);
  const median = coords[Math.floor(coords.length / 2)] ?? 1;

  if (targetUnits === 'feet') {
    if (median > 5000) return 1 / 304.8;   // mm → feet
    if (median > 500) return 1 / 30.48;    // cm → feet
    if (median > 50) return 1 / 12;        // inches → feet
    return 1;                               // already feet
  } else {
    if (median > 5000) return 1 / 1000;    // mm → meters
    if (median > 500) return 1 / 100;      // cm → meters
    if (median > 50) return 0.0254;        // inches → meters
    return 1;                              // already meters
  }
}

// ── Polygon → Room2D ──────────────────────────────────────────────────────────

function polyToRoom(poly: RawPolyline, scale: number, index: number): Room2D {
  const xs = poly.vertices.map(v => v.x * scale);
  const ys = poly.vertices.map(v => v.y * scale);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  // Use layer name as a room-type hint; fall back to 'other'
  const layerLower = poly.layer.toLowerCase();
  const type = inferRoomType(layerLower);

  return {
    id: `room_${index + 1}`,
    type,
    label: poly.layer !== '0' ? poly.layer : undefined,
    x: parseFloat(minX.toFixed(3)),
    y: parseFloat(minY.toFixed(3)),
    width: parseFloat((maxX - minX).toFixed(3)),
    height: parseFloat((maxY - minY).toFixed(3)),
  };
}

function inferRoomType(layerName: string): string {
  const map: [RegExp, string][] = [
    [/bed/i, 'bedroom'],
    [/bath/i, 'bathroom'],
    [/kit/i, 'kitchen'],
    [/liv/i, 'living room'],
    [/din/i, 'dining'],
    [/off/i, 'office'],
    [/laun/i, 'laundry'],
    [/gar/i, 'garage'],
    [/hall|corr/i, 'hall'],
    [/clos/i, 'closet'],
  ];
  for (const [re, type] of map) {
    if (re.test(layerName)) return type;
  }
  return 'other';
}

// ── Adjacency graph ───────────────────────────────────────────────────────────

interface AdjacencyEdge {
  a: string;
  b: string;
}

function computeAdjacency(rooms: Room2D[], tol = 0.3): AdjacencyEdge[] {
  const edges: AdjacencyEdge[] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      const horizAdj =
        (Math.abs(a.x + a.width - b.x) <= tol || Math.abs(b.x + b.width - a.x) <= tol) &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;
      const vertAdj =
        (Math.abs(a.y + a.height - b.y) <= tol || Math.abs(b.y + b.height - a.y) <= tol) &&
        a.x < b.x + b.width &&
        a.x + a.width > b.x;
      if (horizAdj || vertAdj) {
        edges.push({ a: a.id, b: b.id });
      }
    }
  }
  return edges;
}

// ── Bounding box ──────────────────────────────────────────────────────────────

function computeBounds(rooms: Room2D[]): { width: number; depth: number } {
  if (rooms.length === 0) return { width: 0, depth: 0 };
  const maxX = Math.max(...rooms.map(r => r.x + r.width));
  const maxY = Math.max(...rooms.map(r => r.y + r.height));
  return {
    width: parseFloat(maxX.toFixed(3)),
    depth: parseFloat(maxY.toFixed(3)),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const dxfText = fs.readFileSync(dxfPath, 'utf-8');
  const codes = parseDxfGroupCodes(dxfText);
  const rawPolys = extractLwPolylines(codes);

  if (rawPolys.length === 0) {
    console.warn('No LWPOLYLINE entities found — the DXF may use LINE or POLYLINE entities (not yet supported).');
    process.exit(0);
  }

  const scale = detectScaleFactor(rawPolys, units);
  const rooms: Room2D[] = rawPolys.map((p, i) => polyToRoom(p, scale, i));
  const dimensions = computeBounds(rooms);
  const adjacency = computeAdjacency(rooms);

  const layout: LayoutV1 = {
    schemaVersion: 'layout.v1',
    units,
    dimensions,
    rooms,
  };

  const outData = { layout, adjacency, source: path.basename(dxfPath), ingestedAt: new Date().toISOString() };

  fs.mkdirSync(outDir, { recursive: true });
  const stem = path.basename(dxfPath, path.extname(dxfPath));
  const outPath = path.join(outDir, `${stem}.layout.json`);
  fs.writeFileSync(outPath, JSON.stringify(outData, null, 2), 'utf-8');

  console.log(`Ingested ${rooms.length} rooms from ${path.basename(dxfPath)}`);
  console.log(`Adjacency edges: ${adjacency.length}`);
  console.log(`Written to: ${outPath}`);
}

main();
