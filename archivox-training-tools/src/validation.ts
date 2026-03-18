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
          message: `Room ${rooms[i].id} appears to be fully contained inside room ${rooms[j].id}.`,
          detail: { inner: rooms[i].id, outer: rooms[j].id },
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
      for (const room of rooms) {
        if (stdDev > 0 && Math.abs(room.area - mean) > 3 * stdDev) {
          areaOutliers.push(room.id);
          warnings.push({
            level: 'warning',
            code: 'AREA_OUTLIER',
            message: `Room ${room.id} has an extreme area (${room.area.toFixed(2)}) — more than 3σ from mean (${mean.toFixed(2)}).`,
            detail: { roomId: room.id, area: room.area, mean, stdDev },
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

  if (labelCoveragePercent < 50 && rooms.length > 0) {
    warnings.push({
      level: 'warning',
      code: 'LOW_LABEL_COVERAGE',
      message: `Only ${labelCoveragePercent.toFixed(1)}% of rooms have assigned labels.`,
      detail: { labeledRooms, totalRooms: rooms.length },
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

  // ── 7. Empty plan ─────────────────────────────────────────────────────────
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
      labeled: rooms.filter((r) => r.label !== null).length,
      selfIntersecting: selfIntersecting.length,
      nested: insideOther.length,
      outliers: areaOutliers.length,
      isolated: isolatedRooms.length,
      warnings: warnings.length,
      errors: errors.length,
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
