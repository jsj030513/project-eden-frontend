import { expect, test } from '@playwright/test'
import { installHubWorld } from './hub-pixel-fixture'
import { installP41World } from './p41-terrain-fixture'

const enter = async (page) => {
  await page.goto('/')
  await page.getByRole('button', { name: '마을로 들어가기' }).click()
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', '1280')
}

function setTile(state, x, y, terrainType) {
  const tile = state.terrainTiles.find((value) => value.x === x && value.y === y)
  if (!tile) throw new Error(`Fixture has no tile at ${x},${y}`)
  tile.terrainType = terrainType
  tile.walkable = !['WATER', 'ROCK', 'BUILDING', 'CLIFF'].includes(terrainType)
}

function patch(state, x, y, width, height, terrainType) {
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) setTile(state, x + dx, y + dy, terrainType)
}

test('real hub BUILDING footprint is nine opaque pixel tiles below the separate house object', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const fixture = await installHubWorld(page, { x: 14, y: 8 })
  await enter(page)
  const footprint = page.locator('.pixel-terrain__tile[data-family="building-footprint"]')
  await expect(footprint).toHaveCount(9)
  await expect(footprint.first()).toHaveAttribute('data-asset-mode', 'base')
  const house = page.locator('.persistent-world-objects .asset-community_house')
  await expect(house).toBeVisible()
  expect(await house.evaluate((node) => Number(getComputedStyle(node.closest('.persistent-world-objects')).zIndex))).toBeGreaterThan(await page.locator('.pixel-terrain').evaluate((node) => Number(getComputedStyle(node).zIndex)))
  await page.screenshot({ path: '/tmp/eden-p42-verification/building-house-overlay.png', animations: 'disabled' })
  await page.screenshot({ path: '/tmp/eden-p42-verification/building-foundation.png', animations: 'disabled' })
  await page.screenshot({ path: '/tmp/eden-p42-verification/hub-center.png', animations: 'disabled' })
  expect(fixture.unexpected).toEqual([])
})

test('synthetic BEACH patch crosses a negative chunk seam and stays base-only beside WATER', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const fixture = await installP41World(page, { x: 0, y: -2 })
  patch(fixture.state, -1, -4, 4, 4, 'BEACH')
  patch(fixture.state, 3, -4, 1, 4, 'WATER')
  await enter(page)
  const beach = page.locator('.pixel-terrain__tile[data-family="sand"]')
  await expect(beach).toHaveCount(16)
  await expect(page.locator('.pixel-terrain__tile[data-family="water"][data-tile="3:-3"]')).toHaveAttribute('data-asset-mode', 'exact')
  await expect(page.locator('.pixel-terrain__tile[data-tile="-1:-3"]')).toBeInViewport()
  await expect(page.locator('.pixel-terrain__tile[data-tile="0:-3"]')).toBeInViewport()
  await page.screenshot({ path: '/tmp/eden-p42-verification/beach-patch.png', animations: 'disabled' })
  await page.screenshot({ path: '/tmp/eden-p42-verification/beach-water-adjacency.png', animations: 'disabled' })
  expect(fixture.state.terrainTiles.filter((tile) => tile.terrainType === 'BEACH').every((tile) => tile.walkable)).toBe(true)
  expect(fixture.unexpected).toEqual([])
})

test('synthetic direction-neutral CLIFF patch crosses a chunk seam beside ROCK', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const fixture = await installP41World(page, { x: 8, y: 5 })
  patch(fixture.state, 7, 4, 4, 4, 'CLIFF')
  patch(fixture.state, 6, 4, 1, 4, 'ROCK')
  await enter(page)
  const cliff = page.locator('.pixel-terrain__tile[data-family="cliff"]')
  await expect(cliff).toHaveCount(16)
  await expect(cliff.first()).toHaveAttribute('data-asset-key', /^terrain\/cliff\/base/)
  await expect(page.locator('.pixel-terrain__tile[data-family="rock-ground"][data-tile="6:5"]')).toBeVisible()
  await expect(page.locator('.pixel-terrain__tile[data-tile="7:5"]')).toBeInViewport()
  await expect(page.locator('.pixel-terrain__tile[data-tile="8:5"]')).toBeInViewport()
  await page.screenshot({ path: '/tmp/eden-p42-verification/cliff-patch.png', animations: 'disabled' })
  await page.screenshot({ path: '/tmp/eden-p42-verification/cliff-rock-adjacency.png', animations: 'disabled' })
  expect(fixture.state.terrainTiles.filter((tile) => tile.terrainType === 'CLIFF').every((tile) => !tile.walkable)).toBe(true)
  expect(fixture.unexpected).toEqual([])
})

