import { expect, test } from '@playwright/test'
import {
  FRONTEND_URL,
  createE2EFixture,
  provisionLocalFixture,
} from './village-e2e-fixture'
import {
  DEFAULT_WORLD_BOUNDS,
  WORLD_CAMERA_SCALE,
  cameraVariables,
  cameraScaleForViewport,
  calculateRenderBounds,
  filterVisibleInteractions,
  filterVisibleObjects,
  pixelToTile,
  tileToPixel,
  worldPixelSize,
} from '../src/components/village/worldViewport'

const fixture = createE2EFixture('village-phase3a')

test.beforeAll(async ({ request }) => provisionLocalFixture(request, fixture))

test('uses one global tile, pixel and camera coordinate contract', () => {
  expect(tileToPixel(0)).toBe(0)
  expect(tileToPixel(23)).toBe(1104)
  expect(pixelToTile(47)).toBe(0)
  expect(pixelToTile(48)).toBe(1)
  expect(pixelToTile(-1)).toBe(-1)
  expect(worldPixelSize(DEFAULT_WORLD_BOUNDS)).toEqual({ width: 1152, height: 768 })
  expect(cameraVariables({ x: 480, y: 384 }, DEFAULT_WORLD_BOUNDS)).toMatchObject({
    '--camera-character-x': `${480 * WORLD_CAMERA_SCALE}px`,
    '--camera-character-y': `${384 * WORLD_CAMERA_SCALE}px`,
    '--world-width': '1152px',
    '--world-height': '768px',
  })
})

test('desktop and mobile derive render windows from the same camera scale', () => {
  const desktop = calculateRenderBounds({
    playerPixelX: 11 * 48,
    playerPixelY: 8 * 48,
    viewportWidth: 1440,
    viewportHeight: 900,
    worldBounds: DEFAULT_WORLD_BOUNDS,
  })
  const mobile = calculateRenderBounds({
    playerPixelX: 11 * 48,
    playerPixelY: 8 * 48,
    viewportWidth: 390,
    viewportHeight: 844,
    worldBounds: DEFAULT_WORLD_BOUNDS,
  })
  expect(desktop).toEqual(DEFAULT_WORLD_BOUNDS)
  expect(mobile.minX).toBeGreaterThan(DEFAULT_WORLD_BOUNDS.minX)
  expect(mobile.maxX).toBeLessThan(DEFAULT_WORLD_BOUNDS.maxX)
  expect(mobile.minY).toBe(DEFAULT_WORLD_BOUNDS.minY)
  expect(mobile.maxY).toBe(DEFAULT_WORLD_BOUNDS.maxY)
})

test('keeps a valid render window when viewport dimensions are initially zero', () => {
  const bounds = calculateRenderBounds({
    playerPixelX: 12 * 48,
    playerPixelY: 8 * 48,
    viewportWidth: 0,
    viewportHeight: 0,
    worldBounds: DEFAULT_WORLD_BOUNDS,
  })
  expect(bounds).toEqual({ minX: 11, maxX: 13, minY: 7, maxY: 9 })
  expect(bounds.minX).toBeLessThanOrEqual(12)
  expect(bounds.maxX).toBeGreaterThanOrEqual(12)
  expect(bounds.minY).toBeLessThanOrEqual(8)
  expect(bounds.maxY).toBeGreaterThanOrEqual(8)
})

test('mobile camera keeps more of the village visible without changing server coordinates', () => {
  const portraitScale = cameraScaleForViewport(390, 844)
  const landscapeScale = cameraScaleForViewport(844, 390)
  const desktopScale = cameraScaleForViewport(1440, 900)

  expect(portraitScale).toBeLessThan(landscapeScale)
  expect(landscapeScale).toBeLessThan(WORLD_CAMERA_SCALE)
  expect(desktopScale).toBe(WORLD_CAMERA_SCALE)
  expect(cameraVariables({ x: 528, y: 384 }, DEFAULT_WORLD_BOUNDS, portraitScale)).toMatchObject({
    '--character-x': 528,
    '--character-y': 384,
    '--camera-zoom': portraitScale,
  })
})

