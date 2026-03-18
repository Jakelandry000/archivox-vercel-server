/**
 * DXF parser module.
 *
 * Dependency: dxf-parser (v1.x)
 * Chosen because it handles the ENTITIES section for the common types we need
 * (LWPOLYLINE, LINE, TEXT, MTEXT) without requiring us to re-implement DXF
 * ASCII/binary format handling.  Limitation: does not support INSERT/BLOCK
 * expansion or HATCH entities.
 */

import * as fs from 'fs';
import DxfParser from 'dxf-parser';
import {
  LabelToken,
  PlanGeometry,
  PlanUnits,
  QualitySignal,
  WallSegment,
  Point,
  BoundingBox,
} from '../types';
import { associateLabels, normalizeToOrigin, polygonArea, polygonCentroid, polygonPerimeter } from '../geometry';

// ─── Internal DXF type declarations ──────────────────────────────────────────

interface DxfVec { x: number; y: number; z?: number }

interface DxfEntityBase {
  type: string;
  layer?: string;
  handle?: string;
  color?: number;
}

interface DxfLwPolyline extends DxfEntityBase {
  type: 'LWPOLYLINE';
  vertices: DxfVec[];
  closed?: boolean;
  shape?: boolean;
}

interface DxfPolyline extends DxfEntityBase {
  type: 'POLYLINE';
  vertices: DxfVec[];
  closed?: boolean;
}

interface DxfLine extends DxfEntityBase {
  type: 'LINE';
  start: DxfVec;
  end: DxfVec;
}

interface DxfText extends DxfEntityBase {
  type: 'TEXT';
  text: string;
  startPoint: DxfVec;
  height?: number;
}

interface DxfMtext extends DxfEntityBase {
  type: 'MTEXT';
  text: string;
  position: DxfVec;
  height?: number;
}

type DxfEntity = DxfLwPolyline | DxfPolyline | DxfLine | DxfText | DxfMtext | DxfEntityBase;

interface DxfHeader {
  $INSUNITS?: number;
  $EXTMIN?: DxfVec;
  $EXTMAX?: DxfVec;
  [key: string]: unknown;
}

interface ParsedDxf {
  header: DxfHeader;
  entities: DxfEntity[];
  blocks?: Record<string, { entities: DxfEntity[] }>;
}

// ─── Unit detection ───────────────────────────────────────────────────────────

const DXF_UNITS: Record<number, string> = {
  0: 'unitless', 1: 'inches', 2: 'feet', 3: 'miles', 4: 'mm',
  5: 'cm', 6: 'm', 7: 'km', 8: 'microinches', 9: 'mils',
  10: 'yards', 11: 'angstroms', 12: 'nanometers', 13: 'micrometers',
  14: 'decimeters', 15: 'decameters', 16: 'hectometers', 17: 'gigameters',
  18: 'au', 19: 'light-years', 20: 'parsecs',
};

function detectUnits(header: DxfHeader): PlanUnits {
  const code = header.$INSUNITS;
  if (code != null && DXF_UNITS[code]) {
    return { detected: DXF_UNITS[code], assumed: DXF_UNITS[code], confidence: 1.0 };
  }
  return { detected: 'unknown', assumed: 'mm', confidence: 0.3 };
}

// ─── Entity extraction ────────────────────────────────────────────────────────

function vecToPoint(v: DxfVec): Point {
  return { x: v.x, y: v.y };
}

function isClosedPolyline(entity: DxfLwPolyline | DxfPolyline): boolean {
  if (entity.closed) return true;
  const verts = entity.vertices;
  if (verts.length < 2) return false;
  const first = verts[0], last = verts[verts.length - 1];
  return Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6;
}

function extractPolylinesAndLines(entities: DxfEntity[]): {
  closedPolygons: Point[][];
  walls: WallSegment[];
} {
  const closedPolygons: Point[][] = [];
  const walls: WallSegment[] = [];

  for (const e of entities) {
    if (e.type === 'LWPOLYLINE' || e.type === 'POLYLINE') {
      const poly = e as DxfLwPolyline | DxfPolyline;
      if (poly.vertices.length < 3) continue;
      const pts = poly.vertices.map(vecToPoint);
      if (isClosedPolyline(poly)) {
        // Remove duplicate closing vertex if present
        const last = pts[pts.length - 1];
        const first = pts[0];
        const deduped =
          Math.abs(last.x - first.x) < 1e-6 && Math.abs(last.y - first.y) < 1e-6
            ? pts.slice(0, -1)
            : pts;
        if (deduped.length >= 3) closedPolygons.push(deduped);
      } else {
        // Open polyline → treat as a series of wall segments
        for (let i = 0; i < pts.length - 1; i++) {
          walls.push({ start: pts[i], end: pts[i + 1] });
        }
      }
    } else if (e.type === 'LINE') {
      const line = e as DxfLine;
      walls.push({ start: vecToPoint(line.start), end: vecToPoint(line.end) });
    }
  }

  return { closedPolygons, walls };
}

function extractTextEntities(entities: DxfEntity[]): LabelToken[] {
  const tokens: LabelToken[] = [];
  for (const e of entities) {
    if (e.type === 'TEXT') {
      const t = e as DxfText;
      if (t.text && t.startPoint) {
        tokens.push({
          text: t.text,
          normalizedText: normalizeText(t.text),
          position: vecToPoint(t.startPoint),
        });
      }
    } else if (e.type === 'MTEXT') {
      const t = e as DxfMtext;
      if (t.text && t.position) {
        // Strip DXF MTEXT format codes like \P, \f, {}, etc.
        const cleaned = t.text.replace(/\\[A-Za-z][^;]*;|[{}\\]|\\\\/g, '').trim();
        if (cleaned) {
          tokens.push({
            text: cleaned,
            normalizedText: normalizeText(cleaned),
            position: vecToPoint(t.position),
          });
        }
      }
    }
  }
  return tokens;
}

