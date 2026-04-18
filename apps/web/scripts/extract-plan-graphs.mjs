import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import DxfParser from 'dxf-parser';

const ZIP_PATH = process.env.ARCHIVOX_DXF_ZIP || '/dataset/packages/archivox_18_dxfs.zip';
const OUT_DIR = process.env.ARCHIVOX_OUT_DIR || path.resolve(process.cwd(), '../../datasets/core-v1/derived');
const MANIFEST_PATH = process.env.ARCHIVOX_MANIFEST || path.resolve(process.cwd(), '../../datasets/core-v1/manifest.json');

function asNum(v) {
  return typeof v === 'number' ? v : Number(v);
}

function normalizeLabel(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return null;

  // Strip punctuation and multiple spaces
  const base = s
    .replace(/[\r\n\t]/g, ' ')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!base) return null;

  // Filter obvious noise / orientation labels
  const noise = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW', 'TO']);
  if (noise.has(base)) return null;
  if (base.length <= 2) return null;

  // Common normalizations
  if (/^BED(ROOM)?( \d+)?$/.test(base)) return 'BEDROOM';
  if (/^MASTER( BED(ROOM)?)?$/.test(base)) return 'BEDROOM';
  if (/^CLOSET(S)?$/.test(base)) return 'CLOSET';
  if (/^WALK IN CLOSET$/.test(base)) return 'CLOSET';
  if (/^BATH(ROOM)?( \d+)?$/.test(base)) return 'BATHROOM';
  if (/^WC$/.test(base)) return 'BATHROOM';
  if (/^KITCH(EN)?$/.test(base)) return 'KITCHEN';
  if (/^LIVING( ROOM)?$/.test(base)) return 'LIVING';
  if (/^DINING( ROOM)?$/.test(base)) return 'DINING';
  if (/^GARAGE$/.test(base)) return 'GARAGE';
  if (/^LAUNDRY$/.test(base)) return 'LAUNDRY';
  if (/^PANTRY$/.test(base)) return 'PANTRY';
  if (/^ENTRY$/.test(base)) return 'ENTRY';
  if (/^HALL(WAY)?$/.test(base)) return 'HALL';

  const allowed = new Set([
    'BEDROOM',
    'CLOSET',
    'BATHROOM',
    'KITCHEN',
    'LIVING',
    'DINING',
    'GARAGE',
    'LAUNDRY',
    'PANTRY',
    'ENTRY',
    'HALL',
    'TERRACE'
  ]);

  // If we don't recognize it as a room label, ignore for now.
  if (!allowed.has(base)) return null;
  return base;
}

function polygonArea(points) {
  // Shoelace; assumes closed ring not required.
  let a = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function polygonCentroid(points) {
  // Centroid for non-self-intersecting polygon.
  let cx = 0,
    cy = 0;
  let a2 = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    const cross = p.x * q.y - q.x * p.y;
    a2 += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a2) < 1e-9) {
    // Fallback: average points
    const sx = points.reduce((s, p) => s + p.x, 0);
    const sy = points.reduce((s, p) => s + p.y, 0);
    return { x: sx / points.length, y: sy / points.length };
  }
  const a = a2 / 2;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

function bbox(points) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY };
}

function pointInPoly(pt, poly) {
  // Ray casting
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x,
      yi = poly[i].y;
    const xj = poly[j].x,
      yj = poly[j].y;
    const intersect = yi > pt.y !== yj > pt.y && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function aspectRatioFromBbox(b) {
  const w = Math.max(1e-9, b.maxX - b.minX);
  const h = Math.max(1e-9, b.maxY - b.minY);
  const ar = w > h ? w / h : h / w;
  return ar;
}

function squareishScore(ar) {
  // 1 at perfect square, goes to 0 as ar increases
  return 1 / (1 + Math.log(ar) ** 2);
}

function edges(points) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    out.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
  }
  return out;
}