for (const [terrainType, y, walkable] of [['BUILDING', 5, false], ['BEACH', 6, true], ['CLIFF', 7, false]]) {
  test(`${terrainType} movement contract remains ${walkable ? 'walkable' : 'blocked'}`, async ({ page }) => {
    const fixture = await installP41World(page, { x: 11, y })
    setTile(fixture.state, 12, y, terrainType)
    setTile(fixture.state, 13, y, 'ROCK')
    await enter(page)
    await page.keyboard.down('ArrowRight')
    if (walkable) await expect.poll(() => fixture.moves.length).toBe(1)
    else await page.waitForTimeout(350)
    await page.keyboard.up('ArrowRight')
    await expect.poll(() => page.evaluate(() => window.__edenPhase3cDiagnostics.activeMovementSchedulers)).toBe(0)
    expect(fixture.moves).toEqual(walkable ? [{ targetX: 12, targetY: y, accepted: true }] : [])
    await expect(page.locator('.pixel-character')).toHaveCSS('left', `${(walkable ? 12 : 11) * 48}px`)
    expect(fixture.unexpected).toEqual([])
  })
}

test('all eleven terrain families appear in a fixture-only gallery at desktop and mobile sizes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const fixture = await installP41World(page, { x: 1, y: 5 })
  const types = ['GRASS', 'ROAD', 'SOIL', 'WATER', 'ROCK', 'FLOWER_FIELD', 'FOREST', 'BRIDGE', 'BUILDING', 'BEACH', 'CLIFF']
  for (let y = 0; y < types.length; y++) patch(fixture.state, 0, y, 4, 1, types[y])
  await enter(page)
  for (const family of ['grass', 'path', 'soil', 'water', 'rock-ground', 'flower-ground', 'forest-ground', 'bridge', 'building-footprint', 'sand', 'cliff']) {
    await expect(page.locator(`.pixel-terrain__tile[data-family="${family}"]`).first()).toBeAttached()
  }
  await page.screenshot({ path: '/tmp/eden-p42-verification/terrain-gallery.png', animations: 'disabled' })
  await page.setViewportSize({ width: 375, height: 667 })
  await page.screenshot({ path: '/tmp/eden-p42-verification/mobile-portrait.png', animations: 'disabled' })
  await page.setViewportSize({ width: 667, height: 375 })
  await page.screenshot({ path: '/tmp/eden-p42-verification/mobile-landscape.png', animations: 'disabled' })
  expect(fixture.unexpected).toEqual([])
})

test('failed terrain PNG keeps distinct BUILDING, BEACH, and CLIFF CSS fallbacks', async ({ page }) => {
  const fixture = await installP41World(page, { x: 4, y: 6 })
  setTile(fixture.state, 12, 5, 'BUILDING')
  setTile(fixture.state, 13, 5, 'BEACH')
  setTile(fixture.state, 14, 5, 'CLIFF')
  await page.route('**/terrain-atlas.png', (route) => route.abort())
  await enter(page)
  await expect(page.locator('.pixel-terrain__tile')).toHaveCount(0)
  const colors = {}
  for (const type of ['building', 'beach', 'cliff', 'rock']) {
    const node = page.locator(`.terrain-${type}`).first()
    await expect(node).toBeVisible()
    colors[type] = await node.evaluate((element) => getComputedStyle(element).backgroundImage)
  }
  expect(colors.building).toContain('linear-gradient')
  expect(colors.beach).toContain('radial-gradient')
  expect(colors.cliff).toContain('radial-gradient')
  expect(colors.cliff).not.toBe(colors.rock)
  expect(fixture.unexpected).toEqual([])
})
