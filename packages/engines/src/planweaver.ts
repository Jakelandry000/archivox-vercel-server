import { LayoutV1, normalizeLegacyLayout } from '@archivox/core';

export function generateFloorPlanSvg(layoutInput: LayoutV1 | any) {
  const layout = normalizeLegacyLayout(layoutInput);

  const scale = 10; // px per unit
  const totalWidth = layout.dimensions.width * scale;
  const totalHeight = layout.dimensions.depth * scale;

  const PAD = 8;
  const svgW = totalWidth + PAD * 2;
  const svgH = totalHeight + PAD * 2;

  const svgElements = layout.rooms
    .map((room) => {
      const x = room.x * scale + PAD;
      const y = room.y * scale + PAD;
      const w = room.width * scale;
      const h = room.height * scale;
      const label = (room.label ?? room.type ?? '').toString();
      return `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(34,197,94,0.07)" stroke="#5a9a72" stroke-width="1.5" />
        <text x="${x + 5}" y="${y + 14}" font-size="11" fill="#a8cdb8" font-family="ui-monospace,monospace">${escapeXml(label)}</text>
      `;
    })
    .join('\n');

  const svg = `
    <svg width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${svgW}" height="${svgH}" fill="#0e1812" rx="6" />
      ${svgElements}
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
