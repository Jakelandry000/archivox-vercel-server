/**
 * Landing page — visual snapshots + NarrativeSection & FeatureStrip scroll checks
 *
 * Covers:
 *   - Visual snapshots of the above-the-fold hero in both motion states
 *   - NarrativeSection: scroll-triggered reveal of all 3 steps, export file badges,
 *     and element-level snapshots in both motion states
 *   - FeatureStrip: scroll-triggered reveal of all 3 features and element-level snapshots
 *
 * Snapshot baselines are generated on first run and committed to version control.
 * Re-run with --update-snapshots to regenerate after intentional UI changes.
 *
 * Run:
 *   npx playwright test e2e/landing-page-visual --project=chromium
 *   npx playwright test e2e/landing-page-visual --update-snapshots
 */

import { test, expect } from '@playwright/test'

const HOME = '/'

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Wait until a Framer Motion whileInView animation cycle has settled. */
async function waitForFMSettle(
  page: import('@playwright/test').Page,
  ms: number,
) {
  // Framer Motion drives animations via JS RAF — give it the required time budget.
  await page.waitForTimeout(ms)
}

// ─── visual snapshots: landing page above-the-fold ───────────────────────────

test.describe('landing page — above-the-fold visual snapshots', () => {
  test('hero snapshot — motion OFF (blueprint animated)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')
    // BlueprintBackground: max delay 1.5s + duration 0.85s → settle at 2.5s
    await waitForFMSettle(page, 2500)
    await expect(page).toHaveScreenshot('hero-motion-off.png', {
      clip: { x: 0, y: 0, width: 1280, height: 720 },
      maxDiffPixelRatio: 0.03,
      animations: 'disabled',
    })
  })

  test('hero snapshot — motion ON (blueprint static)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveScreenshot('hero-motion-on.png', {
      clip: { x: 0, y: 0, width: 1280, height: 720 },
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    })
  })
})

// ─── NarrativeSection — dynamic scroll checks ────────────────────────────────

test.describe('NarrativeSection — dynamic scroll checks (motion OFF)', () => {
  test.use({ reducedMotion: 'no-preference' })

  test.beforeEach(async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')
    await page.getByText('How it works').scrollIntoViewIfNeeded()
    // Allow whileInView transitions to complete (max 2.1s for floor plan labels)
    await waitForFMSettle(page, 2200)
  })

  test('"How it works" eyebrow label is visible', async ({ page }) => {
    await expect(page.getByText('How it works')).toBeVisible({ timeout: 3000 })
  })

  test('"From brief to blueprint" heading is visible', async ({ page }) => {
    await expect(
      page.getByRole('heading', { level: 2 }).filter({ hasText: 'From brief to blueprint' }),
    ).toBeVisible({ timeout: 3000 })
  })

  test('step numbers 01, 02, 03 are all visible', async ({ page }) => {
    for (const num of ['01', '02', '03']) {
      await expect(page.getByText(num).first()).toBeVisible({ timeout: 3000 })
    }
  })

  test('step titles Describe, Generate, Export are all visible', async ({ page }) => {
    for (const title of ['Describe', 'Generate', 'Export']) {
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 3000 })
    }
  })

  test('step body text renders for all three steps', async ({ page }) => {
    await expect(page.getByText(/Write a brief in plain English/)).toBeVisible({ timeout: 3000 })
    await expect(page.getByText(/ArchiVox resolves room adjacency/)).toBeVisible({ timeout: 3000 })
    await expect(page.getByText(/Download SVG, AutoCAD script/)).toBeVisible({ timeout: 3000 })
  })
})

test.describe('NarrativeSection — export step scroll checks (motion OFF)', () => {
  test.use({ reducedMotion: 'no-preference' })

  test('export file cards render after scrolling to step 03', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')
    await page.getByText('Export', { exact: true }).first().scrollIntoViewIfNeeded()
    await waitForFMSettle(page, 800)

    for (const filename of ['floor_plan.svg', 'drawing.scr', 'report.pdf']) {
      await expect(page.getByText(filename)).toBeVisible({ timeout: 5000 })
    }
  })

  test('all three export "Ready" badges are present', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')
    await page.getByText('Export', { exact: true }).first().scrollIntoViewIfNeeded()
    await waitForFMSettle(page, 800)

    const exportCards = page.locator('[data-testid="export-file-cards"]')
    await expect(exportCards.getByText('Ready', { exact: true })).toHaveCount(3, { timeout: 5000 })
  })

  test('export file descriptor labels are visible', async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')
    await page.getByText('Export', { exact: true }).first().scrollIntoViewIfNeeded()
    await waitForFMSettle(page, 800)

    const exportCards = page.locator('[data-testid="export-file-cards"]')
    await expect(exportCards.getByText('Vector floor plan', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(exportCards.getByText('AutoCAD script', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(exportCards.getByText('IBC validation', { exact: true })).toBeVisible({ timeout: 5000 })
  })
})

test.describe('NarrativeSection — dynamic scroll checks (motion ON)', () => {
  test.use({ reducedMotion: 'reduce' })

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')
    await page.getByText('How it works').scrollIntoViewIfNeeded()
  })

  test('all step titles visible in reduced motion', async ({ page }) => {
    for (const title of ['Describe', 'Generate', 'Export']) {
      await expect(page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 3000 })
    }
  })

  test('export file cards immediately visible in reduced motion', async ({ page }) => {
    await page.getByText('Export', { exact: true }).first().scrollIntoViewIfNeeded()
    for (const filename of ['floor_plan.svg', 'drawing.scr', 'report.pdf']) {
      await expect(page.getByText(filename)).toBeVisible({ timeout: 3000 })
    }
  })
})

