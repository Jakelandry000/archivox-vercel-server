/**
 * Renders og-image.svg to a 1200x630 PNG using Playwright.
 * Run from the apps/web directory: node scripts/generate-og-image.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dir = dirname(__filename);
const publicDir = join(__dir, '..', 'public');

const svgPath = join(publicDir, 'og-image.svg');
const pngPath = join(publicDir, 'og-image.png');

const svgContent = readFileSync(svgPath, 'utf8');
const dataUri = `data:image/svg+xml,${encodeURIComponent(svgContent)}`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1200, height: 630 });
await page.goto(dataUri);
await page.waitForLoadState('networkidle');

// Screenshot the entire 1200x630 viewport
await page.screenshot({
  path: pngPath,
  clip: { x: 0, y: 0, width: 1200, height: 630 },
  type: 'png',
});

await browser.close();
console.log(`✓ og-image.png written to ${pngPath}`);
