import { LayoutV1, Units } from '@archivox/core';

export type GenerateInput = {
  prompt: string;
  units?: Units;
  width?: number;
  depth?: number;
};

// MVP heuristic generator: cheap, deterministic, and now validity-aware.
// Later: swap with an LLM-backed planner that outputs LayoutV1.
export function generateLayoutFromText(input: GenerateInput): LayoutV1 {
  const prompt = (input.prompt ?? '').toLowerCase();

  const units: Units = input.units ?? 'feet';
  const width = clampNum(input.width ?? 40, 10, 200);
  const depth = clampNum(input.depth ?? 30, 10, 200);

  const wants = {
    bedrooms: parseCount(prompt, ['bedroom', 'bedrooms', 'bed']) ?? 1,
    bathrooms: parseCount(prompt, ['bathroom', 'bathrooms', 'bath']) ?? 1,
    office: /\boffice\b/.test(prompt),
    garage: /\bgarage\b/.test(prompt),
    laundry: /\blaundry\b/.test(prompt),
    kitchen: true,
    living: true
  };

  // Build a target program (rooms + nominal sizes).
  const program: Array<{ type: string; width: number; height: number; label?: string }> = [];
  program.push({ type: 'living room', width: 18, height: 14 });
  program.push({ type: 'kitchen', width: 12, height: 10 });
  if (wants.laundry) program.push({ type: 'laundry', width: 6, height: 6 });
  if (wants.office) program.push({ type: 'office', width: 10, height: 10 });
  for (let i = 0; i < clampNum(wants.bedrooms, 1, 6); i++) program.push({ type: 'bedroom', width: 12, height: 10 });
  for (let i = 0; i < clampNum(wants.bathrooms, 1, 4); i++) program.push({ type: 'bathroom', width: 8, height: 8 });
  if (wants.garage) program.push({ type: 'garage', width: 20, height: 18 });

  // Deterministic RNG from prompt so the same prompt yields the same layout.
  const seed = fnv1a32(prompt || 'archivox');
  const rng = mulberry32(seed);

  // Candidate search: try multiple placements and keep the best valid one.
  const tries = 120;
  let best: LayoutV1 | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let t = 0; t < tries; t++) {
    const rooms = placeProgram(program, { width, depth, rng });
    const layout: LayoutV1 = {
      schemaVersion: 'layout.v1',
      units,
      dimensions: { width, depth },
      rooms
    };

    const violations = validateLayout(layout);
    const score = scoreLayout(layout, violations);

    if (score > bestScore) {
      bestScore = score;
      best = layout;
    }

    // Early exit if we found a "good enough" valid layout.
    if (violations.length === 0 && score > 0.75) break;
  }

  const out = best ?? {
    schemaVersion: 'layout.v1',
    units,
    dimensions: { width, depth },
    rooms: placeProgram(program, { width, depth, rng })
  };

  // Add walls so 3D can show interior partitions (simple room outlines for now).
  return { ...out, walls: wallsFromRooms(out), openings: [] };
}

type Rect = { x: number; y: number; width: number; height: number };

type Violation =
  | { kind: 'out_of_bounds'; roomId: string }
  | { kind: 'overlap'; a: string; b: string; area: number }
  | { kind: 'contained'; inner: string; outer: string }
  | { kind: 'garage_too_large'; ratio: number };

