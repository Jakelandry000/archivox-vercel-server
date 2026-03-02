import { NextResponse } from 'next/server';
import JSZip from 'jszip';
import DxfParser from 'dxf-parser';

export const runtime = 'nodejs';

type DxfSummary = {
  fileName: string;
  ok: boolean;
  error?: string;
  entityCounts?: Record<string, number>;
  layerCounts?: Record<string, number>;
  bounds?: { minX: number; minY: number; maxX: number; maxY: number };
};

function asNum(v: unknown): number {
  return typeof v === 'number' ? v : Number.NaN;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function getPath(obj: Record<string, unknown>, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (!isObj(cur)) return undefined;
    cur = cur[k];
  }
  return cur;
}

function updateBounds(
  b: { minX: number; minY: number; maxX: number; maxY: number } | undefined,
  x: unknown,
  y: unknown
) {
  const nx = asNum(x);
  const ny = asNum(y);
  if (!Number.isFinite(nx) || !Number.isFinite(ny)) return b;
  if (!b) return { minX: nx, minY: ny, maxX: nx, maxY: ny };
  return {
    minX: Math.min(b.minX, nx),
    minY: Math.min(b.minY, ny),
    maxX: Math.max(b.maxX, nx),
    maxY: Math.max(b.maxY, ny)
  };
}

function summarizeDxf(doc: unknown): Omit<DxfSummary, 'fileName' | 'ok'> {
  const d = doc as { entities?: unknown[] };
  const entities: Array<Record<string, unknown>> = Array.isArray(d?.entities)
    ? (d.entities as Array<Record<string, unknown>>)
    : [];

  const entityCounts: Record<string, number> = {};
  const layerCounts: Record<string, number> = {};
  let bounds:
    | { minX: number; minY: number; maxX: number; maxY: number }
    | undefined;

  for (const e of entities) {
    const type = String(e?.type ?? 'UNKNOWN');
    entityCounts[type] = (entityCounts[type] ?? 0) + 1;

    const layer = String(e?.layer ?? '');
    if (layer) layerCounts[layer] = (layerCounts[layer] ?? 0) + 1;

    // Best-effort bounds extraction for common entity shapes.
    if (type === 'LINE') {
      bounds = updateBounds(bounds, getPath(e, ['start', 'x']), getPath(e, ['start', 'y']));
      bounds = updateBounds(bounds, getPath(e, ['end', 'x']), getPath(e, ['end', 'y']));
    } else if (type === 'LWPOLYLINE' || type === 'POLYLINE') {
      const vertsRaw = e['vertices'];
      const verts: Array<Record<string, unknown>> = Array.isArray(vertsRaw)
        ? (vertsRaw as Array<Record<string, unknown>>)
        : [];
      for (const v of verts) bounds = updateBounds(bounds, v['x'], v['y']);
    } else if (type === 'CIRCLE' || type === 'ARC') {
      const cx = asNum(getPath(e, ['center', 'x']));
      const cy = asNum(getPath(e, ['center', 'y']));
      const r = asNum(e['radius']);
      if (Number.isFinite(cx) && Number.isFinite(cy) && Number.isFinite(r)) {
        bounds = updateBounds(bounds, cx - r, cy - r);
        bounds = updateBounds(bounds, cx + r, cy + r);
      }
    } else if (type === 'TEXT' || type === 'MTEXT') {
      const x = getPath(e, ['startPoint', 'x']) ?? getPath(e, ['position', 'x']);
      const y = getPath(e, ['startPoint', 'y']) ?? getPath(e, ['position', 'y']);
      bounds = updateBounds(bounds, x, y);
    }
  }

  return { entityCounts, layerCounts, bounds };
}

export async function POST(req: Request) {
  // Expect: multipart/form-data with a single .zip file in field "file".
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file field "file"' }, { status: 400 });
  }

  const originalName = file.name || 'upload.zip';
  const maxBytes = 100 * 1024 * 1024; // 100MB guardrail for now
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `Zip too large (${file.size} bytes). Limit is ${maxBytes} bytes for now.` },
      { status: 413 }
    );
  }

  const zipBuf = Buffer.from(await file.arrayBuffer());

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(zipBuf);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Could not read zip: ${msg}` }, { status: 400 });
  }

  const dxfFiles = Object.values(zip.files).filter((f) => !f.dir && f.name.toLowerCase().endsWith('.dxf'));
  if (dxfFiles.length === 0) {
    return NextResponse.json({ error: 'Zip contained no .dxf files' }, { status: 400 });
  }

  // Guardrail: avoid zip-bombs / huge batches.
  const maxFiles = 200;
  const picked = dxfFiles.slice(0, maxFiles);

  const parser = new DxfParser();
  const summaries: DxfSummary[] = [];

  for (const zf of picked) {
    const fileName = zf.name.split('/').pop() || zf.name;
    try {
      const text = await zf.async('text');
      const doc = parser.parseSync(text);
      const summary = summarizeDxf(doc);
      summaries.push({ fileName, ok: true, ...summary });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      summaries.push({ fileName, ok: false, error: msg });
    }
  }

  const okCount = summaries.filter((s) => s.ok).length;
  const failCount = summaries.length - okCount;

  return NextResponse.json({
    upload: { name: originalName, size: file.size },
    dxfFound: dxfFiles.length,
    processed: summaries.length,
    okCount,
    failCount,
    summaries
  });
}
