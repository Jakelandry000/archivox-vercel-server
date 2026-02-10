import { LayoutV1, normalizeLegacyLayout } from '@archivox/core';

export function generateFloorPlanSvg(layoutInput: LayoutV1 | any) {
  const layout = normalizeLegacyLayout(layoutInput);

  const scale = 10; // px per unit
  const totalWidth = layout.dimensions.width * scale;
  const totalHeight = layout.dimensions.depth * scale;

  const svgElements = layout.rooms
    .map((room) => {
      const x = room.x * scale;
      const y = room.y * scale;
      const w = room.width * scale;
      const h = room.height * scale;
      const label = (room.label ?? room.type ?? '').toString();
      return `
        <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#444" stroke-width="2" />
        <text x="${x + 4}" y="${y + 15}" font-size="12" fill="#333">${escapeXml(label)}</text>
      `;
    })
    .join('\n');

  const svg = `
    <svg width="${totalWidth}" height="${totalHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" xmlns="http://www.w3.org/2000/svg">
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
