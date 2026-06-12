/**
 * E2E: cursor behaviour when hovering over overlapping 3D room meshes.
 *
 * Tests the _hoveredRoomCount guard in RoomMesh.tsx that ensures cursor
 * stays 'pointer' while any room is hovered and only resets to 'auto' when
 * the pointer leaves every room simultaneously.
 *
 * Test fixture page: /dev/floor-plan-test
 *   Room A  x=[6,16],  y=[4,12]   (kitchen)
 *   Room B  x=[12,22], y=[6,14]   (bedroom)
 *   Overlap x=[12,16], y=[6,12]
 *
 * Camera: OrthographicCamera at (20,12,50) looking along -Z, zoom=40.
 * Viewport: 1280×720 (Playwright default).
 *
 * Screen-coordinate formulas (canvas fills full viewport):
 *   screen_x = (world_x − 4)  × 40
 *   screen_y = (21 − world_y) × 40
 *
 * Key positions (world → screen):
 *   ONLY_A   (9, 8)   → (200, 520)
 *   OVERLAP  (14, 9)  → (400, 480)
 *   ONLY_B   (19, 10) → (600, 440)
 *   OUTSIDE  (25, 17) → (840, 160)
 *
 * Run:
 *   npx playwright test e2e/cursor-overlap --project=chromium
 *   npx playwright test e2e/cursor-overlap --headed
 */

import { test, expect, type Page } from '@playwright/test';

// ─── constants ────────────────────────────────────────────────────────────────

const TEST_PATH = '/dev/floor-plan-test';

/** Screen positions, all relative to the top-left of the viewport. */
const POS = {
  outside: { x: 900, y:  80 },  // world (26.5,18.5) — outside both rooms
  onlyA:   { x: 160, y: 520 },  // world ( 8, 8)     — only Room A
  overlap:  { x: 400, y: 480 }, // world (14, 9)      — overlap zone (A ∩ B)
  onlyB:   { x: 620, y: 440 },  // world (19.5,10)    — only Room B
} as const;

/** How long R3F needs to process a pointer-move event and update the cursor. */
const CURSOR_SETTLE_MS = 200;

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the canvas element's inline cursor style, defaulting to 'auto' if
 * not explicitly set. RoomMesh.tsx writes directly to `gl.domElement.style.cursor`
 * so the inline style is the authoritative value.
 */
async function getCanvasCursor(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    return canvas?.style.cursor || 'auto';
  });
}

/**
 * Moves the mouse to a position using multiple intermediate steps so R3F's
 * event loop receives several pointermove events along the path.  This ensures
 * the raycaster is active even on the very first move after page load.
 */
async function moveTo(page: Page, pos: { x: number; y: number }): Promise<void> {
  await page.mouse.move(pos.x, pos.y, { steps: 8 });
  await page.waitForTimeout(CURSOR_SETTLE_MS);
}

/**
 * Waits until the canvas cursor equals `expected`.  Times out after 2 s with a
 * descriptive assertion failure so the test error is easy to diagnose.
 */
async function expectCursor(page: Page, expected: 'pointer' | 'auto'): Promise<void> {
  await expect(async () => {
    const actual = await getCanvasCursor(page);
    expect(actual).toBe(expected);
  }).toPass({ timeout: 2000 });
}

// ─── setup ───────────────────────────────────────────────────────────────────

