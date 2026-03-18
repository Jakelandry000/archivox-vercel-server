import { Point, BoundingBox } from './types';

// ─── Basic primitives ─────────────────────────────────────────────────────────

export function distPointToPoint(a: Point, b: Point): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

/**
 * Minimum distance from point p to line segment [a, b].
 */
export function distPointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distPointToPoint(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return distPointToPoint(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * Minimum distance between two polygon boundaries.
 * O(m*n) vertex-to-edge checks.
 */
export function distPolygonToPolygon(a: Point[], b: Point[]): number {
  let min = Infinity;
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      const d = distPointToSegment(a[i], b[j], b[(j + 1) % b.length]);
      if (d < min) min = d;
    }
  }
  for (let j = 0; j < b.length; j++) {
    for (let i = 0; i < a.length; i++) {
      const d = distPointToSegment(b[j], a[i], a[(i + 1) % a.length]);
      if (d < min) min = d;
    }
  }
  return min;
}

// ─── Polygon properties ───────────────────────────────────────────────────────

/**
 * Signed area (positive = counter-clockwise). Shoelace formula.
 */
export function signedPolygonArea(vertices: Point[]): number {
  const n = vertices.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vertices[i].x * vertices[j].y;
    area -= vertices[j].x * vertices[i].y;
  }
  return area / 2;
}

export function polygonArea(vertices: Point[]): number {
  return Math.abs(signedPolygonArea(vertices));
}

export function polygonPerimeter(vertices: Point[]): number {
  const n = vertices.length;
  let p = 0;
  for (let i = 0; i < n; i++) {
    p += distPointToPoint(vertices[i], vertices[(i + 1) % n]);
  }
  return p;
}

export function polygonCentroid(vertices: Point[]): Point {
  const n = vertices.length;
  if (n === 0) return { x: 0, y: 0 };
  const a = signedPolygonArea(vertices);
  if (Math.abs(a) < 1e-12) {
    // Degenerate — return arithmetic mean
    const cx = vertices.reduce((s, v) => s + v.x, 0) / n;
    const cy = vertices.reduce((s, v) => s + v.y, 0) / n;
    return { x: cx, y: cy };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = vertices[i].x * vertices[j].y - vertices[j].x * vertices[i].y;
    cx += (vertices[i].x + vertices[j].x) * cross;
    cy += (vertices[i].y + vertices[j].y) * cross;
  }
  const factor = 1 / (6 * a);
  return { x: cx * factor, y: cy * factor };
}

export function polygonBounds(vertices: Point[]): BoundingBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// ─── Containment ──────────────────────────────────────────────────────────────

/**
 * Ray-casting point-in-polygon test.
 */
export function pointInPolygon(p: Point, vertices: Point[]): boolean {
  const n = vertices.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = vertices[i].x, yi = vertices[i].y;
    const xj = vertices[j].x, yj = vertices[j].y;
    const intersects =
      yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Returns true if ALL vertices of `inner` are inside `outer`.
 */
export function isPolygonInsidePolygon(inner: Point[], outer: Point[]): boolean {
  return inner.every((v) => pointInPolygon(v, outer));
}

// ─── Self-intersection ────────────────────────────────────────────────────────

function segmentsIntersect(a1: Point, a2: Point, b1: Point, b2: Point): boolean {
  const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < 1e-12) return false; // parallel
  const dx3 = b1.x - a1.x, dy3 = b1.y - a1.y;
  const t = (dx3 * dy2 - dy3 * dx2) / denom;
  const u = (dx3 * dy1 - dy3 * dx1) / denom;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

export function polygonHasSelfIntersection(vertices: Point[]): boolean {
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // adjacent edges
      if (
        segmentsIntersect(
          vertices[i],
          vertices[(i + 1) % n],
          vertices[j],
          vertices[(j + 1) % n],
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

// ─── Label association ────────────────────────────────────────────────────────

export interface LabelAssociation {
  polygonIndex: number;
  text: string;
  normalizedText: string;
  confidence: number;
  provenance: 'containment' | 'nearest-centroid' | 'none';
}

/**
 * Assigns each label token to the most appropriate polygon.
 *
 * Strategy:
 *  1. Containment: text position inside polygon → confidence 1.0 (or 0.8 if ambiguous).
 *  2. Nearest centroid within maxDistance → confidence scaled by distance.
 *  3. No match → provenance 'none', polygonIndex -1.
 */
export function associateLabels(
  labels: Array<{ text: string; normalizedText: string; position: Point }>,
  polygons: Point[][],
  maxDistance: number,
): LabelAssociation[] {
  return labels.map(({ text, normalizedText, position }) => {
    // Step 1: containment
    const containing: number[] = [];
    for (let i = 0; i < polygons.length; i++) {
      if (pointInPolygon(position, polygons[i])) {
        containing.push(i);
      }
    }

    if (containing.length === 1) {
      return { polygonIndex: containing[0], text, normalizedText, confidence: 1.0, provenance: 'containment' };
    }
    if (containing.length > 1) {
      // Multiple containing polygons → pick smallest (most specific room)
      const smallest = containing.reduce((best, idx) =>
        polygonArea(polygons[idx]) < polygonArea(polygons[best]) ? idx : best,
      );
      return { polygonIndex: smallest, text, normalizedText, confidence: 0.8, provenance: 'containment' };
    }

    // Step 2: nearest centroid fallback
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < polygons.length; i++) {
      const centroid = polygonCentroid(polygons[i]);
      const d = distPointToPoint(position, centroid);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestIdx >= 0 && bestDist <= maxDistance) {
      const confidence = 0.5 * (1 - bestDist / maxDistance);
      return { polygonIndex: bestIdx, text, normalizedText, confidence, provenance: 'nearest-centroid' };
    }

    return { polygonIndex: -1, text, normalizedText, confidence: 0, provenance: 'none' };
  });
}

// ─── Coordinate normalization ─────────────────────────────────────────────────

/**
 * Translates all polygon vertex arrays so that the global bounding box
 * has its minimum corner at (0, 0).  Returns the translated polygons and
 * the original (pre-translation) bounds.
 */
export function normalizeToOrigin(
  polygons: Point[][],
): { normalized: Point[][]; originalBounds: BoundingBox } {
  if (polygons.length === 0) {
    return {
      normalized: [],
      originalBounds: { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 },
    };
  }
  const allPoints = polygons.flat();
  const bounds = polygonBounds(allPoints);
  const { minX, minY } = bounds;
  const normalized = polygons.map((poly) =>
    poly.map((v) => ({ x: v.x - minX, y: v.y - minY })),
  );
  return { normalized, originalBounds: bounds };
}

/**
 * Translate a set of points by the same origin offset.
 */
export function translatePoints(points: Point[], dx: number, dy: number): Point[] {
  return points.map((p) => ({ x: p.x - dx, y: p.y - dy }));
}
