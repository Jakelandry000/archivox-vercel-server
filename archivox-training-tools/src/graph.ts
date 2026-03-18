import { Room, GraphSpec, GraphNode, GraphEdge, GraphGlobalFeatures } from './types';
import { distPolygonToPolygon } from './geometry';

export interface AdjacencyOptions {
  /** Maximum boundary distance (in plan units) to consider two rooms adjacent. */
  threshold: number;
}

/**
 * Builds a list of adjacency edges between rooms.
 *
 * Two rooms are adjacent when the minimum distance between their polygon
 * boundaries is within `threshold`.  Edge weight = that minimum distance
 * (0 means touching/shared boundary).
 *
 * Adjacency type:
 *  - 'shared-boundary' when minDist < threshold * 0.05  (nearly touching)
 *  - 'proximity'       otherwise
 */
export function buildAdjacencyEdges(
  rooms: Room[],
  threshold: number,
): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const dist = distPolygonToPolygon(rooms[i].polygon, rooms[j].polygon);
      if (dist <= threshold) {
        const adjacencyType: GraphEdge['adjacencyType'] =
          dist < threshold * 0.05 ? 'shared-boundary' : 'proximity';
        edges.push({
          sourceId: rooms[i].id,
          targetId: rooms[j].id,
          weight: dist,
          adjacencyType,
        });
      }
    }
  }
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
  const nodes: GraphNode[] = rooms.map((r) => ({
    id: r.id,
    type: 'room' as const,
    label: r.label,
    area: r.area,
    centroid: r.centroid,
    labelDistribution: r.label ? { [r.label]: r.labelConfidence } : {},
  }));

  const edges = buildAdjacencyEdges(rooms, options.threshold);

  // Find isolated rooms (no edges)
  const connectedIds = new Set<string>();
  for (const e of edges) {
    connectedIds.add(e.sourceId);
    connectedIds.add(e.targetId);
  }
  const isolatedRooms = rooms.filter((r) => !connectedIds.has(r.id)).map((r) => r.id);

  // Room counts by type (label)
  const roomCountByType: Record<string, number> = {};
  for (const r of rooms) {
    const key = r.label ?? 'unlabeled';
    roomCountByType[key] = (roomCountByType[key] ?? 0) + 1;
  }

  const totalArea = rooms.reduce((s, r) => s + r.area, 0);

  const globalFeatures: GraphGlobalFeatures = {
    totalArea,
    roomCount: rooms.length,
    roomCountByType,
    isolatedRooms,
  };

  return {
    schemaVersion: 'GraphSpec@v1',
    planId,
    nodes,
    edges,
    globalFeatures,
  };
}
