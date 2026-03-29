/**
 * Unit tests for the DXF parser (Phase C1).
 *
 * Uses synthetic in-memory DXF fixtures — no real dataset files required.
 */

import { describe, it, expect } from 'vitest';
import { parseDxfContent } from '../parsers/dxf';

// ─── DXF fixture helpers ───────────────────────────────────────────────────────

/**
 * Minimal valid DXF with:
 *  - One closed LWPOLYLINE: axis-aligned rectangle (0,0)→(100,100)
 *    Encoded as 5 vertices with vertex[4] == vertex[0] (coincident close).
 *  - One TEXT entity "LIVING ROOM" at (50, 50) — inside the rectangle.
 */
const DXF_ONE_ROOM_INSIDE_LABEL = `  0
SECTION
  2
HEADER
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  8
0
 90
5
 70
1
 10
0.0
 20
0.0
 10
100.0
 20
0.0
 10
100.0
 20
100.0
 10
0.0
 20
100.0
 10
0.0
 20
0.0
  0
TEXT
  8
0
  1
LIVING ROOM
 10
50.0
 20
50.0
 40
10.0
  0
ENDSEC
  0
EOF
`;

/**
 * DXF with:
 *  - One closed LWPOLYLINE: rectangle (0,0)→(100,100).
 *  - One TEXT entity "KITCHEN" at (150, 50) — outside the rectangle,
 *    but within nearest-centroid threshold.
 */
const DXF_ONE_ROOM_OUTSIDE_LABEL = `  0
SECTION
  2
HEADER
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  8
0
 90
5
 70
1
 10
0.0
 20
0.0
 10
100.0
 20
0.0
 10
100.0
 20
100.0
 10
0.0
 20
100.0
 10
0.0
 20
0.0
  0
TEXT
  8
0
  1
KITCHEN
 10
150.0
 20
50.0
 40
10.0
  0
ENDSEC
  0
EOF
`;

/**
 * DXF with two adjacent rooms and matching labels:
 *  - Room A: rectangle (0,0)→(100,100), label at (50,50)
 *  - Room B: rectangle (100,0)→(200,100), label at (150,50)
 *  They share the edge at x=100.
 */
const DXF_TWO_ROOMS = `  0
SECTION
  2
HEADER
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  8
0
 90
5
 70
1
 10
0.0
 20
0.0
 10
100.0
 20
0.0
 10
100.0
 20
100.0
 10
0.0
 20
100.0
 10
0.0
 20
0.0
  0
LWPOLYLINE
  8
0
 90
5
 70
1
 10
100.0
 20
0.0
 10
200.0
 20
0.0
 10
200.0
 20
100.0
 10
100.0
 20
100.0
 10
100.0
 20
0.0
  0
TEXT
  8
0
  1
ROOM A
 10
50.0
 20
50.0
  0
TEXT
  8
0
  1
ROOM B
 10
150.0
 20
50.0
  0
ENDSEC
  0
EOF
`;

/**
 * DXF with a degenerate polygon (all 4 vertices at the same point).
 * It should be skipped and a warning issued.
 */
const DXF_DEGENERATE_POLYGON = `  0
SECTION
  2
HEADER
  0
ENDSEC
  0
SECTION
  2
ENTITIES
  0
LWPOLYLINE
  8
0
 90
5
 70
1
 10
50.0
 20
50.0
 10
50.0
 20
50.0
 10
50.0
 20
50.0
 10
50.0
 20
50.0
 10
50.0
 20
50.0
  0
LWPOLYLINE
  8
0
 90
5
 70
1
 10
0.0
 20
0.0
 10
100.0
 20
0.0
 10
100.0
 20
100.0
 10
0.0
 20
100.0
 10
0.0
 20
0.0
  0
ENDSEC
  0
EOF
`;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parseDxfContent — basic extraction', () => {
  it('finds 1 polygon from a simple closed rectangle', () => {
    const result = parseDxfContent(DXF_ONE_ROOM_INSIDE_LABEL);
    expect(result.rooms).toHaveLength(1);
  });

  it('computes correct area for a 100×100 rectangle (area = 10000)', () => {
    const result = parseDxfContent(DXF_ONE_ROOM_INSIDE_LABEL);
    expect(result.rooms[0].area).toBeCloseTo(10000, 2);
  });

  it('computes correct centroid for a 100×100 rectangle (50,50)', () => {
    const result = parseDxfContent(DXF_ONE_ROOM_INSIDE_LABEL);
    const { centroid } = result.rooms[0];
    expect(centroid.x).toBeCloseTo(50, 2);
    expect(centroid.y).toBeCloseTo(50, 2);
  });

  it('extracts 1 text token with correct normalized text', () => {
    const result = parseDxfContent(DXF_ONE_ROOM_INSIDE_LABEL);
    expect(result.labels).toHaveLength(1);
    const token = result.labels[0];
    expect(token.normalizedText).toBe('living room');
    expect(token.kind).toBe('TEXT');
  });

  it('tokens have deterministic ids starting from token-0000', () => {
    const result = parseDxfContent(DXF_ONE_ROOM_INSIDE_LABEL);
    expect(result.labels[0].id).toBe('token-0000');
  });

  it('tokens carry raw text and height', () => {
    const result = parseDxfContent(DXF_ONE_ROOM_INSIDE_LABEL);
    const token = result.labels[0];
    expect(token.raw).toBe('LIVING ROOM');
    expect(token.height).toBeCloseTo(10.0, 4);
  });
});