test.describe('RoomMesh cursor — overlapping rooms', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test.beforeEach(async ({ page }) => {
    // Collect console errors to catch R3F / Three.js panics.
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto(TEST_PATH);
    // 'load' (not 'networkidle') — Turbopack HMR keeps a websocket open
    // that prevents 'networkidle' from ever firing in dev.
    await page.waitForLoadState('load');

    // Wait for the R3F canvas to be present and for at least one WebGL frame.
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeAttached({ timeout: 10_000 });
    // Give Three.js / drei time to complete the first render and set the
    // camera projection matrix via useLayoutEffect.
    await page.waitForTimeout(1000);

    // Warm-up pass: sweep the mouse across the canvas so R3F's event loop
    // processes several pointermove events before any assertion.  Without this
    // the very first move after load might fire before the raycaster is ready.
    await page.mouse.move(640, 360, { steps: 10 });
    await page.waitForTimeout(200);

    // Settle at the outside-rooms baseline position.
    await moveTo(page, POS.outside);

    expect(consoleErrors, 'no console errors on load').toHaveLength(0);
  });

  // ─── core cursor tests ──────────────────────────────────────────────────────

  test('cursor is "auto" when not hovering any room', async ({ page }) => {
    await expectCursor(page, 'auto');
  });

  test('cursor becomes "pointer" when hovering only Room A', async ({ page }) => {
    await moveTo(page, POS.onlyA);
    await expectCursor(page, 'pointer');
  });

  test('cursor becomes "pointer" when hovering only Room B', async ({ page }) => {
    await moveTo(page, POS.onlyB);
    await expectCursor(page, 'pointer');
  });

  test('cursor stays "pointer" when hovering the overlap zone', async ({ page }) => {
    await moveTo(page, POS.overlap);
    await expectCursor(page, 'pointer');
  });

  test('cursor resets to "auto" after leaving all rooms', async ({ page }) => {
    await moveTo(page, POS.onlyA);
    await expectCursor(page, 'pointer');

    await moveTo(page, POS.outside);
    await expectCursor(page, 'auto');
  });

  // ─── overlap transition tests ───────────────────────────────────────────────

  test('cursor stays "pointer" moving from Room A through overlap into Room B', async ({ page }) => {
    // Enter Room A.
    await moveTo(page, POS.onlyA);
    await expectCursor(page, 'pointer');

    // Cross into the overlap zone.
    await moveTo(page, POS.overlap);
    await expectCursor(page, 'pointer');

    // Exit overlap into Room B only.
    await moveTo(page, POS.onlyB);
    await expectCursor(page, 'pointer');
  });

  test('cursor stays "pointer" moving from Room B through overlap into Room A', async ({ page }) => {
    await moveTo(page, POS.onlyB);
    await expectCursor(page, 'pointer');

    await moveTo(page, POS.overlap);
    await expectCursor(page, 'pointer');

    await moveTo(page, POS.onlyA);
    await expectCursor(page, 'pointer');
  });

  test('cursor resets to "auto" after traversing A→overlap→B→outside', async ({ page }) => {
    await moveTo(page, POS.onlyA);
    await moveTo(page, POS.overlap);
    await moveTo(page, POS.onlyB);
    await moveTo(page, POS.outside);

    await expectCursor(page, 'auto');
  });

  test('cursor never flickers to "auto" while crossing rooms', async ({ page }) => {
    /**
     * Sweep the mouse in small steps from only-A through the overlap into
     * only-B and record every distinct cursor value seen.  The cursor must
     * only ever be 'pointer' during the sweep — no 'auto' interstitials.
     */
    const cursorsSeen = new Set<string>();

    const startX = POS.onlyA.x;
    const endX   = POS.onlyB.x;
    const y      = POS.overlap.y; // constant Y inside both rooms' vertical range

    // Move in 20-pixel horizontal increments across the rooms.
    for (let x = startX; x <= endX; x += 20) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(50);
      const cursor = await getCanvasCursor(page);
      cursorsSeen.add(cursor);
    }

    expect(
      cursorsSeen.has('auto'),
      `cursor flicked to 'auto' during sweep: [${[...cursorsSeen].join(', ')}]`,
    ).toBe(false);

    expect(cursorsSeen.has('pointer')).toBe(true);
  });

  // ─── drag suppression tests ─────────────────────────────────────────────────

  test('isDraggingRef suppresses new onPointerOver cursor writes mid-drag', async ({ page }) => {
    /**
     * The test fixture has no OrbitControls, so the cursor is NOT changed to
     * 'grab'/'grabbing' during a drag.  What this test verifies instead is the
     * isDraggingRef guard: while dragging within a room, moving INTO a second
     * overlapping room's exclusive zone must NOT produce a spurious cursor
     * change — the cursor should stay 'pointer' from the pre-drag hover.
     *
     * Full OrbitControls integration (grab cursor ownership) is tested in the
     * broader integration suite; it requires OrbitControls to be present.
     */
    await moveTo(page, POS.onlyA);
    await expectCursor(page, 'pointer');

    // Start drag while inside Room A.
    await page.mouse.down();
    // Drag into the overlap zone — isDraggingRef should prevent an extra
    // cursor write from the onPointerOver of Room B.
    await page.mouse.move(POS.overlap.x, POS.overlap.y, { steps: 5 });
    await page.waitForTimeout(CURSOR_SETTLE_MS);

    // Cursor should still be 'pointer' (set before drag, not reset mid-drag).
    const duringDrag = await getCanvasCursor(page);
    expect(duringDrag).toBe('pointer');

    await page.mouse.up();
  });

  test('cursor re-asserts "pointer" after drag ends while still over a room', async ({ page }) => {
    await moveTo(page, POS.onlyA);
    await page.mouse.down();
    await page.mouse.move(POS.onlyA.x + 10, POS.onlyA.y - 10, { steps: 5 });
    await page.waitForTimeout(CURSOR_SETTLE_MS);

    await page.mouse.up();
    await page.waitForTimeout(CURSOR_SETTLE_MS);

    // After releasing the pointer while still inside Room A, the pointerup
    // handler in RoomMesh re-asserts cursor='pointer'.
    await expectCursor(page, 'pointer');
  });
});
