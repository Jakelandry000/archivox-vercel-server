import * as path from 'path';

/**
 * Segments that indicate a web-served or framework-generated directory.
 * Writing dataset artifacts into these paths would expose training data to users.
 */
const BLOCKED_SEGMENTS = [
  'public',
  '.next',
  'app',
  'pages',
  'static',
  'out',
  'dist',   // could also be the training-tools dist; checked contextually below
  'build',
  'www',
  'assets',
  '.vercel',
];

/**
 * Asserts that `outputPath` is safe to write training corpus artifacts into.
 * Throws if the resolved path contains a web-serving directory segment.
 *
 * Call this before writing any per-plan derived output.
 */
export function assertSafeOutputPath(outputPath: string): void {
  const resolved = path.resolve(outputPath);
  const parts = resolved.split(path.sep).map((p) => p.toLowerCase());

  for (const seg of BLOCKED_SEGMENTS) {
    if (parts.includes(seg)) {
      throw new Error(
        `[safety] Refusing to write corpus artifacts into a potentially web-served path.\n` +
          `  Resolved path : ${resolved}\n` +
          `  Blocked segment: "${seg}"\n` +
          `  Training data must never be written under public/, .next/, app/, pages/, or similar web directories.\n` +
          `  Use a private local directory such as ~/corpus or /data/archivox-corpus.`,
      );
    }
  }
}

/**
 * Returns a warning string if the path looks suspicious but is not definitively blocked,
 * or null if the path appears safe.
 */
export function warnIfSuspiciousPath(outputPath: string): string | null {
  const resolved = path.resolve(outputPath);
  const lower = resolved.toLowerCase();

  // Warn if path is inside the web app directory tree
  const webIndicators = ['/apps/web', '\\apps\\web', '/apps/web/', '\\apps\\web\\'];
  for (const indicator of webIndicators) {
    if (lower.includes(indicator)) {
      return (
        `[safety] Output path appears to be inside the web application directory (${resolved}). ` +
        `This is strongly discouraged. Training data should be stored outside the web app.`
      );
    }
  }
  return null;
}