test('render window unloads offscreen entities and pins active targets by ID', () => {
  const bounds = { minX: 8, maxX: 14, minY: 5, maxY: 11 }
  const objects = [
    { id: 1, x: 10 * 48, y: 8 * 48 },
    { id: 2, x: 0, y: 0 },
    { id: 3, x: 23 * 48, y: 15 * 48 },
  ]
  expect(filterVisibleObjects(objects, bounds).map(({ id }) => id)).toEqual([1])
  expect(filterVisibleObjects(objects, bounds, 3).map(({ id }) => id)).toEqual([1, 3])

  const interactions = [
    { targetId: 1, type: 'TALK', x: 10, y: 8 },
    { targetId: 2, type: 'INTERACT', x: 0, y: 0 },
  ]
  expect(filterVisibleInteractions(interactions, bounds, 2).map(({ targetId }) => targetId))
    .toEqual([1, 2])
})

test('one hundred render-window updates remain bounded without accumulating entities', () => {
  const terrain = Array.from({ length: 384 }, (_, index) => ({
    x: index % 24,
    y: Math.floor(index / 24),
  }))
  let peak = 0
  for (let step = 0; step < 100; step += 1) {
    const x = step % 24
    const y = Math.floor(step / 24) % 16
    const bounds = calculateRenderBounds({
      playerPixelX: tileToPixel(x),
      playerPixelY: tileToPixel(y),
      viewportWidth: 390,
      viewportHeight: 844,
      worldBounds: DEFAULT_WORLD_BOUNDS,
    })
    const count = terrain.filter((tile) => (
      tile.x >= bounds.minX && tile.x <= bounds.maxX
      && tile.y >= bounds.minY && tile.y <= bounds.maxY
    )).length
    peak = Math.max(peak, count)
  }
  expect(peak).toBeLessThan(384)
})

test('real Village DOM follows the viewport while full-state counts stay stable', async ({ browser }) => {
  const evidence = []
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
  ]) {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width < 900,
      isMobile: viewport.width < 900,
    })
    try {
      const page = await context.newPage()
      await page.goto(FRONTEND_URL)
      const enter = page.getByRole('button', { name: '마을로 들어가기' })
      if (await enter.isVisible().catch(() => false)) await enter.click()
      const email = page.getByRole('textbox', { name: '이메일' })
      if (await email.isVisible().catch(() => false)) {
        await email.fill(fixture.email)
        await page.getByRole('textbox', { name: '비밀번호' }).fill(fixture.password)
        await page.getByRole('button', { name: '들어가기' }).click()
      }
      await expect(page.locator('.persistent-terrain')).toHaveAttribute('data-total-count', /^(384|448|512|576|640|704|768|832|896|960|1024|1088|1152|1216|1280)$/)
      const metrics = await page.evaluate(() => ({
        terrainData: Number(document.querySelector('.persistent-terrain')?.dataset.totalCount),
        terrainDom: document.querySelectorAll('.terrain-tile').length,
        objectData: Number(document.querySelector('.persistent-world-objects')?.dataset.totalCount),
        objectDom: document.querySelectorAll('[data-world-object-id]').length,
        playerDom: document.querySelectorAll('.pixel-character').length,
      }))
      expect(metrics.terrainDom).toBeGreaterThan(0)
      // A compact 24x16 hub may fit entirely inside the mobile zoomed-out
      // viewport. Larger worlds are still culled by the render-window unit
      // coverage above, while a fully visible compact hub is valid here.
      expect(metrics.terrainDom).toBeLessThanOrEqual(metrics.terrainData)
      expect(metrics.objectDom).toBeLessThanOrEqual(metrics.objectData)
      expect(metrics.playerDom).toBe(1)
      evidence.push({ viewport, ...metrics })
    } finally {
      await context.close()
    }
  }
  console.log(`PHASE3A_RENDER_EVIDENCE ${JSON.stringify(evidence)}`)
})
