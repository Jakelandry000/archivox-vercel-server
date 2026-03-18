// ─── Primitives ──────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

// ─── PlanSpec v1 ─────────────────────────────────────────────────────────────

export type SourceType = 'dxf' | 'pdf' | 'image';
export type LabelProvenance = 'containment' | 'nearest-centroid' | 'none';
export type SignalLevel = 'warning' | 'error';

export interface PlanSource {
  filename: string;
  type: SourceType;
  sha256: string;
  ingestTimestamp: string;
  toolVersion: string;
}

export interface PlanUnits {
  detected: string;
  assumed: string;
  confidence: number; // 0–1
}

export interface LabelToken {
  text: string;
  normalizedText: string;
  position: Point;
}

export interface WallSegment {
  start: Point;
  end: Point;
}

export interface Opening {
  type: 'door' | 'window' | 'unknown';
  position: Point;
}

export interface PlanGeometry {
  bounds: BoundingBox;
  originalBounds: BoundingBox;
  rooms: Point[][];       // each inner array is a closed polygon (vertices)
  walls: WallSegment[];
  openings: Opening[];
}

export interface QualitySignal {
  level: SignalLevel;
  code: string;
  message: string;
  detail?: unknown;
}

export interface Room {
  id: string;
  polygon: Point[];
  centroid: Point;
  area: number;
  perimeter: number;
  label: string | null;
  labelConfidence: number;
  labelProvenance: LabelProvenance;
}

export interface PlanSpec {
  schemaVersion: 'PlanSpec@v1';
  planId: string;
  source: PlanSource;
  units: PlanUnits;
  geometry: PlanGeometry;
  labels: LabelToken[];
  rooms: Room[];
  qualitySignals: QualitySignal[];
}

// ─── GraphSpec v1 ─────────────────────────────────────────────────────────────

export interface GraphNode {
  id: string;
  type: 'room';
  label: string | null;
  area: number;
  centroid: Point;
  labelDistribution: Record<string, number>;
}

export interface GraphEdge {
  sourceId: string;
  targetId: string;
  weight: number;
  adjacencyType: 'shared-boundary' | 'proximity';
}

export interface GraphGlobalFeatures {
  totalArea: number;
  roomCount: number;
  roomCountByType: Record<string, number>;
  isolatedRooms: string[];
}

export interface GraphSpec {
  schemaVersion: 'GraphSpec@v1';
  planId: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  globalFeatures: GraphGlobalFeatures;
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export interface PlanMetrics {
  planId: string;
  labelCoveragePercent: number;
  selfIntersectingPolygons: string[];
  roomsInsideOtherRooms: Array<{ inner: string; outer: string }>;
  areaOutliers: string[];
  isolatedRooms: string[];
  warnings: QualitySignal[];
  errors: QualitySignal[];
}

// ─── Discovery ────────────────────────────────────────────────────────────────

export interface DiscoveredFile {
  path: string;
  type: SourceType | 'unknown';
  skipped: boolean;
  skipReason?: string;
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

export interface ManifestPlanEntry {
  planId: string;
  sourceName: string;
  sourceType: string;
  sha256: string;
  artifactPaths: {
    planJson: string;
    graphJson: string;
    metricsJson: string;
  };
  warnings: QualitySignal[];
  errors: QualitySignal[];
}

export interface IngestConfig {
  inputPath: string;
  corpusPath: string;
  runTag: string | null;
  maxFiles: number | null;
  dryRun: boolean;
  adjacencyThreshold: number;
  labelMaxDistance: number;
}

export interface IngestManifest {
  schemaVersion: 'IngestManifest@v1';
  runId: string;
  timestamp: string;
  toolVersion: string;
  gitCommit: string | null;
  config: IngestConfig;
  discoveredFiles: DiscoveredFile[];
  ingestedPlans: ManifestPlanEntry[];
  summary: {
    totalDiscovered: number;
    totalSkipped: number;
    totalIngested: number;
    totalWarnings: number;
    totalErrors: number;
  };
}
