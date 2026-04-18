export type Units = 'feet' | 'meters';

// ── Phase 2 Schema Elements (all optional on LayoutV1 for backward compatibility) ─

export type SiteOrientation = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';

export interface DoorElement {
  id: string;
  /** 'hinged' = interior; 'sliding' = terrace/wide opening; 'entrance' = main entrance door */
  type: 'hinged' | 'sliding' | 'entrance' | 'other';
  fromRoomId: string;
  /** null for exterior-facing doors (main entrance to outside) */
  toRoomId: string | null;
  /** Clear opening width in layout units */
  clearWidth: number;
  wallSegmentId?: string;
  position?: { x: number; y: number };
}

export interface WallSegment {
  id: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  /** Wall thickness in layout units */
  thickness: number;
  type: 'exterior' | 'interior';
  roomId?: string;
}

export interface WindowElement {
  id: string;
  roomId: string;
  /** Sill height above finished floor level in layout units */
  sillHeight: number;
  wallSegmentId?: string;
  position?: { x: number; y: number };
  type?: 'standard' | 'glazed' | 'clerestory';
}

export interface FloorLevelElement {
  id: string;
  type: 'NPT' | 'FFL' | 'step';
  /** Level value relative to datum in layout units */
  value: number;
  /** Room IDs that belong to this floor-level zone */
  zoneRoomIds: string[];
  annotation?: string;
}

export interface StairElement {
  id: string;
  fromFloor: number;
  toFloor: number;
  /** Room ID from which the stair is directly accessible */
  adjacentRoomId: string;
  type?: 'internal' | 'external' | 'emergency';
}

export interface RampElement {
  id: string;
  /** Landing depth at the approach end in layout units */
  landingDepthStart: number;
  /** Landing depth at the arrival end in layout units */
  landingDepthEnd: number;
  adjacentRoomId?: string;
  type?: 'parking' | 'pedestrian';
}

export interface KitchenFixtureElement {
  id: string;
  roomId: string;
  /** Functional zones present in this kitchen */
  zones: Array<'cooking' | 'washing' | 'storage'>;
  /** Counter/bench depth in layout units (for R-094) */
  counterDepth?: number;
}

export interface BathroomFixtureElement {
  id: string;
  roomId: string;
  /** Sanitary fixtures present in this bathroom */
  fixtures: Array<'wc' | 'bath' | 'shower' | 'basin'>;
}

export interface DimensionAnnotationElement {
  id: string;
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
  /** Annotated dimension as shown on plan (in layout units) */
  annotatedValue: number;
}

export interface FireplaceElement {
  id: string;
  roomId: string;
  wallSegmentId?: string;
  position?: { x: number; y: number };
}

/**
 * Phase 3 — Viewport pipeline element.
 * Captures where the renderer has placed a room-name label on the 2D plan canvas.
 * Consumed by R-102 to detect label-geometry and label-label overlap.
 */
export interface ViewportLabelElement {
  id: string;
  /** Room this label identifies */
  roomId: string;
  /** Centre of the rendered label bounding box, in plan coordinates (same units as rooms) */
  position: { x: number; y: number };
  /** Rendered text bounding box dimensions in plan coordinates */
  size: { width: number; height: number };
}

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
  // Phase 2 — optional schema extensions (all backward-compatible; absent = not modelled yet)
  doors?: DoorElement[];
  walls?: WallSegment[];
  windows?: WindowElement[];
  floorLevels?: FloorLevelElement[];
  stairs?: StairElement[];
  ramps?: RampElement[];
  siteOrientation?: SiteOrientation;
  kitchenFixtures?: KitchenFixtureElement[];
  bathroomFixtures?: BathroomFixtureElement[];
  dimensionAnnotations?: DimensionAnnotationElement[];
  fireplaces?: FireplaceElement[];
  // Phase 3 — optional viewport pipeline data (absent = R-102 skipped)
  viewportLabels?: ViewportLabelElement[];
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
