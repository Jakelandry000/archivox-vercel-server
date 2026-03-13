import { LayoutV1, normalizeLegacyLayout, Opening2D, Wall2D } from '@archivox/core';

export function generateFloorPlanSvg(layoutInput: LayoutV1 | any) {
  const layout = normalizeLegacyLayout(layoutInput);

  const scale = 10; // px per unit
  const totalWidth = layout.dimensions.width * scale;
  const totalHeight = layout.dimensions.depth * scale;

  const bg = '#fbfbfb';

  const wallIndex = new Map<string, Wall2D>();
  (layout.walls ?? []).forEach((w) => wallIndex.set(w.id, w));

  const wallPolys = (layout.walls ?? [])
    .map((w) => {
      const poly = wallToPolygon(w, scale);
      const points = poly.map((p) => `${p.x},${p.y}`).join(' ');
      const stroke = w.kind === 'exterior' ? '#111' : '#222';
      return `<polygon points="${points}" fill="#1f2937" fill-opacity="0.95" stroke="${stroke}" stroke-width="1" />`;
    })
    .join('\n');

  // Openings are rendered as a "cut" over the wall polygon.
  const openingCuts = (layout.openings ?? [])
    .map((o) => {
      const w = wallIndex.get(o.wallId);
      if (!w) return '';
      const cut = openingCutPolygon(w, o, scale);
      const points = cut.map((p) => `${p.x},${p.y}`).join(' ');
      const symbol = openingSymbol(w, o, scale);
      return `
        <polygon points="${points}" fill="${bg}" />
        ${symbol}
      `;
    })
    .join('\n');

  const roomRects = layout.rooms
    .map((room) => {
      const x = room.x * scale;
      const y = room.y * scale;
      const w = room.width * scale;
      const h = room.height * scale;
      const label = (room.label ?? room.type ?? '').toString();
      return `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(16,185,129,0.04)" stroke="rgba(17,24,39,0.35)" stroke-width="1" />
        <text x="${x + 6}" y="${y + 16}" font-size="12" fill="#111827" opacity="0.75">${escapeXml(label)}</text>
      `;
    })
    .join('\n');

  const svg = `
    <svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="${bg}" />
      ${roomRects}
      ${wallPolys}
      ${openingCuts}
    </svg>
  `.trim();

  return { svg };
}

export function generateAutoCadScr(layoutInput: LayoutV1 | any) {
  const layout = normalizeLegacyLayout(layoutInput);

  const commands = layout.rooms.map((room) => {
    const x1 = room.x;
    const y1 = room.y;
    const x2 = room.x + room.width;
    const y2 = room.y + room.height;
    // Your old code used RECTANG by mistake in one file; AutoCAD is RECTANGLE.
    return `RECTANGLE ${x1},${y1} ${x2},${y2}`;
  });

  return { script: commands.join('\n') + '\n' };
}

function escapeXml(s: string) {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

type P = { x: number; y: number };

function wallToPolygon(w: Wall2D, scale: number): P[] {
  const ax = w.a.x * scale;
  const ay = w.a.y * scale;
  const bx = w.b.x * scale;
  const by = w.b.y * scale;

  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // Perp normal
  const nx = -uy;
  const ny = ux;

  const half = (w.thickness * scale) / 2;
  const ox = nx * half;
  const oy = ny * half;

  return [
    { x: ax + ox, y: ay + oy },
    { x: bx + ox, y: by + oy },
    { x: bx - ox, y: by - oy },
    { x: ax - ox, y: ay - oy }
  ];
}

function openingCutPolygon(wall: Wall2D, o: Opening2D, scale: number): P[] {
  const ax = wall.a.x * scale;
  const ay = wall.a.y * scale;
  const bx = wall.b.x * scale;
  const by = wall.b.y * scale;

  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const t = clamp(o.centerT, 0, 1);
  const cx = ax + dx * t;
  const cy = ay + dy * t;

  const halfW = (o.width * scale) / 2;
  const halfT = (wall.thickness * scale) / 2;
  const pad = 2; // px so the cut fully clears wall stroke

  const alongX = ux * halfW;
  const alongY = uy * halfW;
  const offX = nx * (halfT + pad);
  const offY = ny * (halfT + pad);

  return [
    { x: cx - alongX + offX, y: cy - alongY + offY },
    { x: cx + alongX + offX, y: cy + alongY + offY },
    { x: cx + alongX - offX, y: cy + alongY - offY },
    { x: cx - alongX - offX, y: cy - alongY - offY }
  ];
}

function openingSymbol(wall: Wall2D, o: Opening2D, scale: number): string {
  const ax = wall.a.x * scale;
  const ay = wall.a.y * scale;
  const bx = wall.b.x * scale;
  const by = wall.b.y * scale;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  const t = clamp(o.centerT, 0, 1);
  const cx = ax + dx * t;
  const cy = ay + dy * t;

  const halfW = (o.width * scale) / 2;
  const halfT = (wall.thickness * scale) / 2;

  if (o.type === 'window') {
    // Simple window: thin line centered in the cut.
    const x1 = cx - ux * halfW + nx * (halfT * 0.25);
    const y1 = cy - uy * halfW + ny * (halfT * 0.25);
    const x2 = cx + ux * halfW + nx * (halfT * 0.25);
    const y2 = cy + uy * halfW + ny * (halfT * 0.25);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#111827" stroke-width="2" opacity="0.55" />`;
  }

  if (o.type === 'door') {
    // Very simple door symbol: a short line indicating the leaf.
    const hingeX = cx - ux * halfW;
    const hingeY = cy - uy * halfW;
    const leafX = cx + ux * (halfW * 0.2);
    const leafY = cy + uy * (halfW * 0.2);
    return `<line x1="${hingeX}" y1="${hingeY}" x2="${leafX}" y2="${leafY}" stroke="#111827" stroke-width="2" opacity="0.6" />`;
  }

  return '';
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}
