import { NextResponse } from 'next/server';
import { generateAutoCadScr, generateFloorPlanSvg } from '@archivox/engines';
import { LayoutV1 } from '@archivox/core';

export async function GET() {
  const layout: LayoutV1 = {
    schemaVersion: 'layout.v1',
    units: 'feet',
    dimensions: { width: 40, depth: 30 },
    rooms: [
      { id: 'bed1', type: 'bedroom', x: 0, y: 0, width: 12, height: 10 },
      { id: 'bath1', type: 'bathroom', x: 12, y: 0, width: 8, height: 8 },
      { id: 'living1', type: 'living room', x: 0, y: 10, width: 20, height: 15 }
    ]
  };

  const { svg } = generateFloorPlanSvg(layout);
  const { script } = generateAutoCadScr(layout);

  return NextResponse.json({
    layout,
    svg,
    script
  });
}