function distPointToSegment(px, py, s) {
  const vx = s.bx - s.ax;
  const vy = s.by - s.ay;
  const wx = px - s.ax;
  const wy = py - s.ay;
  const c1 = vx * wx + vy * wy;
  if (c1 <= 0) return Math.hypot(px - s.ax, py - s.ay);
  const c2 = vx * vx + vy * vy;
  if (c2 <= c1) return Math.hypot(px - s.bx, py - s.by);
  const t = c1 / c2;
  const projx = s.ax + t * vx;
  const projy = s.ay + t * vy;
  return Math.hypot(px - projx, py - projy);
}

function minEdgeDistance(polyA, polyB) {
  const ea = edges(polyA);
  const eb = edges(polyB);
  let d = Infinity;
  for (const s of ea) {
    d = Math.min(d, distPointToSegment(s.ax, s.ay, eb[0]));
  }
  // Better: check all points against all segments
  for (const p of polyA) {
    for (const s of eb) d = Math.min(d, distPointToSegment(p.x, p.y, s));
  }
  for (const p of polyB) {
    for (const s of ea) d = Math.min(d, distPointToSegment(p.x, p.y, s));
  }
  return d;
}

function bboxOverlap(a, b, pad = 0) {
  return !(a.maxX + pad < b.minX || b.maxX + pad < a.minX || a.maxY + pad < b.minY || b.maxY + pad < a.minY);
}