function placeProgram(
  program: Array<{ type: string; width: number; height: number; label?: string }>,
  opts: { width: number; depth: number; rng: () => number }
): LayoutV1['rooms'] {
  const rooms: LayoutV1['rooms'] = [];

  // Place larger rooms first.
  const sorted = [...program].sort((a, b) => b.width * b.height - a.width * a.height);

  for (const p of sorted) {
    const maxAttempts = 120;
    let placed: LayoutV1['rooms'][number] | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const x = Math.floor(opts.rng() * Math.max(1, opts.width - p.width));
      const y = Math.floor(opts.rng() * Math.max(1, opts.depth - p.height));
      const candidate = { x, y, width: p.width, height: p.height };

      if (x + p.width > opts.width || y + p.height > opts.depth) continue;

      // Reject overlaps.
      let ok = true;
      for (const r of rooms) {
        if (rectOverlapArea(candidate, r) > 0.01) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      const id = `${p.type.replace(/\s+/g, '_')}_${rooms.length + 1}`;
      placed = { id, type: p.type, label: p.label, x, y, width: p.width, height: p.height };
      break;
    }

    // Fallback: simple scanline placement if random failed.
    if (!placed) {
      const step = 1;
      outer: for (let y = 0; y <= opts.depth - p.height; y += step) {
        for (let x = 0; x <= opts.width - p.width; x += step) {
          const candidate = { x, y, width: p.width, height: p.height };
          let ok = true;
          for (const r of rooms) {
            if (rectOverlapArea(candidate, r) > 0.01) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          const id = `${p.type.replace(/\s+/g, '_')}_${rooms.length + 1}`;
          placed = { id, type: p.type, label: p.label, x, y, width: p.width, height: p.height };
          break outer;
        }
      }
    }

    // If still not placed, clamp into bounds at least.
    if (!placed) {
      const id = `${p.type.replace(/\s+/g, '_')}_${rooms.length + 1}`;
      placed = {
        id,
        type: p.type,
        label: p.label,
        x: clampNum(0, 0, Math.max(0, opts.width - p.width)),
        y: clampNum(0, 0, Math.max(0, opts.depth - p.height)),
        width: p.width,
        height: p.height
      };
    }

    rooms.push(placed);
  }

  return rooms;
}

function validateLayout(layout: LayoutV1): Violation[] {
  const v: Violation[] = [];

  // Bounds
  for (const r of layout.rooms) {
    if (r.x < 0 || r.y < 0 || r.x + r.width > layout.dimensions.width || r.y + r.height > layout.dimensions.depth) {
      v.push({ kind: 'out_of_bounds', roomId: r.id });
    }
  }

  // Overlap / containment
  for (let i = 0; i < layout.rooms.length; i++) {
    for (let j = i + 1; j < layout.rooms.length; j++) {
      const a = layout.rooms[i];
      const b = layout.rooms[j];
      const area = rectOverlapArea(a, b);
      if (area > 0.01) v.push({ kind: 'overlap', a: a.id, b: b.id, area });
      if (containsRect(a, b)) v.push({ kind: 'contained', inner: b.id, outer: a.id });
      if (containsRect(b, a)) v.push({ kind: 'contained', inner: a.id, outer: b.id });
    }
  }

  // Garage ratio sanity: garage should not dominate the house footprint.
  const totalArea = layout.rooms.reduce((sum, r) => sum + r.width * r.height, 0) || 1;
  const garageArea = layout.rooms
    .filter((r) => String(r.type).toLowerCase().includes('garage'))
    .reduce((sum, r) => sum + r.width * r.height, 0);
  const ratio = garageArea / totalArea;
  if (ratio > 0.45) v.push({ kind: 'garage_too_large', ratio });

  return v;
}

function scoreLayout(layout: LayoutV1, violations: Violation[]): number {
  let score = 1.0;

  for (const x of violations) {
    if (x.kind === 'overlap') score -= Math.min(1, x.area / 50) * 2.0;
    else if (x.kind === 'contained') score -= 1.5;
    else if (x.kind === 'out_of_bounds') score -= 2.0;
    else if (x.kind === 'garage_too_large') score -= (x.ratio - 0.45) * 4.0;
  }

  // Mild preference: spread bathrooms apart a bit.
  const baths = layout.rooms.filter((r) => String(r.type).toLowerCase().includes('bath'));
  for (let i = 0; i < baths.length; i++) {
    for (let j = i + 1; j < baths.length; j++) {
      const a = baths[i];
      const b = baths[j];
      const dx = (a.x + a.width / 2) - (b.x + b.width / 2);
      const dy = (a.y + a.height / 2) - (b.y + b.height / 2);
      const d = Math.hypot(dx, dy);
      if (d < 8) score -= 0.15;
    }
  }

  return score;
}

function rectOverlapArea(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const w = x2 - x1;
  const h = y2 - y1;
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

function containsRect(outer: Rect, inner: Rect): boolean {
  const eps = 1e-6;
  return (
    inner.x + eps >= outer.x &&
    inner.y + eps >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width + eps &&
    inner.y + inner.height <= outer.y + outer.height + eps
  );
}

function wallsFromRooms(layout: LayoutV1): NonNullable<LayoutV1['walls']> {
  const tExterior = layout.units === 'meters' ? 0.2 : 0.67;
  const tInterior = layout.units === 'meters' ? 0.15 : 0.5;

  // Count occurrences of each segment so we can merge shared walls.
  type Seg = { ax: number; ay: number; bx: number; by: number };
  const norm = (s: Seg) => {
    // Order endpoints to make A->B == B->A
    const aKey = `${s.ax.toFixed(4)},${s.ay.toFixed(4)}`;
    const bKey = `${s.bx.toFixed(4)},${s.by.toFixed(4)}`;
    return aKey <= bKey
      ? `${aKey}|${bKey}`
      : `${bKey}|${aKey}`;
  };

  const segMap = new Map<string, { seg: Seg; count: number }>();
  const add = (seg: Seg) => {
    const k = norm(seg);
    const cur = segMap.get(k);
    if (cur) cur.count++;
    else segMap.set(k, { seg, count: 1 });
  };

  for (const r of layout.rooms) {
    add({ ax: r.x, ay: r.y, bx: r.x + r.width, by: r.y });
    add({ ax: r.x + r.width, ay: r.y, bx: r.x + r.width, by: r.y + r.height });
    add({ ax: r.x + r.width, ay: r.y + r.height, bx: r.x, by: r.y + r.height });
    add({ ax: r.x, ay: r.y + r.height, bx: r.x, by: r.y });
  }

  // Always include exterior boundary.
  add({ ax: 0, ay: 0, bx: layout.dimensions.width, by: 0 });
  add({ ax: layout.dimensions.width, ay: 0, bx: layout.dimensions.width, by: layout.dimensions.depth });
  add({ ax: layout.dimensions.width, ay: layout.dimensions.depth, bx: 0, by: layout.dimensions.depth });
  add({ ax: 0, ay: layout.dimensions.depth, bx: 0, by: 0 });

  const isBoundary = (s: Seg) => {
    const eps = 1e-6;
    const onLeft = Math.abs(s.ax) < eps && Math.abs(s.bx) < eps;
    const onRight = Math.abs(s.ax - layout.dimensions.width) < eps && Math.abs(s.bx - layout.dimensions.width) < eps;
    const onTop = Math.abs(s.ay) < eps && Math.abs(s.by) < eps;
    const onBottom = Math.abs(s.ay - layout.dimensions.depth) < eps && Math.abs(s.by - layout.dimensions.depth) < eps;
    return onLeft || onRight || onTop || onBottom;
  };

  const walls: NonNullable<LayoutV1['walls']> = [];
  let idx = 0;
  for (const { seg, count } of segMap.values()) {
    const kind = isBoundary(seg) ? ('exterior' as const) : ('interior' as const);
    // Shared segments can still be interior; keep one wall.
    const thickness = kind === 'exterior' ? tExterior : tInterior;
    walls.push({
      id: `w_${++idx}`,
      a: { x: seg.ax, y: seg.ay },
      b: { x: seg.bx, y: seg.by },
      thickness,
      kind
    });

    // Minor preference: if something was added only once and is not boundary,
    // it's probably a "room outline" wall — still ok for MVP.
    void count;
  }

  return walls;
}

function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    // 32-bit FNV-1a
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function parseCount(prompt: string, keywords: string[]): number | null {
  // crude: "3 bedroom" or "3 bedrooms"
  for (const k of keywords) {
    const re = new RegExp(`(\\d+)\\s+${escapeRegex(k)}`);
    const m = prompt.match(re);
    if (m?.[1]) return Number(m[1]);
  }
  return null;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clampNum(n: number, min: number, max: number) {
  n = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, n));
}
