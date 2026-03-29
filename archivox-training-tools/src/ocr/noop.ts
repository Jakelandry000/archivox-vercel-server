/**
 * No-op OCR implementation.
 *
 * Returns an empty token list.  Used as the default when no real OCR backend
 * is registered, so the ingestion pipeline can proceed without crashing on
 * PDF/image inputs — it will produce stub artifacts with appropriate warnings.
 *
 * Replace with a real implementation in Phase D:
 *   import { TesseractOcr } from './tesseract';   // example
 *   export const activeOcr: OcrInterface = new TesseractOcr();
 */

import { LabelToken } from '../types';
import { OcrInterface, OcrTextOptions } from './types';

export const noopOcr: OcrInterface = {
  async extractTextTokensFromRaster(
    _input: string | Buffer,
    _options?: OcrTextOptions,
  ): Promise<LabelToken[]> {
    return [];
  },
};
