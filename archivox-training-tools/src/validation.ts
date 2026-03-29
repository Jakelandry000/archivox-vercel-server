import { PlanSpec, GraphSpec, PlanMetrics, QualitySignal } from './types';
import { SCHEMA_METRICS } from './version';
import { polygonHasSelfIntersection, polygonArea, isPolygonInsidePolygon } from './geometry';

/**
 * Runs all validation checks on a PlanSpec + GraphSpec.
 * Does NOT throw on issues — all problems are returned as signals.
 */
export function validatePlan(plan: PlanSpec, graph: GraphSpec): PlanMetrics {
  const warnings: QualitySignal[] = [];
  const errors: QualitySignal[] = [];

  const rooms = plan.rooms;

  // ── 1. Self-intersecting polygons ─────────────────────────────────────────
  const selfIntersecting: string[] = [];
  for (const room of rooms) {
    if (polygonHasSelfIntersection(room.polygon)) {
      selfIntersecting.push(room.id);
      warnings.push({
        level: 'warning',
        code: 'SELF_INTERSECTING_POLYGON',
        message: `Room ${room.id} polygon is self-intersecting.`,
        detail: { roomId: room.id },
      });
    }
  }

  // ── 2. Rooms fully inside other rooms ─────────────────────────────────────
  const insideOther: Array<{ inner: string; outer: string }> = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = 0; j < rooms.length; j++) {
      if (i === j) continue;
      if (isPolygonInsidePolygon(rooms[i].polygon, rooms[j].polygon)) {
        insideOther.push({ inner: rooms[i].id, outer: rooms[j].id });
        warnings.push({
          level: 'warning',
          code: 'ROOM_INSIDE_ROOM',
          message: `Room ${rooms[i].id} (area ${rooms[i].area.toFixed(2)}) appears to be fully contained inside room ${rooms[j].id} (area ${rooms[j].area.toFixed(2)}).`,
          detail: {
            inner: rooms[i].id,
            innerArea: rooms[i].area,
            outer: rooms[j].id,
            outerArea: rooms[j].area,
          },
        });
      }
    }
  }

  // ── 3. Extreme area outliers ──────────────────────────────────────────────
  const areaOutliers: string[] = [];
  if (rooms.length > 2) {
    const areas = rooms.map((r) => r.area).filter((a) => a > 0);
    if (areas.length > 0) {
      const mean = areas.reduce((s, a) => s + a, 0) / areas.length;
      const stdDev = Math.sqrt(areas.reduce((s, a) => s + (a - mean) ** 2, 0) / areas.length);
      const median = [...areas].sort((a, b) => a - b)[Math.floor(areas.length / 2)];
      for (const room of rooms) {
        const isStdDevOutlier = stdDev > 0 && Math.abs(room.area - mean) > 3 * stdDev;
        const isRatioOutlier = median > 0 && room.area / median > 10;
        if (isStdDevOutlier || isRatioOutlier) {
          areaOutliers.push(room.id);
          warnings.push({
            level: 'warning',
            code: 'AREA_OUTLIER',
            message: `Room ${room.id} has an extreme area (${room.area.toFixed(2)}) — more than 3σ from mean (${mean.toFixed(2)}) or >10× median (${median.toFixed(2)}).`,
            detail: { roomId: room.id, area: room.area, mean, stdDev, median },
          });
        }
      }
    }
  }

  // ── 4. Zero-area polygons ──────────────────────────────────────────────────
  for (const room of rooms) {
    if (room.area < 1e-6) {
      errors.push({
        level: 'error',
        code: 'ZERO_AREA_POLYGON',
        message: `Room ${room.id} has near-zero area (${room.area}).`,
        detail: { roomId: room.id, area: room.area },
      });
    }
  }

  // ── 5. Label coverage ─────────────────────────────────────────────────────
  const labeledRooms = rooms.filter((r) => r.label !== null).length;
  const labelCoveragePercent = rooms.length > 0
    ? (labeledRooms / rooms.length) * 100
    : 0;

  // Warn if plan has extracted label tokens but coverage is below 30%.
  const hasLabelTokens = plan.labels.length > 0;
  const coverageThreshold = hasLabelTokens ? 30 : 50;
  if (labelCoveragePercent < coverageThreshold && rooms.length > 0) {
    warnings.push({
      level: 'warning',
      code: 'LOW_LABEL_COVERAGE',
      message: `Only ${labelCoveragePercent.toFixed(1)}% of rooms have assigned labels (threshold: ${coverageThreshold}%).`,
      detail: { labeledRooms, totalRooms: rooms.length, labelsTotal: plan.labels.length },
    });
  }

  // ── 6. Isolated rooms from graph ──────────────────────────────────────────
  const isolatedRooms = graph.globalFeatures.isolatedRooms;
  for (const id of isolatedRooms) {
    warnings.push({
      level: 'warning',
      code: 'ISOLATED_ROOM',
      message: `Room ${id} is not adjacent to any other room in the graph.`,
      detail: { roomId: id },
    });
  }

  // ── 7. Graph connectivity — multiple connected components ─────────────────
  const components = graph.globalFeatures.components ?? 1;
  if (components > 1 && rooms.length > 1) {
    warnings.push({
      level: 'warning',
      code: 'DISCONNECTED_GRAPH',
      message: `Adjacency graph has ${components} connected component(s). The plan may contain isolated room clusters.`,
      detail: { components },
    });
  }

  // ── 8. Empty plan ─────────────────────────────────────────────────────────
  if (rooms.length === 0) {
    warnings.push({
      level: 'warning',
      code: 'NO_ROOMS',
      message: 'No rooms were extracted from this plan.',
    });
  }

  return {
    schemaVersion: SCHEMA_METRICS,
    planId: plan.planId,
    counts: {
      rooms: rooms.length,
      labeled: labeledRooms,
      selfIntersecting: selfIntersecting.length,
      nested: insideOther.length,
      outliers: areaOutliers.length,
      isolated: isolatedRooms.length,
      warnings: warnings.length,
      errors: errors.length,
      labelsTotal: plan.labels.length,
      roomsLabeled: labeledRooms,
      edgesTotal: graph.edges.length,
      components,
    },
    labelCoveragePercent,
    selfIntersectingPolygons: selfIntersecting,
    roomsInsideOtherRooms: insideOther,
    areaOutliers,
    isolatedRooms,
    warnings,
    errors,
  };
}
