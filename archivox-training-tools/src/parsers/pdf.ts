/**
 * PDF parser stub.
 *
 * Full text/geometry extraction requires an OCR backend (e.g. Tesseract).
 * This stub:
 *  - Accepts the file (computes checksum, records metadata)
 *  - Returns an empty-geometry PlanSpec with appropriate warnings
 *  - Exposes an OcrInterface for future plug-in
 *
 * TODO (next steps):
 *  1. Integrate pdf2pic or pdftocairo to rasterise pages.
 *  2. Pass each raster page through the OcrInterface to extract text tokens.
 *  3. Run the image-based room-detection heuristics from image.ts.
 */

import * as fs from 'fs';
import { PlanGeometry, PlanUnits, LabelToken, QualitySignal } from '../types';

// ─── OCR interface (plug-in point) ────────────────────────────────────────────

export interface OcrResult {
  tokens: Array<{ text: string; x: number; y: number }>;
}

/**
 * Implement this interface to add OCR support.
 * Register via `setPdfOcrProvider()` below.
 */
export interface OcrProvider {
  extractFromPdfPage(pdfPath: string, pageIndex: number): Promise<OcrResult>;
}

let _ocrProvider: OcrProvider | null = null;

export function setPdfOcrProvider(provider: OcrProvider): void {
  _ocrProvider = provider;
}

export function getOcrProvider(): OcrProvider | null {
  return _ocrProvider;
}

// ─── Stub parse result ────────────────────────────────────────────────────────

export interface PdfParseResult {
  geometry: PlanGeometry;
  labels: LabelToken[];
  units: PlanUnits;
  warnings: QualitySignal[];
  rooms: never[];
}

export async function parsePdfFile(filePath: string): Promise<PdfParseResult> {
  const warnings: QualitySignal[] = [];

  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF file not found: ${filePath}`);
  }

  const emptyBounds = { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  const geometry: PlanGeometry = {
    bounds: emptyBounds,
    originalBounds: emptyBounds,
    rooms: [],
    walls: [],
    openings: [],
  };

  warnings.push({
    level: 'warning',
    code: 'PDF_PARTIAL',
    message: 'PDF parsing is not yet fully implemented. Geometry and label extraction require an OCR provider.',
  });

  if (_ocrProvider) {
    warnings.push({
      level: 'warning',
      code: 'PDF_OCR_AVAILABLE',
      message: 'An OCR provider is registered but PDF rasterisation is not yet implemented. Labels will be empty.',
    });
  } else {
    warnings.push({
      level: 'warning',
      code: 'PDF_NO_OCR',
      message: 'No OCR provider registered. Call setPdfOcrProvider() with a Tesseract or similar implementation to enable label extraction.',
    });
  }

  return {
    geometry,
    labels: [],
    units: { detected: 'unknown', assumed: 'mm', confidence: 0 },
    warnings,
    rooms: [],
  };
}
