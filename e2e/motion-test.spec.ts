/**
 * Smoke test: SplineHero prefers-reduced-motion toggle
 *
 * Tests the /motion-test page which exercises the SplineHero component's
 * dual rendering paths:
 *   - reducedMotion OFF → Spline 3D scene (<canvas>)
 *   - reducedMotion ON  → static SVG fallback (<img alt="ArchiVox hero …">)
 *
 * PREREQUISITE — HERO_SCENE_URL:
 *   The current page.tsx uses PLACEHOLDER_SCENE = 'loading...' until a real
 *   Spline .splinecode URL is available. When the placeholder is active:
 *     • The canvas IS present in the DOM (Spline creates it immediately).
 *     • The scene itself will not render visually — that is expected.
 *   Once HERO_SCENE_URL is wired in, replace PLACEHOLDER_SCENE with the real
 *   URL and these assertions will cover the full production render path.
 *
 * Run:
 *   npx playwright test e2e/motion-test --project=chromium
 *   npx playwright test e2e/motion-test --headed   (for visual inspection)
 */

import { test, expect } from '@playwright/test'

const MOTION_TEST_PATH = '/motion-test'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Locator for the status banner pill text (not the label). */
const bannerPill = (page: import('@playwright/test').Page) =>
  page.locator(
    '[style*="border-radius: 999"] , [style*="border-radius:999"]',
  ).first()

/** Locator for the Spline canvas element rendered inside SplineHero. */
const splineCanvas = (page: import('@playwright/test').Page) =>
  page.locator('canvas').first()

/** Locator for the static SVG fallback image rendered by SplineHero. */
const fallbackImage = (page: import('@playwright/test').Page) =>
  page.locator('img[alt*="ArchiVox hero"]').first()

// ─── suite: motion OFF (default) ─────────────────────────────────────────────

test.describe('motion OFF — Spline canvas path', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('status banner shows "OFF — showing Spline scene"', async ({ page }) => {
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByText('OFF — showing Spline scene'),
    ).toBeVisible({ timeout: 5000 })
  })

  test('canvas element is present and visible', async ({ page }) => {
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    // Spline mounts a <canvas> even while the .splinecode is loading.
    // Once HERO_SCENE_URL is wired in this will also confirm scene load.
    await expect(splineCanvas(page)).toBeVisible({ timeout: 8000 })
  })

  test('static SVG fallback is NOT rendered', async ({ page }) => {
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(fallbackImage(page)).not.toBeVisible()
  })
})

// ─── suite: motion ON (reduce) ────────────────────────────────────────────────

test.describe('motion ON — static SVG fallback path', () => {
  test.use({ reducedMotion: 'reduce' })

  // Ensure emulateMedia is set before each navigation so matchMedia reflects
  // the context preference (context-level reducedMotion alone may not fire
  // the change event seen by useEffect on initial load).
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('status banner shows "ON — showing static fallback"', async ({ page }) => {
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByText('ON — showing static fallback'),
    ).toBeVisible({ timeout: 5000 })
  })

  test('static SVG fallback image is visible', async ({ page }) => {
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(fallbackImage(page)).toBeVisible({ timeout: 5000 })
  })

  test('canvas element is NOT rendered when motion is reduced', async ({ page }) => {
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(splineCanvas(page)).not.toBeVisible()
  })

  test('fallback image fills the viewport container (object-cover)', async ({ page }) => {
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    const img = fallbackImage(page)
    await expect(img).toBeVisible()

    // Image should span the full-viewport hero container (100vw × 100vh)
    const box = await img.boundingBox()
    const viewport = page.viewportSize()!
    expect(box).not.toBeNull()
    // Allow ±8px tolerance for sub-pixel rounding / scrollbar width
    expect(box!.width).toBeGreaterThan(viewport.width - 8)
  })
})

// ─── suite: live toggle ───────────────────────────────────────────────────────

test.describe('live toggle — mediaquery change fires without reload', () => {
  test('switching reduce-motion mid-session swaps canvas ↔ fallback', async ({ page }) => {
    // Start with motion OFF
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    // Verify initial state: canvas visible, banner = OFF
    await expect(
      page.getByText('OFF — showing Spline scene'),
    ).toBeVisible({ timeout: 5000 })
    await expect(splineCanvas(page)).toBeVisible()
    await expect(fallbackImage(page)).not.toBeVisible()

    // Emulate OS "Reduce Motion" toggle — fires the matchMedia 'change' event
    await page.emulateMedia({ reducedMotion: 'reduce' })

    // React state update via matchMedia listener — no page reload
    await expect(
      page.getByText('ON — showing static fallback'),
    ).toBeVisible({ timeout: 3000 })
    await expect(fallbackImage(page)).toBeVisible({ timeout: 3000 })
    await expect(splineCanvas(page)).not.toBeVisible()

    // Toggle back: confirm bidirectionality
    await page.emulateMedia({ reducedMotion: 'no-preference' })

    await expect(
      page.getByText('OFF — showing Spline scene'),
    ).toBeVisible({ timeout: 3000 })
    await expect(splineCanvas(page)).toBeVisible({ timeout: 3000 })
    await expect(fallbackImage(page)).not.toBeVisible()
  })
})

// ─── suite: page integrity ────────────────────────────────────────────────────

test.describe('page integrity', () => {
  test('no JS console errors on load (motion OFF)', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    // Filter known Spline network errors when placeholder URL is active
    const nonSplineErrors = errors.filter(
      e => !e.includes('loading...') && !e.includes('spline.design'),
    )
    expect(nonSplineErrors).toHaveLength(0)
  })

  test('no JS console errors on load (motion ON)', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    const nonSplineErrors = errors.filter(
      e => !e.includes('loading...') && !e.includes('spline.design'),
    )
    expect(nonSplineErrors).toHaveLength(0)
  })

  test('status banner is always visible regardless of motion setting', async ({ page }) => {
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion })
      await page.goto(MOTION_TEST_PATH)
      await page.waitForLoadState('networkidle')

      // Banner is position:fixed at top — always in viewport
      await expect(
        page.getByText('prefers-reduced-motion:'),
      ).toBeVisible({ timeout: 5000 })
    }
  })
})
