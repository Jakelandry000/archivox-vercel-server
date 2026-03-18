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

export const SUPPORTED_EXTS = Object.keys(SUPPORTED_EXTENSIONS);

function classifyFile(filePath: string): SourceType | 'unknown' {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS[ext] ?? 'unknown';
}

/** Recursively collect all file paths under `dir` (unsorted). */
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
  /** Whether the input was a directory, zip archive, or single file. */
  inputType: 'dir' | 'zip' | 'file';
  /** Temp extraction directory; only set when inputType === 'zip'. */
  stagingPath?: string;
}

/**
 * Discovers supported files from `inputPath`.
 * `inputPath` may be:
 *   - a single DXF/PDF/image file
 *   - a ZIP archive (unpacked to temp)
 *   - a directory (recursively scanned)
 *
 * Files are sorted by their normalized relative path before maxFiles is applied,
 * ensuring deterministic selection across runs.
 *
 * Returns the list of files with classification.
 * tmpDirs should be cleaned up by the caller after processing.
 */
export function discoverFiles(inputPath: string, maxFiles?: number): DiscoveryResult {
  const files: DiscoveredFile[] = [];
  const tmpDirs: string[] = [];
  let inputType: 'dir' | 'zip' | 'file';
  let stagingPath: string | undefined;

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input path does not exist: ${inputPath}`);
  }

  const stat = fs.statSync(inputPath);

  if (stat.isFile()) {
    const ext = path.extname(inputPath).toLowerCase();
    if (ext === '.zip') {
      inputType = 'zip';
      const tmpDir = unpackZip(inputPath);
      stagingPath = tmpDir;
      tmpDirs.push(tmpDir);
      collectSortAndClassify(tmpDir, tmpDir, files);
    } else {
      inputType = 'file';
      // rootDir = parent directory; relativePath = just the filename
      const rootDir = path.dirname(inputPath);
      classifyAndAdd(inputPath, rootDir, files);
    }
  } else if (stat.isDirectory()) {
    inputType = 'dir';
    collectSortAndClassify(inputPath, inputPath, files);
  } else {
    throw new Error(`Input path is neither a file nor a directory: ${inputPath}`);
  }

  // Apply maxFiles limit — only counts supported (non-already-skipped) files.
  // Files are already in deterministic sorted order so truncation is stable.
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

  return { files, tmpDirs, inputType, stagingPath };
}

/**
 * Collect all file paths under `dir`, sort them by normalized relative path,
 * then classify each and push to `files`.
 */
function collectSortAndClassify(dir: string, rootDir: string, files: DiscoveredFile[]): void {
  const rawPaths: string[] = [];
  collectFiles(dir, rawPaths);

  // Sort by normalized (forward-slash) relative path for cross-platform determinism.
  rawPaths.sort((a, b) => {
    const relA = path.relative(rootDir, a).replace(/\\/g, '/');
    const relB = path.relative(rootDir, b).replace(/\\/g, '/');
    return relA.localeCompare(relB);
  });

  for (const p of rawPaths) {
    classifyAndAdd(p, rootDir, files);
  }
}

function classifyAndAdd(filePath: string, rootDir: string, files: DiscoveredFile[]): void {
  const type = classifyFile(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  let bytes = 0;
  try {
    bytes = fs.statSync(filePath).size;
  } catch {
    // best-effort
  }

  if (type === 'unknown') {
    files.push({
      path: filePath,
      relativePath,
      type: 'unknown',
      ext,
      bytes,
      supported: false,
      skipped: true,
      skipReason: `Unsupported extension: ${ext || '(none)'}`,
    });
  } else {
    files.push({
      path: filePath,
      relativePath,
      type,
      ext,
      bytes,
      supported: true,
      skipped: false,
    });
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
