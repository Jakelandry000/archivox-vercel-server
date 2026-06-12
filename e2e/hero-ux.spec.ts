/**
 * UX interaction tracking and CTA pathway validation — HeroSection
 *
 * Covers:
 *   - Hero narrative elements render (badge, headline, CTAs, typewriter prompt)
 *   - CTA pathways: "Get started" → /signin, "Try demo" → /generator
 *   - Cursor-follow glow element: present in DOM, hidden on entry, visible on hover
 *   - Cursor-follow disabled entirely when prefers-reduced-motion is active
 *   - No canvas/WebGL element (confirms Spline dependency is absent)
 *   - Scroll cue visible after load
 *
 * Run:
 *   npx playwright test e2e/hero-ux --project=chromium
 *   npx playwright test e2e/hero-ux --headed   (for visual inspection)
 */

import { test, expect } from '@playwright/test'

const HOME = '/'

// ─── hero narrative elements ──────────────────────────────────────────────────

test.describe('hero narrative', () => {
  test('Early access badge is visible', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Early access')).toBeVisible({ timeout: 5000 })
  })

  test('headline contains "Architectural"', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Architectural',
      { timeout: 5000 },
    )
  })

  test('subtitle describes the product', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText(/Describe a home in plain English/)).toBeVisible({
      timeout: 5000,
    })
  })

  test('typewriter prompt renders initial text', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    // In reduced-motion mode the first prompt is shown immediately
    await expect(
      page.getByText(/3-bedroom family home/),
    ).toBeVisible({ timeout: 5000 })
  })
})

// ─── CTA pathway validation ───────────────────────────────────────────────────

test.describe('CTA pathways', () => {
  test('"Get started" links to /signin', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    const cta = page.getByRole('link', { name: 'Get started' })
    await expect(cta).toBeVisible({ timeout: 5000 })
    await expect(cta).toHaveAttribute('href', '/signin')
  })

  test('"Try demo" links to /generator', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    const cta = page.getByRole('link', { name: /Try demo/ })
    await expect(cta).toBeVisible({ timeout: 5000 })
    await expect(cta).toHaveAttribute('href', '/generator')
  })

  test('"Get started" click navigates to /signin', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: 'Get started' }).click()
    await expect(page).toHaveURL(/\/signin/, { timeout: 8000 })
  })

  test('"Try demo" click navigates to /generator', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    await page.getByRole('link', { name: /Try demo/ }).click()
    await expect(page).toHaveURL(/\/generator/, { timeout: 8000 })
  })
})

// ─── cursor-follow glow (motion OFF) ─────────────────────────────────────────

test.describe('cursor-follow glow — motion OFF', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('glow element is in the DOM', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    // Glow is aria-hidden and pointer-events-none; identified by its inline blur style
    const glow = page.locator('[aria-hidden][class*="blur-3xl"]').first()
    await expect(glow).toBeAttached({ timeout: 5000 })
  })

  test('glow becomes visible on mousemove into hero', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    const glow = page.locator('[aria-hidden][class*="blur-3xl"]').first()

    // Initially opacity:0 (cursorInside = false)
    await expect(glow).toHaveCSS('opacity', '0')

    // Move into hero container — triggers mouseenter + mousemove
    await page.mouse.move(600, 300)

    // opacity transitions to 1 (cursorInside = true)
    await expect(glow).toHaveCSS('opacity', '1', { timeout: 3000 })
  })
})

// ─── cursor-follow glow (motion ON — disabled) ───────────────────────────────

test.describe('cursor-follow glow — motion ON (disabled)', () => {
  test.use({ reducedMotion: 'reduce' })

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('glow element is absent from DOM', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    // When reduce = true, HeroSection does not render the glow div
    const glow = page.locator('[aria-hidden][class*="blur-3xl"]').first()
    await expect(glow).not.toBeAttached({ timeout: 5000 })
  })
})

// ─── no Spline / canvas dependency ───────────────────────────────────────────

test.describe('no external 3D runtime', () => {
  test('no <canvas> element rendered on home page', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    await expect(page.locator('canvas')).toHaveCount(0)
  })

  test('no @splinetool script loaded', async ({ page }) => {
    const splineRequests: string[] = []
    page.on('request', req => {
      if (req.url().includes('spline')) splineRequests.push(req.url())
    })

    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    expect(splineRequests).toHaveLength(0)
  })
})

// ─── scroll cue ──────────────────────────────────────────────────────────────

test.describe('scroll cue', () => {
  test('scroll cue text is visible after load', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    await expect(page.getByText('Scroll')).toBeVisible({ timeout: 6000 })
  })
})

// ─── no JS errors ────────────────────────────────────────────────────────────

test.describe('page integrity', () => {
  test('no JS console errors on home page load', async ({ page }) => {
    const errors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto(HOME)
    await page.waitForLoadState('networkidle')

    expect(errors).toHaveLength(0)
  })
})
