import { LayoutV1, normalizeLegacyLayout, Opening2D, Wall2D } from '@archivox/core';

export function generateFloorPlanSvg(layoutInput: LayoutV1 | any) {
  const layout = normalizeLegacyLayout(layoutInput);

  const scale = 10; // px per unit
  const totalWidth = layout.dimensions.width * scale;
  const totalHeight = layout.dimensions.depth * scale;

  const bg = '#fbfbfb';
  const gridMajor = 5; // units (feet/meters) between major grid lines
  const gridMinor = 1; // units between minor lines

  const wallIndex = new Map<string, Wall2D>();
  (layout.walls ?? []).forEach((w) => wallIndex.set(w.id, w));

  const wallPolys = (layout.walls ?? [])
    .map((w) => {
      const poly = wallToPolygon(w, scale);
      const points = poly.map((p) => `${p.x},${p.y}`).join(' ');
      const stroke = w.kind === 'exterior' ? '#0b0f0d' : '#111827';
      const fill = w.kind === 'exterior' ? '#111827' : '#1f2937';
      return `<polygon points="${points}" fill="${fill}" fill-opacity="0.92" stroke="${stroke}" stroke-width="1" stroke-linejoin="round" />`;
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
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(16,185,129,0.03)" stroke="rgba(17,24,39,0.22)" stroke-width="1" />
        <text x="${x + 8}" y="${y + 18}" font-size="12" font-family="ui-sans-serif,system-ui" fill="#0b1220" opacity="0.75">${escapeXml(label)}</text>
      `;
    })
    .join('\n');

  const svg = `
    <svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        ${gridPatternDefs({ totalWidth, totalHeight, scale, gridMajor, gridMinor })}
      </defs>
      <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="${bg}" />
      <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="url(#gridMinor)" opacity="0.55" />
      <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="url(#gridMajor)" opacity="0.55" />
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

  const ink = '#0b1220';

  if (o.type === 'window') {
    // Window: two thin parallel lines inside the cut.
    const offset = halfT * 0.25;
    const x1 = cx - ux * halfW + nx * offset;
    const y1 = cy - uy * halfW + ny * offset;
    const x2 = cx + ux * halfW + nx * offset;
    const y2 = cy + uy * halfW + ny * offset;

    const x3 = cx - ux * halfW - nx * offset;
    const y3 = cy - uy * halfW - ny * offset;
    const x4 = cx + ux * halfW - nx * offset;
    const y4 = cy + uy * halfW - ny * offset;

    return `
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ink}" stroke-width="1.6" opacity="0.65" />
      <line x1="${x3}" y1="${y3}" x2="${x4}" y2="${y4}" stroke="${ink}" stroke-width="1.6" opacity="0.45" />
    `;
  }

  if (o.type === 'door') {
    // Door: leaf + swing arc. Uses opening.swing to choose which side of wall.
    const hingeX = cx - ux * halfW;
    const hingeY = cy - uy * halfW;

    const side = o.swing === 'right' ? -1 : 1; // default left
    const sx = nx * side;
    const sy = ny * side;

    const radius = o.width * scale;

    // Door leaf goes from hinge toward the normal side.
    const leafX = hingeX + sx * radius * 0.85;
    const leafY = hingeY + sy * radius * 0.85;

    // Arc from "closed" (along wall axis) to "open" (toward normal).
    const closedX = hingeX + ux * (o.width * scale);
    const closedY = hingeY + uy * (o.width * scale);

    const arcEndX = hingeX + sx * radius;
    const arcEndY = hingeY + sy * radius;

    const arc = `<path d="M ${closedX} ${closedY} A ${radius} ${radius} 0 0 ${side < 0 ? 0 : 1} ${arcEndX} ${arcEndY}" fill="none" stroke="${ink}" stroke-width="1.4" opacity="0.45" />`;
    const leaf = `<line x1="${hingeX}" y1="${hingeY}" x2="${leafX}" y2="${leafY}" stroke="${ink}" stroke-width="1.8" opacity="0.65" />`;
    const hinge = `<circle cx="${hingeX}" cy="${hingeY}" r="1.6" fill="${ink}" opacity="0.5" />`;

    return `${arc}${leaf}${hinge}`;
  }

  return '';
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function gridPatternDefs({
  totalWidth,
  totalHeight,
  scale,
  gridMajor,
  gridMinor
}: {
  totalWidth: number;
  totalHeight: number;
  scale: number;
  gridMajor: number;
  gridMinor: number;
}) {
  const minorPx = gridMinor * scale;
  const majorPx = gridMajor * scale;

  // Avoid pathological values.
  const m1 = Number.isFinite(minorPx) && minorPx > 2 ? minorPx : 10;
  const m2 = Number.isFinite(majorPx) && majorPx > m1 ? majorPx : 50;

  return `
    <pattern id="gridMinor" width="${m1}" height="${m1}" patternUnits="userSpaceOnUse">
      <path d="M ${m1} 0 L 0 0 0 ${m1}" fill="none" stroke="rgba(17,24,39,0.08)" stroke-width="1" />
    </pattern>
    <pattern id="gridMajor" width="${m2}" height="${m2}" patternUnits="userSpaceOnUse">
      <path d="M ${m2} 0 L 0 0 0 ${m2}" fill="none" stroke="rgba(17,24,39,0.12)" stroke-width="1" />
    </pattern>
  `.trim();
}
