import * as fs from 'fs';
import * as crypto from 'crypto';

/**
 * Computes a SHA-256 hex digest of a Buffer.
 */
export function sha256Buffer(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Computes a SHA-256 hex digest of a file's bytes.
 */
export function sha256File(filePath: string): string {
  return sha256Buffer(fs.readFileSync(filePath));
}