async function main() {
  await fsp.mkdir(OUT_DIR, { recursive: true });
  await fsp.mkdir(path.dirname(MANIFEST_PATH), { recursive: true });

  if (!fs.existsSync(ZIP_PATH)) {
    throw new Error(`Zip not found at ${ZIP_PATH}. Set ARCHIVOX_DXF_ZIP if needed.`);
  }

  const zipBuf = await fsp.readFile(ZIP_PATH);
  const zip = await JSZip.loadAsync(zipBuf);
  const dxfFiles = Object.values(zip.files).filter((f) => !f.dir && f.name.toLowerCase().endsWith('.dxf'));
  if (dxfFiles.length === 0) throw new Error('Zip contained no .dxf files');

  const parser = new DxfParser();

  const manifest = {
    createdAt: new Date().toISOString(),
    zipPath: ZIP_PATH,
    outDir: OUT_DIR,
    plans: []
  };

  for (const zf of dxfFiles) {
    const fileName = zf.name.split('/').pop() || zf.name;
    const planId = fileName.replace(/\.dxf$/i, '');

    let doc;
    try {
      const text = await zf.async('text');
      doc = parser.parseSync(text);
    } catch (e) {
      console.error(`[${fileName}] parse failed:`, e?.message ?? e);
      continue;
    }

    const entities = Array.isArray(doc?.entities) ? doc.entities : [];
    const isClosed = (e, pts) => {
    if (e.shape === true || e.closed === true) return true;
    if (typeof e.flags === 'number' && (e.flags & 1) === 1) return true;
    if (pts.length >= 3) {
      const a = pts[0];
      const b = pts[pts.length - 1];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 1e-6) return true;
    }
    return false;
  };

  const polys = entities
      .filter((e) => (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') && Array.isArray(e.vertices))
      .map((e) => {
        const pts = e.vertices
          .map((v) => ({ x: asNum(v.x), y: asNum(v.y) }))
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
        if (pts.length < 3) return null;
        if (!isClosed(e, pts)) return null;
        const b = bbox(pts);
        const area = polygonArea(pts);
        return {
          handle: String(e.handle ?? ''),
          layer: String(e.layer ?? ''),
          points: pts,
          bbox: b,
          area,
          centroid: polygonCentroid(pts)
        };
      })
      .filter(Boolean);

    const texts = entities
      .filter((e) => e.type === 'TEXT' || e.type === 'MTEXT')
      .map((e) => {
        const sp = e.startPoint || e.position || {};
        const x = asNum(sp.x);
        const y = asNum(sp.y);
        const raw = e.text;
        const label = normalizeLabel(raw);
        if (!label || !Number.isFinite(x) || !Number.isFinite(y)) return null;
        // Filter out dimension text/noise
        if (/^\d+(\.\d+)?$/.test(label)) return null;
        return { x, y, label, raw: String(raw ?? ''), layer: String(e.layer ?? '') };
      })
      .filter(Boolean);

    // Build rooms by assigning each labeled text to:
    //  1) the smallest polygon that contains it, else
    //  2) the nearest polygon centroid within a guard radius.
    const roomsByHandle = new Map();
    const MIN_AREA = 25; // filter tiny artifacts; unit-agnostic but helps.
    const BBOX_PAD = 1;

    for (const t of texts) {
      let best = null;
      for (const p of polys) {
        if (p.area < MIN_AREA) continue;
        if (!bboxOverlap(p.bbox, { minX: t.x, minY: t.y, maxX: t.x, maxY: t.y }, BBOX_PAD)) continue;
        if (!pointInPoly({ x: t.x, y: t.y }, p.points)) continue;
        if (!best || p.area < best.area) best = p;
      }

      if (!best) {
        // Fallback: nearest centroid, but avoid absurd matches.
        let nearest = null;
        let nd = Infinity;
        for (const p of polys) {
          if (p.area < MIN_AREA) continue;
          const d = Math.hypot(p.centroid.x - t.x, p.centroid.y - t.y);
          if (d < nd) {
            nd = d;
            nearest = p;
          }
        }
        // guard: only accept if within a reasonable distance relative to polygon size
        if (nearest) {
          const w = nearest.bbox.maxX - nearest.bbox.minX;
          const h = nearest.bbox.maxY - nearest.bbox.minY;
          const scale = Math.max(w, h);
          if (nd <= Math.max(5, scale * 0.6)) best = nearest;
        }
      }

      if (!best) continue;

      const key = best.handle || `${best.layer}:${best.area}:${best.bbox.minX},${best.bbox.minY}`;
      if (!roomsByHandle.has(key)) {
        roomsByHandle.set(key, {
          id: `room_${roomsByHandle.size + 1}`,
          label: t.label,
          rawLabel: t.raw,
          layer: best.layer,
          polygon: best.points,
          area: best.area,
          bbox: best.bbox
        });
      }
    }

    const rooms = Array.from(roomsByHandle.values()).map((r) => {
      const ar = aspectRatioFromBbox(r.bbox);
      const sq = squareishScore(ar);
      const c = polygonCentroid(r.polygon);
      return {
        ...r,
        aspectRatio: ar,
        squareish: sq,
        centroid: c
      };
    });

    // Adjacency (best-effort): bbox overlap + min edge distance within epsilon.
    const EPS = 2; // DXF units; we can tune later.
    const adjacency = [];
    for (let i = 0; i < rooms.length; i++) {
      for (let j = i + 1; j < rooms.length; j++) {
        const a = rooms[i];
        const b = rooms[j];
        if (!bboxOverlap(a.bbox, b.bbox, EPS)) continue;
        const d = minEdgeDistance(a.polygon, b.polygon);
        if (d <= EPS) {
          adjacency.push({ a: a.id, b: b.id, distance: d });
        }
      }
    }

    const planBounds = rooms.length ? bbox(rooms.flatMap((r) => r.polygon)) : null;

    const out = {
      planId,
      source: { fileName },
      roomCount: rooms.length,
      rooms,
      adjacency,
      bounds: planBounds
    };

    const outPath = path.join(OUT_DIR, `${planId}.plangraph.json`);
    await fsp.writeFile(outPath, JSON.stringify(out, null, 2), 'utf8');

    manifest.plans.push({ planId, fileName, outPath: path.relative(path.dirname(MANIFEST_PATH), outPath), roomCount: rooms.length });
    console.log(`[${fileName}] rooms=${rooms.length} adjacency=${adjacency.length} -> ${outPath}`);
  }

  await fsp.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`Wrote manifest: ${MANIFEST_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
