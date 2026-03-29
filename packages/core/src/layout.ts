export type Units = 'feet' | 'meters';

export type RoomType =
  | 'bedroom'
  | 'bathroom'
  | 'kitchen'
  | 'living'
  | 'living room'
  | 'dining'
  | 'office'
  | 'laundry'
  | 'garage'
  | 'hall'
  | 'closet'
  | 'other';

export interface Bounds2D {
  width: number;
  depth: number;
}

export interface Room2D {
  id: string;
  type: RoomType | string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutV1 {
  schemaVersion: 'layout.v1';
  units: Units;
  dimensions: Bounds2D;
  rooms: Room2D[];
}

export function isLayoutV1(x: any): x is LayoutV1 {
  return (
    x &&
    x.schemaVersion === 'layout.v1' &&
    x.units &&
    x.dimensions &&
    typeof x.dimensions.width === 'number' &&
    typeof x.dimensions.depth === 'number' &&
    Array.isArray(x.rooms)
  );
}

export function normalizeLegacyLayout(input: any): LayoutV1 {
  // Accepts your legacy shape: { dimensions:{width,depth}, units, rooms:[{type,x,y,width,height}] }
  const units: Units = (input?.units === 'meters' ? 'meters' : 'feet');
  const dims = input?.dimensions ?? { width: 40, depth: 30 };
  const rooms = (input?.rooms ?? []).map((r: any, i: number) => ({
    id: r?.id ?? `room_${i + 1}`,
    type: r?.type ?? 'other',
    label: r?.label,
    x: Number(r?.x ?? 0),
    y: Number(r?.y ?? 0),
    width: Number(r?.width ?? 1),
    height: Number(r?.height ?? 1)
  }));

  return {
    schemaVersion: 'layout.v1',
    units,
    dimensions: { width: Number(dims.width ?? 40), depth: Number(dims.depth ?? 30) },
    rooms
  };
}
