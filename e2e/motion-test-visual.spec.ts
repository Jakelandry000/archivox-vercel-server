/**
 * /motion-test — visual snapshot comparisons + animation cue verification
 *
 * Extends the existing motion-test.spec.ts with:
 *   - Full-page and element-level visual snapshots in both motion states
 *   - Structural assertions that confirm animation end-states are correct
 *   - Blueprint SVG path opacity checks (all paths must reach opacity > 0 after animation)
 *
 * These tests act as a regression guard: any accidental visual regression caused by
 * upstream changes to HeroSection, BlueprintBackground, or globals.css will be
 * surfaced as a snapshot diff before merge.
 *
 * Run:
 *   npx playwright test e2e/motion-test-visual --project=chromium
 *   npx playwright test e2e/motion-test-visual --update-snapshots   # regenerate baselines
 */

import { test, expect } from '@playwright/test'

const MOTION_TEST_PATH = '/motion-test'

// ─── helpers ──────────────────────────────────────────────────────────────────

const blueprintSvg = (page: import('@playwright/test').Page) =>
  page.locator('[data-testid="blueprint-svg"]').first()

/**
 * Poll until every <path>, <line>, <rect>, and <polygon> inside the blueprint SVG
 * has a non-zero inline opacity — confirming the Framer Motion animation has resolved.
 * Falls back to a hard timeout so tests don't hang if the SVG is absent.
 */
async function waitForBlueprintFullyDrawn(page: import('@playwright/test').Page) {
  await page.waitForFunction(
    () => {
      const svg = document.querySelector('[data-testid="blueprint-svg"]')
      if (!svg) return false
      const elements = Array.from(
        svg.querySelectorAll<SVGElement>('path, line, rect, polygon'),
      )
      if (elements.length === 0) return false
      return elements.every((el) => {
        // Framer Motion writes opacity as an inline style
        const inlineOpacity = parseFloat(el.style.opacity ?? '1')
        return !isNaN(inlineOpacity) ? inlineOpacity > 0.5 : true
      })
    },
    { timeout: 5000 },
  )
}

// ─── visual snapshots: /motion-test full-page ────────────────────────────────

test.describe('/motion-test — full-page visual snapshots', () => {
  test('full-page snapshot — motion OFF (blueprint animated to completion)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')
    await waitForBlueprintFullyDrawn(page)

    await expect(page).toHaveScreenshot('motion-test-full-motion-off.png', {
      clip: { x: 0, y: 0, width: 1280, height: 720 },
      maxDiffPixelRatio: 0.03,
      animations: 'disabled',
    })
  })

  test('full-page snapshot — motion ON (blueprint static, zero-duration transitions)', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveScreenshot('motion-test-full-motion-on.png', {
      clip: { x: 0, y: 0, width: 1280, height: 720 },
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    })
  })
})

// ─── visual snapshots: blueprint SVG element ─────────────────────────────────

test.describe('/motion-test — blueprint SVG element snapshots', () => {
  test('blueprint SVG snapshot — motion OFF (fully drawn)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')
    await waitForBlueprintFullyDrawn(page)

    await expect(blueprintSvg(page)).toHaveScreenshot('blueprint-svg-motion-off.png', {
      maxDiffPixelRatio: 0.03,
      animations: 'disabled',
    })
  })

  test('blueprint SVG snapshot — motion ON (static, instant render)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    await expect(blueprintSvg(page)).toHaveScreenshot('blueprint-svg-motion-on.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    })
  })
})

// ─── animation cue end-state verification ────────────────────────────────────

test.describe('/motion-test — animation cue end-state checks', () => {
  test('blueprint SVG contains drawable elements (paths, lines, rects)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    const elementCount = await page.evaluate(() => {
      const svg = document.querySelector('[data-testid="blueprint-svg"]')
      return svg
        ? svg.querySelectorAll('path, line, rect, polygon, circle').length
        : 0
    })
    expect(elementCount).toBeGreaterThan(0)
  })

  test('blueprint SVG opacity: all drawn elements reach opacity > 0 — motion OFF', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')
    await waitForBlueprintFullyDrawn(page)

    const allVisible = await page.evaluate(() => {
      const svg = document.querySelector('[data-testid="blueprint-svg"]')
      if (!svg) return false
      const elements = Array.from(
        svg.querySelectorAll<SVGElement>('path, line, rect, polygon'),
      )
      return elements.every((el) => {
        const inlineOpacity = parseFloat(el.style.opacity ?? '1')
        return isNaN(inlineOpacity) || inlineOpacity > 0
      })
    })
    expect(allVisible).toBe(true)
  })

  test('blueprint SVG opacity: all elements immediately at opacity > 0 — motion ON', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    const allVisible = await page.evaluate(() => {
      const svg = document.querySelector('[data-testid="blueprint-svg"]')
      if (!svg) return false
      const elements = Array.from(
        svg.querySelectorAll<SVGElement>('path, line, rect, polygon'),
      )
      return elements.every((el) => {
        const inlineOpacity = parseFloat(el.style.opacity ?? '1')
        return isNaN(inlineOpacity) || inlineOpacity > 0
      })
    })
    expect(allVisible).toBe(true)
  })

  test('blueprint SVG parent opacity matches design spec (0.065)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')

    const svgOpacity = await page.evaluate(() => {
      const svg = document.querySelector<SVGSVGElement>('[data-testid="blueprint-svg"]')
      return svg ? parseFloat(svg.style.opacity) : null
    })
    // Design spec: 0.065 — atmospheric, not content
    expect(svgOpacity).toBeCloseTo(0.065, 2)
  })
})

// ─── motion state transition visual check ────────────────────────────────────

test.describe('/motion-test — state transition snapshot fidelity', () => {
  test('banner pill state matches snapshot before and after toggle', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(MOTION_TEST_PATH)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)

    // Capture OFF state
    const banner = page
      .locator('[style*="border-radius: 999"] , [style*="border-radius:999"]')
      .first()
    await expect(banner).toHaveScreenshot('status-banner-motion-off.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    })

    // Toggle to ON state
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect(page.getByText('ON — blueprint static')).toBeVisible({ timeout: 3000 })
    await expect(banner).toHaveScreenshot('status-banner-motion-on.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    })
  })
})
