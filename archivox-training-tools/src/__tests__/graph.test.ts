import { buildAdjacencyEdges, buildGraphSpec } from '../graph';
import { Room } from '../types';
import { polygonCentroid, polygonArea, polygonPerimeter } from '../geometry';

function makeRoom(id: string, polygon: Array<{ x: number; y: number }>, label?: string): Room {
  return {
    id,
    polygon,
    centroid: polygonCentroid(polygon),
    area: polygonArea(polygon),
    perimeter: polygonPerimeter(polygon),
    label: label ?? null,
    labelConfidence: label ? 1.0 : 0,
    labelProvenance: label ? 'containment' : 'none',
  };
}

// Room A: unit square [0,1]×[0,1]
const ROOM_A = makeRoom('room-A', [
  { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
], 'living room');

// Room B: directly adjacent to A — [1,2]×[0,1] (shares edge x=1)
const ROOM_B = makeRoom('room-B', [
  { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 1 }, { x: 1, y: 1 },
], 'bedroom');

// Room C: far away — [10,11]×[10,11]
const ROOM_C = makeRoom('room-C', [
  { x: 10, y: 10 }, { x: 11, y: 10 }, { x: 11, y: 11 }, { x: 10, y: 11 },
]);

// Room D: close to A but not touching (gap of 0.5)
const ROOM_D = makeRoom('room-D', [
  { x: 1.5, y: 0 }, { x: 2.5, y: 0 }, { x: 2.5, y: 1 }, { x: 1.5, y: 1 },
]);

describe('buildAdjacencyEdges', () => {
  test('adjacent rooms (touching boundary) produce an edge', () => {
    const edges = buildAdjacencyEdges([ROOM_A, ROOM_B], 1);
    expect(edges).toHaveLength(1);
    expect(edges[0].sourceId).toBe('room-A');
    expect(edges[0].targetId).toBe('room-B');
  });

  test('touching rooms have weight ~0 and shared-boundary type', () => {
    const edges = buildAdjacencyEdges([ROOM_A, ROOM_B], 1);
    expect(edges[0].weight).toBeCloseTo(0, 3);
    expect(edges[0].adjacencyType).toBe('shared-boundary');
  });

  test('far-apart rooms produce no edge', () => {
    const edges = buildAdjacencyEdges([ROOM_A, ROOM_C], 1);
    expect(edges).toHaveLength(0);
  });

  test('rooms within threshold but not touching produce proximity edge', () => {
    // Room D is 0.5 units from Room A (gap between x=1 and x=1.5)
    const edges = buildAdjacencyEdges([ROOM_A, ROOM_D], 1);
    expect(edges).toHaveLength(1);
    expect(edges[0].adjacencyType).toBe('proximity');
    expect(edges[0].weight).toBeCloseTo(0.5, 1);
  });

  test('threshold of 0 catches only exactly touching', () => {
    // A and B touch at x=1 → distance=0 → should be included
    const edgesAB = buildAdjacencyEdges([ROOM_A, ROOM_B], 0);
    expect(edgesAB).toHaveLength(1);

    // A and D have gap 0.5 → not included at threshold=0
    const edgesAD = buildAdjacencyEdges([ROOM_A, ROOM_D], 0);
    expect(edgesAD).toHaveLength(0);
  });

  test('no edges when there is only one room', () => {
    const edges = buildAdjacencyEdges([ROOM_A], 100);
    expect(edges).toHaveLength(0);
  });
});

describe('buildGraphSpec', () => {
  test('isolated room appears in globalFeatures.isolatedRooms', () => {
    const graph = buildGraphSpec('plan-001', [ROOM_A, ROOM_C], { threshold: 1 });
    expect(graph.globalFeatures.isolatedRooms).toContain('room-A');
    expect(graph.globalFeatures.isolatedRooms).toContain('room-C');
  });

  test('connected rooms are not in isolatedRooms', () => {
    const graph = buildGraphSpec('plan-001', [ROOM_A, ROOM_B], { threshold: 1 });
    expect(graph.globalFeatures.isolatedRooms).toHaveLength(0);
  });

  test('graph nodes match room count', () => {
    const graph = buildGraphSpec('plan-001', [ROOM_A, ROOM_B, ROOM_C], { threshold: 1 });
    expect(graph.nodes).toHaveLength(3);
  });

  test('room labels appear in nodes', () => {
    const graph = buildGraphSpec('plan-001', [ROOM_A, ROOM_B], { threshold: 1 });
    const nodeA = graph.nodes.find((n) => n.id === 'room-A');
    expect(nodeA?.label).toBe('living room');
  });

  test('roomCountByType groups unlabeled rooms', () => {
    const graph = buildGraphSpec('plan-001', [ROOM_A, ROOM_C], { threshold: 1 });
    expect(graph.globalFeatures.roomCountByType['unlabeled']).toBe(1);
    expect(graph.globalFeatures.roomCountByType['living room']).toBe(1);
  });

  test('totalArea sums room areas', () => {
    const graph = buildGraphSpec('plan-001', [ROOM_A, ROOM_B], { threshold: 10 });
    // Both are unit squares → total = 2
    expect(graph.globalFeatures.totalArea).toBeCloseTo(2, 5);
  });

  test('schemaVersion is correct', () => {
    const graph = buildGraphSpec('plan-001', [], { threshold: 1 });
    expect(graph.schemaVersion).toBe('GraphSpec@v1');
  });
});
