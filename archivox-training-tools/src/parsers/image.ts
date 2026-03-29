/**
 * Image parser stub (PNG / JPG / JPEG / WebP).
 *
 * Full extraction requires:
 *  1. An OCR provider for text label extraction (see pdf.ts for the OcrInterface).
 *  2. A vision-based room segmentation model for polygon extraction.
 *
 * This stub:
 *  - Accepts the file (records metadata)
 *  - Returns an empty-geometry result with appropriate warnings
 *
 * TODO (next steps):
 *  1. Use sharp (or jimp) to normalise image and generate a preview PNG.
 *  2. Pass image through the OcrInterface to extract text tokens.
 *  3. Optionally pass through a layout-detection model.
 *
 * Preview generation (internal debug only):
 *  Install optional dependency: npm install sharp
 *  Then implement: sharp(inputPath).resize(512).toFile(previewPath)
 */

import * as fs from 'fs';
import * as path from 'path';
import { PlanGeometry, PlanUnits, LabelToken, QualitySignal } from '../types';

export interface ImageParseResult {
  geometry: PlanGeometry;
  labels: LabelToken[];
  units: PlanUnits;
  warnings: QualitySignal[];
  rooms: never[];
}

export async function parseImageFile(filePath: string): Promise<ImageParseResult> {
  const warnings: QualitySignal[] = [];

  if (!fs.existsSync(filePath)) {
    throw new Error(`Image file not found: ${filePath}`);
  }

  const ext = path.extname(filePath).toLowerCase();
  warnings.push({
    level: 'warning',
    code: 'IMAGE_PARTIAL',
    message: `Image parsing (${ext}) is not yet fully implemented. No geometry or labels will be extracted.`,
  });
  warnings.push({
    level: 'warning',
    code: 'IMAGE_NO_OCR',
    message: 'Label extraction from images requires an OCR provider and vision segmentation model (not yet integrated).',
  });

  const emptyBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return {
    geometry: {
      bounds: emptyBounds,
      originalBounds: emptyBounds,
      rooms: [],
      walls: [],
      openings: [],
    },
    labels: [],
    units: { detected: 'unknown', assumed: 'mm', confidence: 0 },
    warnings,
    rooms: [],
  };
}
