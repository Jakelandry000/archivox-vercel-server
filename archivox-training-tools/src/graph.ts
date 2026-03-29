import { Room, GraphSpec, GraphNode, GraphEdge, GraphGlobalFeatures, BoundingBox } from './types';
import { distPolygonToPolygon, polygonBounds } from './geometry';

export interface AdjacencyOptions {
  /** Maximum boundary distance (in plan units) to consider two rooms adjacent. */
  threshold: number;
}

/**
 * Returns true if the two bounding boxes could contain polygons within `threshold`
 * of each other (fast reject: if bboxes are further than threshold apart on any
 * axis, no boundary point pair can be within threshold).
 */
function bboxCouldBeAdjacent(a: BoundingBox, b: BoundingBox, threshold: number): boolean {
  return !(
    a.minX > b.maxX + threshold ||
    b.minX > a.maxX + threshold ||
    a.minY > b.maxY + threshold ||
    b.minY > a.maxY + threshold
  );
}

/**
 * Counts connected components using union-find.
 */
function connectedComponents(nodeIds: string[], edges: GraphEdge[]): number {
  if (nodeIds.length === 0) return 0;
  const parent = new Map<string, string>();
  for (const id of nodeIds) parent.set(id, id);

  function find(id: string): string {
    const p = parent.get(id)!;
    if (p !== id) {
      parent.set(id, find(p));
    }
    return parent.get(id)!;
  }

  for (const e of edges) {
    const ra = find(e.sourceId);
    const rb = find(e.targetId);
    if (ra !== rb) parent.set(ra, rb);
  }

  const roots = new Set<string>();
  for (const id of nodeIds) roots.add(find(id));
  return roots.size;
}

/**
 * Builds a list of adjacency edges between rooms.
 *
 * Two rooms are adjacent when the minimum distance between their polygon
 * boundaries is within `threshold`.  Edge weight = that minimum distance
 * (0 means touching/shared boundary).
 *
 * Pre-filters candidate pairs using bounding-box overlap expanded by `threshold`
 * to skip obviously non-adjacent room pairs in O(n) instead of O(n²·m·k).
 *
 * Adjacency type:
 *  - 'shared-boundary' when minDist < threshold * 0.05  (nearly touching)
 *  - 'proximity'       otherwise
 *
 * Output edges are sorted lexicographically by (sourceId, targetId) for
 * deterministic output regardless of room list order.
 */
export function buildAdjacencyEdges(
  rooms: Room[],
  threshold: number,
): GraphEdge[] {
  // Pre-compute bounding boxes once per room.
  const bboxes: BoundingBox[] = rooms.map((r) => polygonBounds(r.polygon));

  const edges: GraphEdge[] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      // Fast reject via bbox
      if (!bboxCouldBeAdjacent(bboxes[i], bboxes[j], threshold)) continue;

      const dist = distPolygonToPolygon(rooms[i].polygon, rooms[j].polygon);
      if (dist <= threshold) {
        const adjacencyType: GraphEdge['adjacencyType'] =
          dist < threshold * 0.05 ? 'shared-boundary' : 'proximity';

        // Normalise ordering so sourceId < targetId lexicographically.
        const [aId, bId] =
          rooms[i].id <= rooms[j].id
            ? [rooms[i].id, rooms[j].id]
            : [rooms[j].id, rooms[i].id];

        edges.push({
          sourceId: aId,
          targetId: bId,
          weight: dist,
          adjacencyType,
        });
      }
    }
  }

  // Sort edges lexicographically by (sourceId, targetId) for determinism.
  edges.sort((a, b) => {
    if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1;
    return a.targetId < b.targetId ? -1 : 1;
  });

  return edges;
}

/**
 * Builds the full GraphSpec for a plan.
 */
export function buildGraphSpec(
  planId: string,
  rooms: Room[],
  options: AdjacencyOptions,
): GraphSpec {
  // Sort nodes by room id for determinism.
  const sortedRooms = [...rooms].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const nodes: GraphNode[] = sortedRooms.map((r) => ({
    id: r.id,
    type: 'room' as const,
    label: r.label,
    area: r.area,
    centroid: r.centroid,
    labelDistribution: r.label ? { [r.label]: r.labelConfidence } : {},
  }));

  const edges = buildAdjacencyEdges(sortedRooms, options.threshold);

  // Find isolated rooms (no edges)
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.sourceId);
    connectedIds.add(e.targetId);
  }
  const isolatedRooms = sortedRooms.filter((r) => !connectedIds.has(r.id)).map((r) => r.id);

  // Room counts by type (label)
  const roomCountByType: Record<string, number> = {};
  for (const r of sortedRooms) {
    const key = r.label ?? 'unlabeled';
    roomCountByType[key] = (roomCountByType[key] ?? 0) + 1;
  }

  const totalArea = sortedRooms.reduce((s, r) => s + r.area, 0);

  const nodeIds = nodes.map((n) => n.id);
  const components = connectedComponents(nodeIds, edges);

  const globalFeatures: GraphGlobalFeatures = {
    totalArea,
    roomCount: sortedRooms.length,
    roomCountByType,
    isolatedRooms,
    components,
  };

  return {
    schemaVersion: 'GraphSpec@v1',
    planId,
    nodes,
    edges,
    globalFeatures,
  };
}
