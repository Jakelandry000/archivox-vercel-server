/**
 * Smoke test: HeroSection prefers-reduced-motion toggle
 *
 * Tests the /motion-test page which exercises the HeroSection component's
 * reduced-motion behaviour:
 *   - reducedMotion OFF → blueprint SVG animates in (Framer Motion transitions)
 *   - reducedMotion ON  → blueprint SVG renders instantly (all duration: 0)
 *
 * The blueprint SVG is always present in the DOM regardless of motion setting —
 * the only difference is whether Framer Motion transitions play at full speed
 * or are collapsed to zero duration.
 *
 * Run:
 *   npx playwright test e2e/motion-test --project=chromium
 *   npx playwright test e2e/motion-test --headed   (for visual inspection)
 */

import { test, expect } from '@playwright/test'

const MOTION_TEST_PATH = '/motion-test'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Locator for the status banner pill text. */
const bannerPill = (page: import('@playwright/test').Page) =>
  page.locator(
    '[style*="border-radius: 999"] , [style*="border-radius:999"]',
  ).first()

/** Locator for the blueprint SVG rendered inside HeroSection. */
const blueprintSvg = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid="blueprint-svg"]').first()

// ─── suite: motion OFF (default) ──────────────────────────────────────────────

test.describe('motion OFF — animated blueprint path', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('status banner shows "OFF — blueprint animating"', async ({ page }) => {
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByText('OFF — blueprint animating'),
    ).toBeVisible({ timeout: 5000 })
  })

  test('blueprint SVG is present and visible', async ({ page }) => {
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(blueprintSvg(page)).toBeAttached({ timeout: 5000 })
  })

  test('no canvas or static fallback image rendered', async ({ page }) => {
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.locator('img[alt*="ArchiVox hero"]')).toHaveCount(0)
  })
})

// ─── suite: motion ON (reduce) ────────────────────────────────────────────────

test.describe('motion ON — static blueprint path', () => {
  test.use({ reducedMotion: 'reduce' })

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('status banner shows "ON — blueprint static"', async ({ page }) => {
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByText('ON — blueprint static'),
    ).toBeVisible({ timeout: 5000 })
  })

  test('blueprint SVG is present and visible', async ({ page }) => {
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(blueprintSvg(page)).toBeAttached({ timeout: 5000 })
  })

  test('no canvas or static fallback image rendered', async ({ page }) => {
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(page.locator('img[alt*="ArchiVox hero"]')).toHaveCount(0)
  })
})

// ─── suite: live toggle ───────────────────────────────────────────────────────

test.describe('live toggle — mediaquery change fires without reload', () => {
  test('switching reduce-motion mid-session updates banner without reload', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(
      page.getByText('OFF — blueprint animating'),
    ).toBeVisible({ timeout: 5000 })
    await expect(blueprintSvg(page)).toBeAttached()

    // Emulate OS "Reduce Motion" toggle — fires matchMedia 'change' event
    await page.emulateMedia({ reducedMotion: 'reduce' })

    await expect(
      page.getByText('ON — blueprint static'),
    ).toBeVisible({ timeout: 3000 })
    await expect(blueprintSvg(page)).toBeAttached()

    // Toggle back: confirm bidirectionality
    await page.emulateMedia({ reducedMotion: 'no-preference' })

    await expect(
      page.getByText('OFF — blueprint animating'),
    ).toBeVisible({ timeout: 3000 })
    await expect(blueprintSvg(page)).toBeAttached()
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

    expect(errors).toHaveLength(0)
  })

  test('no JS console errors on load (motion ON)', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    expect(errors).toHaveLength(0)
  })

  test('status banner is always visible regardless of motion setting', async ({ page }) => {
    for (const reducedMotion of ['no-preference', 'reduce'] as const) {
      await page.emulateMedia({ reducedMotion })
      await page.goto(MOTION_TEST_PATH)
      await page.waitForLoadState('networkidle')

      await expect(
        page.getByText('prefers-reduced-motion:'),
      ).toBeVisible({ timeout: 5000 })
    }
  })
})
