import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import AdmZip from 'adm-zip';
import { DiscoveredFile, SourceType } from './types';

const SUPPORTED_EXTENSIONS: Record<string, SourceType> = {
  '.dxf': 'dxf',
  '.pdf': 'pdf',
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.webp': 'image',
};

function classifyFile(filePath: string): SourceType | 'unknown' {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS[ext] ?? 'unknown';
}

function collectFiles(dir: string, results: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, results);
    } else if (entry.isFile()) {
      results.push(full);
    }
  }
}

/**
 * Unpacks a ZIP to a temp directory and returns the temp dir path.
 * Caller is responsible for cleanup.
 */
function unpackZip(zipPath: string): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'archivox-ingest-'));
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tmpDir, true);
  return tmpDir;
}

export interface DiscoveryResult {
  files: DiscoveredFile[];
  tmpDirs: string[];
}

/**
 * Discovers supported files from `inputPath`.
 * `inputPath` may be:
 *   - a single DXF/PDF/image file
 *   - a ZIP archive (unpacked to temp)
 *   - a directory (recursively scanned)
 *
 * Returns the list of files with classification.
 * tmpDirs should be cleaned up by the caller after processing.
 */
export function discoverFiles(inputPath: string, maxFiles?: number): DiscoveryResult {
  const files: DiscoveredFile[] = [];
  const tmpDirs: string[] = [];

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input path does not exist: ${inputPath}`);
  }

  const stat = fs.statSync(inputPath);

  if (stat.isFile()) {
    const ext = path.extname(inputPath).toLowerCase();
    if (ext === '.zip') {
      const tmpDir = unpackZip(inputPath);
      tmpDirs.push(tmpDir);
      collectAndClassify(tmpDir, files);
    } else {
      classifyAndAdd(inputPath, files);
    }
  } else if (stat.isDirectory()) {
    collectAndClassify(inputPath, files);
  } else {
    throw new Error(`Input path is neither a file nor a directory: ${inputPath}`);
  }

  // Apply maxFiles limit (count only non-skipped)
  if (maxFiles != null && maxFiles > 0) {
    let accepted = 0;
    for (const f of files) {
      if (!f.skipped) {
        if (accepted >= maxFiles) {
          f.skipped = true;
          f.skipReason = `maxFiles limit (${maxFiles}) reached`;
        } else {
          accepted++;
        }
      }
    }
  }

  return { files, tmpDirs };
}

function collectAndClassify(dir: string, files: DiscoveredFile[]): void {
  const paths: string[] = [];
  collectFiles(dir, paths);
  for (const p of paths) {
    classifyAndAdd(p, files);
  }
}

function classifyAndAdd(filePath: string, files: DiscoveredFile[]): void {
  const type = classifyFile(filePath);
  if (type === 'unknown') {
    files.push({
      path: filePath,
      type: 'unknown',
      skipped: true,
      skipReason: `Unsupported extension: ${path.extname(filePath) || '(none)'}`,
    });
  } else {
    files.push({ path: filePath, type, skipped: false });
  }
}

/**
 * Cleans up temporary directories created during discovery.
 */
export function cleanupTmpDirs(tmpDirs: string[]): void {
  for (const dir of tmpDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
}