function normalizeText(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Global bounds helper ─────────────────────────────────────────────────────

function computeGlobalBounds(
  polygons: Point[][],
  walls: WallSegment[],
  labels: LabelToken[],
  header: DxfHeader,
): BoundingBox {
  const all: Point[] = [
    ...polygons.flat(),
    ...walls.flatMap((w) => [w.start, w.end]),
    ...labels.map((l) => l.position),
  ];

  // Prefer $EXTMIN/$EXTMAX from header when available
  if (header.$EXTMIN && header.$EXTMAX) {
    const minX = header.$EXTMIN.x, minY = header.$EXTMIN.y;
    const maxX = header.$EXTMAX.x, maxY = header.$EXTMAX.y;
    if (isFinite(minX) && isFinite(maxX) && maxX > minX) {
      return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
    }
  }

  if (all.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of all) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface DxfParseResult {
  geometry: PlanGeometry;
  labels: LabelToken[];
  units: PlanUnits;
  warnings: QualitySignal[];
  rooms: Array<{
    id: string;
    polygon: Point[];
    centroid: Point;
    area: number;
    perimeter: number;
    label: string | null;
    labelConfidence: number;
    labelProvenance: 'containment' | 'nearest-centroid' | 'none';
  }>;
}

export function parseDxfFile(
  filePath: string,
  labelMaxDistance = 500,
): DxfParseResult {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parser = new DxfParser();
  const warnings: QualitySignal[] = [];
  let dxf: ParsedDxf;

  try {
    dxf = parser.parseSync(content) as unknown as ParsedDxf;
  } catch (err) {
    throw new Error(`Failed to parse DXF file "${filePath}": ${(err as Error).message}`);
  }

  const entities: DxfEntity[] = dxf.entities ?? [];

  // Also include entities from model-space block (*Model_Space / *MODEL_SPACE)
  const blocks = dxf.blocks ?? {};
  for (const blockName of Object.keys(blocks)) {
    if (blockName.toLowerCase().includes('model_space') || blockName === '*MODEL_SPACE') {
      entities.push(...(blocks[blockName].entities ?? []));
    }
  }

  const units = detectUnits(dxf.header);
  if (units.detected === 'unknown') {
    warnings.push({ level: 'warning', code: 'UNITS_UNKNOWN', message: 'Could not detect units from $INSUNITS; assuming mm.' });
  }

  const { closedPolygons, walls } = extractPolylinesAndLines(entities);
  const labels = extractTextEntities(entities);

  if (closedPolygons.length === 0) {
    warnings.push({ level: 'warning', code: 'NO_CLOSED_POLYGONS', message: 'No closed polylines found; room extraction will be empty.' });
  }

  // Normalize coordinates: translate to origin
  const originalBounds = computeGlobalBounds(closedPolygons, walls, labels, dxf.header);
  const { normalized: normalizedPolygons, originalBounds: ob } = normalizeToOrigin(closedPolygons);
  const dx = ob.minX, dy = ob.minY;

  const normalizedWalls: WallSegment[] = walls.map((w) => ({
    start: { x: w.start.x - dx, y: w.start.y - dy },
    end: { x: w.end.x - dx, y: w.end.y - dy },
  }));
  const normalizedLabels: LabelToken[] = labels.map((l) => ({
    ...l,
    position: { x: l.position.x - dx, y: l.position.y - dy },
  }));

  const normBounds: BoundingBox = {
    minX: 0,
    minY: 0,
    maxX: originalBounds.width,
    maxY: originalBounds.height,
    width: originalBounds.width,
    height: originalBounds.height,
  };

  // Associate labels to polygons
  const associations = associateLabels(normalizedLabels, normalizedPolygons, labelMaxDistance);

  // Build label map: polygonIndex → best label
  const polyLabelMap = new Map<number, { text: string; confidence: number; provenance: 'containment' | 'nearest-centroid' | 'none' }>();
  for (const assoc of associations) {
    if (assoc.polygonIndex < 0) continue;
    const existing = polyLabelMap.get(assoc.polygonIndex);
    if (!existing || assoc.confidence > existing.confidence) {
      polyLabelMap.set(assoc.polygonIndex, {
        text: assoc.normalizedText,
        confidence: assoc.confidence,
        provenance: assoc.provenance,
      });
    }
  }

  const rooms = normalizedPolygons.map((polygon, i) => {
    const labelInfo = polyLabelMap.get(i);
    return {
      id: `room-${String(i).padStart(4, '0')}`,
      polygon,
      centroid: polygonCentroid(polygon),
      area: polygonArea(polygon),
      perimeter: polygonPerimeter(polygon),
      label: labelInfo?.text ?? null,
      labelConfidence: labelInfo?.confidence ?? 0,
      labelProvenance: labelInfo?.provenance ?? 'none' as const,
    };
  });

  const geometry: PlanGeometry = {
    bounds: normBounds,
    originalBounds,
    rooms: normalizedPolygons,
    walls: normalizedWalls,
    openings: [],
  };

  return { geometry, labels: normalizedLabels, units, warnings, rooms };
}