describe('parseDxfContent — label association (containment)', () => {
  it('assigns the label to the room when token is inside polygon', () => {
    const result = parseDxfContent(DXF_ONE_ROOM_INSIDE_LABEL);
    const room = result.rooms[0];
    expect(room.label).toBe('living room');
    expect(room.labelProvenance).toBe('containment');
    expect(room.labelConfidence).toBeCloseTo(1.0, 4);
  });

  it('room has polygonId matching room id', () => {
    const result = parseDxfContent(DXF_ONE_ROOM_INSIDE_LABEL);
    const room = result.rooms[0];
    expect(room.polygonId).toBe(room.id);
  });

  it('assignedLabel.tokenId references the correct token', () => {
    const result = parseDxfContent(DXF_ONE_ROOM_INSIDE_LABEL);
    const room = result.rooms[0];
    expect(room.assignedLabel).not.toBeNull();
    expect(room.assignedLabel?.tokenId).toBe('token-0000');
    expect(room.assignedLabel?.method).toBe('containment');
  });
});

describe('parseDxfContent — label association (nearest-centroid fallback)', () => {
  it('assigns a label via nearest-centroid when token is outside polygon', () => {
    // Token at (150,50) is outside (0,0)→(100,100). Centroid at (50,50).
    // Distance = 100. With default labelMaxDistance=500, should still match.
    const result = parseDxfContent(DXF_ONE_ROOM_OUTSIDE_LABEL, 500);
    const room = result.rooms[0];
    expect(room.label).toBe('kitchen');
    expect(room.labelProvenance).toBe('nearest-centroid');
    expect(room.labelConfidence).toBeGreaterThan(0);
    expect(room.labelConfidence).toBeLessThan(1);
  });

  it('does not assign label when token is beyond the distance threshold', () => {
    // Use a very small threshold (10) — token at distance 100 should not match.
    const result = parseDxfContent(DXF_ONE_ROOM_OUTSIDE_LABEL, 10);
    expect(result.rooms[0].label).toBeNull();
    expect(result.rooms[0].labelProvenance).toBe('none');
  });
});

describe('parseDxfContent — two rooms', () => {
  it('extracts 2 rooms', () => {
    const result = parseDxfContent(DXF_TWO_ROOMS);
    expect(result.rooms).toHaveLength(2);
  });

  it('assigns distinct labels to each room', () => {
    const result = parseDxfContent(DXF_TWO_ROOMS);
    const labels = result.rooms.map((r) => r.label).sort();
    expect(labels).toEqual(['room a', 'room b']);
  });

  it('rooms have deterministic ids room-0000 and room-0001', () => {
    const result = parseDxfContent(DXF_TWO_ROOMS);
    const ids = result.rooms.map((r) => r.id).sort();
    expect(ids).toEqual(['room-0000', 'room-0001']);
  });

  it('produces identical results on two independent parses (determinism)', () => {
    const r1 = parseDxfContent(DXF_TWO_ROOMS);
    const r2 = parseDxfContent(DXF_TWO_ROOMS);
    expect(JSON.stringify(r1.rooms)).toBe(JSON.stringify(r2.rooms));
    expect(JSON.stringify(r1.labels)).toBe(JSON.stringify(r2.labels));
  });
});

describe('parseDxfContent — degenerate polygon filtering', () => {
  it('skips degenerate polygon (all vertices coincident) and keeps valid one', () => {
    const result = parseDxfContent(DXF_DEGENERATE_POLYGON);
    // The degenerate polygon (all at 50,50) is skipped; the valid 100×100 remains.
    expect(result.rooms).toHaveLength(1);
  });

  it('emits a warning when degenerate polygons are skipped', () => {
    const result = parseDxfContent(DXF_DEGENERATE_POLYGON);
    const warn = result.warnings.find((w) => w.code === 'DEGENERATE_POLYGONS_SKIPPED');
    expect(warn).toBeDefined();
    expect((warn?.detail as { count: number })?.count).toBe(1);
  });
});

describe('parseDxfContent — geometry outputs', () => {
  it('computes bounding box covering the full rectangle', () => {
    const result = parseDxfContent(DXF_ONE_ROOM_INSIDE_LABEL);
    const { bounds } = result.geometry;
    expect(bounds.minX).toBeCloseTo(0, 4);
    expect(bounds.minY).toBeCloseTo(0, 4);
    expect(bounds.maxX).toBeCloseTo(100, 4);
    expect(bounds.maxY).toBeCloseTo(100, 4);
  });

  it('room polygon points are accessible in geometry.rooms', () => {
    const result = parseDxfContent(DXF_ONE_ROOM_INSIDE_LABEL);
    expect(result.geometry.rooms).toHaveLength(1);
    expect(result.geometry.rooms[0]).toHaveLength(4); // 5 verts → 4 after dedup
  });
});

describe('parseDxfContent — warnings', () => {
  it('emits UNITS_UNKNOWN when no $INSUNITS header', () => {
    const result = parseDxfContent(DXF_ONE_ROOM_INSIDE_LABEL);
    const warn = result.warnings.find((w) => w.code === 'UNITS_UNKNOWN');
    expect(warn).toBeDefined();
  });
});
