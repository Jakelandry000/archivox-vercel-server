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

export interface Point2D {
  x: number;
  y: number;
}

export type WallKind = 'interior' | 'exterior' | 'unknown';

export interface Wall2D {
  id: string;
  a: Point2D;
  b: Point2D;
  thickness: number; // in layout units (feet/meters)
  kind?: WallKind;
}

export type OpeningType = 'door' | 'window' | 'opening';

export interface Opening2D {
  id: string;
  type: OpeningType;
  wallId: string;
  centerT: number; // 0..1 along wall segment from a->b
  width: number; // in layout units
  // Door-specific (optional for now)
  swing?: 'left' | 'right' | 'double' | 'none';
  handing?: 'in' | 'out' | 'none';
}

export interface LayoutV1 {
  schemaVersion: 'layout.v1';
  units: Units;
  dimensions: Bounds2D;
  rooms: Room2D[];
  walls?: Wall2D[];
  openings?: Opening2D[];
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

  const walls = Array.isArray(input?.walls)
    ? input.walls.map((w: any, i: number) => ({
        id: w?.id ?? `wall_${i + 1}`,
        a: { x: Number(w?.a?.x ?? 0), y: Number(w?.a?.y ?? 0) },
        b: { x: Number(w?.b?.x ?? 0), y: Number(w?.b?.y ?? 0) },
        thickness: Number(w?.thickness ?? 0.5),
        kind: w?.kind ?? 'unknown'
      }))
    : undefined;

  const openings = Array.isArray(input?.openings)
    ? input.openings.map((o: any, i: number) => ({
        id: o?.id ?? `opening_${i + 1}`,
        type: o?.type ?? 'opening',
        wallId: String(o?.wallId ?? ''),
        centerT: Number(o?.centerT ?? 0.5),
        width: Number(o?.width ?? 3),
        swing: o?.swing,
        handing: o?.handing
      }))
    : undefined;

  return {
    schemaVersion: 'layout.v1',
    units,
    dimensions: { width: Number(dims.width ?? 40), depth: Number(dims.depth ?? 30) },
    rooms,
    walls,
    openings
  };
}
