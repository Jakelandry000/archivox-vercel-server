import {
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  associateLabels,
  distPointToPoint,
} from '../geometry';

// A simple unit square [0,0]→[1,0]→[1,1]→[0,1]
const SQUARE: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
];

// A 2×2 square at (5,5)
const SQUARE_B: Array<{ x: number; y: number }> = [
  { x: 5, y: 5 },
  { x: 7, y: 5 },
  { x: 7, y: 7 },
  { x: 5, y: 7 },
];

describe('pointInPolygon', () => {
  test('center is inside unit square', () => {
    expect(pointInPolygon({ x: 0.5, y: 0.5 }, SQUARE)).toBe(true);
  });

  test('exterior point is outside unit square', () => {
    expect(pointInPolygon({ x: 2, y: 2 }, SQUARE)).toBe(false);
  });

  test('negative coordinates are outside unit square', () => {
    expect(pointInPolygon({ x: -0.5, y: 0.5 }, SQUARE)).toBe(false);
  });
});

describe('polygonArea', () => {
  test('unit square has area 1', () => {
    expect(polygonArea(SQUARE)).toBeCloseTo(1, 6);
  });

  test('2×2 square has area 4', () => {
    expect(polygonArea(SQUARE_B)).toBeCloseTo(4, 6);
  });
});

describe('polygonCentroid', () => {
  test('centroid of unit square is (0.5, 0.5)', () => {
    const c = polygonCentroid(SQUARE);
    expect(c.x).toBeCloseTo(0.5, 5);
    expect(c.y).toBeCloseTo(0.5, 5);
  });

  test('centroid of SQUARE_B is (6, 6)', () => {
    const c = polygonCentroid(SQUARE_B);
    expect(c.x).toBeCloseTo(6, 5);
    expect(c.y).toBeCloseTo(6, 5);
  });
});

// ─── Label-to-polygon association ─────────────────────────────────────────────

describe('associateLabels — containment', () => {
  const polygons = [SQUARE, SQUARE_B];

  test('label inside first polygon assigned to polygon 0', () => {
    const labels = [{ text: 'Living Room', normalizedText: 'living room', position: { x: 0.5, y: 0.5 } }];
    const result = associateLabels(labels, polygons, 100);
    expect(result[0].polygonIndex).toBe(0);
    expect(result[0].provenance).toBe('containment');
    expect(result[0].confidence).toBeCloseTo(1.0);
  });

  test('label inside second polygon assigned to polygon 1', () => {
    const labels = [{ text: 'Bedroom', normalizedText: 'bedroom', position: { x: 6, y: 6 } }];
    const result = associateLabels(labels, polygons, 100);
    expect(result[0].polygonIndex).toBe(1);
    expect(result[0].provenance).toBe('containment');
  });

  test('two labels, each in their respective polygon', () => {
    const labels = [
      { text: 'A', normalizedText: 'a', position: { x: 0.5, y: 0.5 } },
      { text: 'B', normalizedText: 'b', position: { x: 6, y: 6 } },
    ];
    const result = associateLabels(labels, polygons, 100);
    expect(result[0].polygonIndex).toBe(0);
    expect(result[1].polygonIndex).toBe(1);
  });
});

describe('associateLabels — nearest-centroid fallback', () => {
  const polygons = [SQUARE, SQUARE_B];

  test('label outside all polygons but close to SQUARE → nearest-centroid to polygon 0', () => {
    // Point at (0.5, 1.5) — outside SQUARE (above it), centroid of SQUARE is (0.5,0.5)
    const labels = [{ text: 'Hall', normalizedText: 'hall', position: { x: 0.5, y: 1.5 } }];
    const result = associateLabels(labels, polygons, 5);
    // Distance to centroid of SQUARE (0.5,0.5) = 1.0
    // Distance to centroid of SQUARE_B (6,6) = sqrt(30.25+20.25) ≈ 7.1
    expect(result[0].polygonIndex).toBe(0);
    expect(result[0].provenance).toBe('nearest-centroid');
    expect(result[0].confidence).toBeGreaterThan(0);
  });

  test('label beyond maxDistance → no match (polygonIndex -1)', () => {
    const labels = [{ text: 'Garage', normalizedText: 'garage', position: { x: 100, y: 100 } }];
    const result = associateLabels(labels, polygons, 5);
    expect(result[0].polygonIndex).toBe(-1);
    expect(result[0].provenance).toBe('none');
    expect(result[0].confidence).toBe(0);
  });
});

describe('associateLabels — ambiguous containment (multiple polygons)', () => {
  // Small square inside larger square
  const outer: Array<{ x: number; y: number }> = [
    { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 },
  ];
  const inner: Array<{ x: number; y: number }> = [
    { x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 },
  ];

  test('label inside both polygons → assigned to smallest (inner)', () => {
    // Point at (5,5) is inside both outer and inner
    const labels = [{ text: 'Room', normalizedText: 'room', position: { x: 5, y: 5 } }];
    const result = associateLabels(labels, [outer, inner], 100);
    // inner has area 16, outer has area 100 → inner is smaller → index 1
    expect(result[0].polygonIndex).toBe(1);
    expect(result[0].confidence).toBeCloseTo(0.8);
  });
});
