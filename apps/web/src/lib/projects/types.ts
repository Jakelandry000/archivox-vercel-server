import type { ValidationResult, ValidationMetrics } from '@archivox/core';

// TODO(db): replace with Prisma model once projects table is wired up.
export type FloorplanAttachment = {
  blobUrl: string;
  filename: string;
  uploadedAt: number; // ms since epoch
};

/**
 * Mirrors ValidationResult from @archivox/core so that DraftResult.validation
 * stays in sync automatically without manual field maintenance.
 * metrics is optional to preserve backward compatibility with localStorage-
 * persisted drafts created before this type was introduced.
 */
export type DraftValidation = Omit<ValidationResult, 'metrics'> & { metrics?: ValidationMetrics };

export type DraftResult = {
  svg: string;
  script: string;
  validation: DraftValidation;
  priorsMeta: {
    loaded: boolean;
    labelsCount: number;
    adjacencyPairsCount: number;
    topLabels: string[];
  };
  generatedAt: number; // ms since epoch
};

export type Project = {
  id: string;
  name: string;
  description?: string;
  /** Explicit width in feet; used with siteDepth for area calc */
  siteWidth?: number;
  /** Explicit depth in feet; used with siteWidth for area calc */
  siteDepth?: number;
  /** Total sqft when user doesn't specify individual dimensions */
  overallSqft?: number;
  /** Free-text program / brief (e.g. "3BR, 2BA, open kitchen…") */
  program?: string;
  /** Attached floorplan file (Vercel Blob) */
  floorplan?: FloorplanAttachment;
  /** Latest generated draft result, persisted to localStorage */
  latestDraft?: DraftResult;
  createdAt: number; // ms since epoch
  updatedAt: number; // ms since epoch
};
