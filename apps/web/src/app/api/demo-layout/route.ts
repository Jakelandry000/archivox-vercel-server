import { NextResponse } from 'next/server';
import { generateAutoCadScr, generateFloorPlanSvg } from '@archivox/engines';
import { LayoutV1 } from '@archivox/core';

export async function GET() {
  const layout: LayoutV1 = {
    schemaVersion: 'layout.v1',
    units: 'feet',
    dimensions: { width: 40, depth: 30 },
    rooms: [
      { id: 'bed1', type: 'bedroom', x: 2, y: 2, width: 12, height: 10 },
      { id: 'bath1', type: 'bathroom', x: 14, y: 2, width: 8, height: 8 },
      { id: 'living1', type: 'living room', x: 2, y: 12, width: 20, height: 14 }
    ],
    walls: [
      // Exterior box
      { id: 'w1', a: { x: 0, y: 0 }, b: { x: 40, y: 0 }, thickness: 0.67, kind: 'exterior' },
      { id: 'w2', a: { x: 40, y: 0 }, b: { x: 40, y: 30 }, thickness: 0.67, kind: 'exterior' },
      { id: 'w3', a: { x: 40, y: 30 }, b: { x: 0, y: 30 }, thickness: 0.67, kind: 'exterior' },
      { id: 'w4', a: { x: 0, y: 30 }, b: { x: 0, y: 0 }, thickness: 0.67, kind: 'exterior' },

      // A couple interior partitions (illustrative)
      { id: 'w5', a: { x: 2, y: 12 }, b: { x: 22, y: 12 }, thickness: 0.5, kind: 'interior' },
      { id: 'w6', a: { x: 14, y: 2 }, b: { x: 14, y: 12 }, thickness: 0.5, kind: 'interior' }
    ],
    openings: [
      { id: 'd_front', type: 'door', wallId: 'w1', centerT: 0.15, width: 3.0, swing: 'left', handing: 'in' },
      { id: 'win1', type: 'window', wallId: 'w1', centerT: 0.65, width: 4.0 },
      { id: 'd_bed', type: 'door', wallId: 'w6', centerT: 0.25, width: 2.67 },
      { id: 'd_bath', type: 'door', wallId: 'w6', centerT: 0.72, width: 2.5 }
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
