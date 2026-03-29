/**
 * OCR interface for raster inputs (PDF pages, PNG/JPG images).
 *
 * Implement this interface to plug in a real OCR backend (e.g. Tesseract.js,
 * Google Vision, AWS Textract).  Register via the parser modules or pass
 * directly to the ingestion pipeline.
 *
 * Usage:
 *   import { noopOcr } from './noop';
 *   const tokens = await noopOcr.extractTextTokensFromRaster('/path/to/image.png');
 *
 * Phase D will replace the noop with a real implementation.
 */

import { LabelToken } from '../types';

export interface OcrTextOptions {
  /** Hint for rendered DPI when rasterising a PDF page (default: 150). */
  dpi?: number;
  /** Optional page index for multi-page PDFs (0-based, default: 0). */
  pageIndex?: number;
}

/**
 * Minimal OCR interface.  Takes an image path or raw pixel buffer and
 * returns an array of LabelTokens with position and text populated.
 *
 * Implementors should:
 *  - Set `token.position` to the centre of the recognised text bounding box
 *    in image-coordinate space (pixels from top-left at the given DPI).
 *  - Set `token.text` to the raw recognised string.
 *  - Set `token.normalizedText` to lowercase alphanumeric (spaces collapsed).
 *  - Assign sequential `token.id` values ('token-0000', 'token-0001', …).
 */
export interface OcrInterface {
  extractTextTokensFromRaster(
    input: string | Buffer,
    options?: OcrTextOptions,
  ): Promise<LabelToken[]>;
}
