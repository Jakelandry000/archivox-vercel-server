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
  /** Relative path within the input root (directory or ZIP). */
  relativePath?: string;
  /** Lower-case file extension including dot, e.g. '.dxf'. */
  ext?: string;
  /** File size in bytes. */
  bytes?: number;
}

export interface PlanUnits {
  detected: string;
  assumed: string;
  confidence: number; // 0–1
}

export interface LabelToken {
  /** Stable deterministic id, e.g. 'token-0000'. Populated by DXF parser. */
  id?: string;
  text: string;
  normalizedText: string;
  position: Point;
  /** Entity type this token came from. */
  kind?: 'TEXT' | 'MTEXT';
  /** Rotation angle in degrees (0 if unspecified). */
  rotation?: number;
  /** Text height in drawing units. */
  height?: number;
  /** Raw text before format-code stripping / normalization. */
  raw?: string;
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
  /** Alias for id — polygon identity reference. Populated by DXF parser. */
  polygonId?: string;
  /** Structured label assignment with token reference. Populated by DXF parser. */
  assignedLabel?: {
    text: string;
    tokenId?: string;
    confidence: number;
    method: LabelProvenance;
  } | null;
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
  schemaVersion: 'Metrics@v1';
  planId: string;
  counts: {
    rooms: number;
    labeled: number;
    selfIntersecting: number;
    nested: number;
    outliers: number;
    isolated: number;
    warnings: number;
    errors: number;
    /** Total label tokens extracted (all TEXT/MTEXT). */
    labelsTotal?: number;
    /** Rooms with a non-null label (same as `labeled` but explicit name). */
    roomsLabeled?: number;
    /** Total adjacency edges in the graph. */
    edgesTotal?: number;
  };
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
  /** Path relative to the input root (directory or ZIP extraction root). */
  relativePath: string;
  type: SourceType | 'unknown';
  /** Lower-case extension including dot, e.g. '.dxf'. */
  ext: string;
  /** File size in bytes. */
  bytes: number;
  /** True if the extension is in the supported list (regardless of maxFiles limiting). */
  supported: boolean;
  skipped: boolean;
  skipReason?: string;
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

export interface ManifestPlanEntry {
  planId: string;
  sourceName: string;
  sourceType: string;
  sha256: string;
  bytes: number;
  artifactPaths: {
    planJson: string;
    graphJson: string;
    metricsJson: string;
  };
  warnings: QualitySignal[];
  errors: QualitySignal[];
  /** True when this file is a duplicate of another file already processed in this run. */
  deduped?: boolean;
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
  nodeVersion: string;
  platform: string;
  gitCommit: string | null;
  /** Metadata about the input source for this run. */
  input: {
    originalPath: string;
    type: 'dir' | 'zip' | 'file';
    /** Temp staging directory used when input was a ZIP archive. */
    stagingPath?: string;
  };
  config: IngestConfig;
  discoveredFiles: DiscoveredFile[];
  ingestedPlans: ManifestPlanEntry[];
  summary: {
    totalDiscovered: number;
    /** Files whose extension is in the supported list. */
    totalSupported: number;
    totalIngested: number;
    /** Plans skipped because an identical sha256 was already processed this run. */
    totalDeduped: number;
    /** Files skipped due to unsupported extension. */
    totalSkippedUnsupported: number;
    totalWarnings: number;
    totalErrors: number;
    /** Total skipped for any reason (unsupported, maxFiles, processing error). */
    totalSkipped: number;
  };
}