// ─── NarrativeSection — visual snapshots ─────────────────────────────────────

test.describe('NarrativeSection — visual snapshots', () => {
  test('NarrativeSection snapshot — motion OFF (post-animation)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')
    await page.getByText('How it works').scrollIntoViewIfNeeded()
    await waitForFMSettle(page, 2300)

    const section = page.locator('section').filter({ hasText: 'How it works' })
    await expect(section).toHaveScreenshot('narrative-section-motion-off.png', {
      maxDiffPixelRatio: 0.03,
      animations: 'disabled',
    })
  })

  test('NarrativeSection snapshot — motion ON (reduced, static)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')
    await page.getByText('How it works').scrollIntoViewIfNeeded()

    const section = page.locator('section').filter({ hasText: 'How it works' })
    await expect(section).toHaveScreenshot('narrative-section-motion-on.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    })
  })
})

// ─── FeatureStrip — dynamic scroll checks ────────────────────────────────────

test.describe('FeatureStrip — dynamic scroll checks (motion OFF)', () => {
  test.use({ reducedMotion: 'no-preference' })

  test.beforeEach(async ({ page }) => {
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')
    await page.getByText('What you get').scrollIntoViewIfNeeded()
    // FeatureStrip: max stagger 0.2s + duration 0.45s → settle at 700ms
    await waitForFMSettle(page, 750)
  })

  test('"What you get" label is visible after scroll', async ({ page }) => {
    await expect(page.getByText('What you get')).toBeVisible({ timeout: 3000 })
  })

  test('all three feature titles are visible', async ({ page }) => {
    for (const title of ['2D Floor Plans', 'AutoCAD Scripts', 'Validation + IBC']) {
      await expect(page.getByText(title)).toBeVisible({ timeout: 3000 })
    }
  })

  test('all three feature body texts render', async ({ page }) => {
    await expect(page.getByText(/SVG floor plans generated from constraint/)).toBeVisible({
      timeout: 3000,
    })
    await expect(page.getByText(/Ready-to-run .scr files/)).toBeVisible({ timeout: 3000 })
    await expect(page.getByText(/Automatic overlap detection/)).toBeVisible({ timeout: 3000 })
  })
})

test.describe('FeatureStrip — dynamic scroll checks (motion ON)', () => {
  test.use({ reducedMotion: 'reduce' })

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')
    await page.getByText('What you get').scrollIntoViewIfNeeded()
  })

  test('all three features visible in reduced motion', async ({ page }) => {
    for (const title of ['2D Floor Plans', 'AutoCAD Scripts', 'Validation + IBC']) {
      await expect(page.getByText(title)).toBeVisible({ timeout: 3000 })
    }
  })
})

// ─── FeatureStrip — visual snapshots ─────────────────────────────────────────

test.describe('FeatureStrip — visual snapshots', () => {
  test('FeatureStrip snapshot — motion OFF (post-animation)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')
    await page.getByText('What you get').scrollIntoViewIfNeeded()
    await waitForFMSettle(page, 750)

    const strip = page.locator('main').filter({ hasText: 'What you get' })
    await expect(strip).toHaveScreenshot('feature-strip-motion-off.png', {
      maxDiffPixelRatio: 0.03,
      animations: 'disabled',
    })
  })

  test('FeatureStrip snapshot — motion ON (reduced, static)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(HOME)
    await page.waitForLoadState('networkidle')
    await page.getByText('What you get').scrollIntoViewIfNeeded()

    const strip = page.locator('main').filter({ hasText: 'What you get' })
    await expect(strip).toHaveScreenshot('feature-strip-motion-on.png', {
      maxDiffPixelRatio: 0.02,
      animations: 'disabled',
    })
  })
})
