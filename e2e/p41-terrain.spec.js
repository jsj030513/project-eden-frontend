import { expect, test } from '@playwright/test'
import { installP41World } from './p41-terrain-fixture'
import { installHubWorld } from './hub-pixel-fixture'
import { resolveWorldTiles } from '../src/components/village/worldTileResolver'
import { lookupPixelTile } from '../src/components/village/pixelTileManifest'

const pixel = (page, x, y) => page.locator(`.village-page .pixel-terrain__tile[data-tile="${x}:${y}"]`)
async function enter(page) {
  await page.goto('/')
  await page.getByRole('button', { name: '마을로 들어가기' }).click()
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', '1280')
}

async function verifyArt(page, state) {
  const expected = new Map(resolveWorldTiles(state.terrainTiles).map((tile) => [`${tile.x}:${tile.y}`, lookupPixelTile(tile)]))
  await expect.poll(async () => {
    const nodes = await page.locator('.village-page .pixel-terrain__tile').evaluateAll((tiles) => tiles.map((tile) => ({ tile: tile.dataset.tile, key: tile.dataset.assetKey })))
  const supportedCount = await page.locator('.village-page .terrain-tile').count()
    return nodes.length === supportedCount && nodes.every(({ tile, key }) => expected.get(tile)?.key === key)
  }).toBe(true)
  await expect(page.locator('.village-page .pixel-terrain')).toHaveCSS('pointer-events', 'none')
  await expect(page.locator('.village-page .pixel-terrain__tile').first()).toHaveCSS('image-rendering', 'pixelated')
}

for (const [name, x, y, family] of [
  ['flower-field', -4, -2, 'flower-ground'], ['forest-boundary', 0, 3, 'forest-ground'],
  ['bridge-horizontal', 8, 12, 'bridge'], ['bridge-vertical', 19, 3, 'bridge'], ['bridge-cross', -4, 13, 'bridge'],
]) {
  test(`${name} paints its real atlas with deterministic boundaries`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    const fixture = await installP41World(page, { x, y })
    await enter(page)
    await verifyArt(page, fixture.state)
    await expect(pixel(page, x, y)).toHaveAttribute('data-family', family)
    await expect(pixel(page, x, y)).toBeInViewport()
    const before = await page.locator('.pixel-terrain__tile').evaluateAll((nodes) => nodes.map((node) => [node.dataset.tile, node.dataset.assetKey]))
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: 'disabled' })
    await enter(page)
    await verifyArt(page, fixture.state)
    expect(await page.locator('.pixel-terrain__tile').evaluateAll((nodes) => nodes.map((node) => [node.dataset.tile, node.dataset.assetKey]))).toEqual(before)
    expect(fixture.unexpected).toEqual([])
  })
}

test('forest chunk seam and inner/outer corners render without splitting the floor', async ({ page }) => {
  const fixture = await installP41World(page, { x: 0, y: 3 })
  await enter(page)
  await verifyArt(page, fixture.state)
  await expect(pixel(page, -1, 3)).toBeInViewport()
  await expect(pixel(page, 0, 3)).toBeInViewport()
  await expect(pixel(page, 0, 2)).toHaveCSS('background-image', /transition-atlas.png/)
  await expect(pixel(page, -2, 0)).toHaveCSS('background-image', /transition-atlas.png/)
  await expect(page.locator('.pixel-terrain')).toHaveCSS('overflow', 'visible')
})

test('flower/tree objects and template decoration remain separate above terrain', async ({ page }) => {
  const fixture = await installP41World(page, { x: -2, y: 0 })
  await enter(page)
  await verifyArt(page, fixture.state)
  for (const object of fixture.state.placedObjects) {
    const node = page.locator(`[data-world-object-id="${object.id}"]`)
    await expect(node).toHaveCSS('left', `${object.x}px`)
    await expect(node).toHaveCSS('top', `${object.y}px`)
    await expect(node).toBeVisible()
    expect(await node.evaluate((element) => element.closest('.pixel-terrain'))).toBeNull()
  }
  await expect(page.locator('.region-decoration.decoration-forest_tree').first()).toBeAttached()
  expect(await page.locator('.region-decorations').evaluate((node) => Number(getComputedStyle(node).zIndex))).toBeGreaterThan(await page.locator('.pixel-terrain').evaluate((node) => Number(getComputedStyle(node).zIndex)))
  await expect(page.locator('.persistent-world-objects')).toHaveCSS('pointer-events', 'none')
  await expect(page.locator('.hub-decoration')).toHaveCSS('display', 'none')
})

const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=', 'base64')
for (const failure of ['missing base', 'wrong base size', 'wrong transition size']) {
  test(`${failure} retains meaningful opaque family fallbacks`, async ({ page }) => {
    await installP41World(page, { x: 4, y: 6 })
    const isTransition = failure === 'wrong transition size'
    const path = isTransition ? 'transition-atlas.png' : 'terrain-atlas.png'
    await page.route(`**/${path}`, (route) => failure === 'missing base' ? route.abort() : route.fulfill({ contentType: 'image/png', body: onePixelPng }))
    await enter(page)
    if (failure !== 'missing base') {
      expect(await page.evaluate(async (name) => {
        const image = new Image()
        image.src = `/art/pixel/terrain/${name}`
        await image.decode()
        return [image.naturalWidth, image.naturalHeight]
      }, path)).toEqual([1, 1])
    }
    if (isTransition) {
      await expect(page.locator('.pixel-terrain__tile[data-family="forest-ground"]').first()).toHaveAttribute('data-asset-mode', 'base')
      await expect(page.locator('.pixel-terrain__tile[data-family="bridge"]').first()).toHaveAttribute('data-asset-mode', 'base')
      await expect(page.locator('.pixel-terrain__tile[data-asset-mode="exact"]')).toHaveCount(0)
    } else {
      await expect(page.locator('.pixel-terrain__tile')).toHaveCount(0)
      for (const [type, color] of [['flower_field', 'rgb(120, 148, 86)'], ['forest', 'rgb(99, 118, 76)']]) {
        await expect(page.locator(`.terrain-${type}`).first()).toHaveCSS('background-color', color)
        await expect(page.locator(`.terrain-${type}`).first()).toHaveCSS('background-image', /radial-gradient/)
      }
      await expect(page.locator('.terrain-bridge').first()).toHaveCSS('background-image', /repeating-linear-gradient/)
      await expect(page.locator('.persistent-terrain')).toHaveCSS('opacity', '1')
    }
  })
}

for (const [type, y, walkable] of [['FLOWER_FIELD', -4, true], ['FOREST', -2, true], ['BRIDGE', 0, true], ['WATER', 2, false], ['ROCK', 4, false]]) {
  test(`${type} preserves authoritative ${walkable ? 'walking' : 'collision'}`, async ({ page }) => {
    const fixture = await installP41World(page, { x: 11, y })
    await enter(page)
    await verifyArt(page, fixture.state)
    await page.keyboard.down('ArrowRight')
    if (walkable) await expect.poll(() => fixture.moves.length).toBe(1)
    else await page.waitForTimeout(350) // Multiple scheduler ticks against blocked terrain.
    await page.keyboard.up('ArrowRight')
    await expect.poll(() => page.evaluate(() => window.__edenPhase3cDiagnostics.activeMovementSchedulers)).toBe(0)
    expect(fixture.moves).toEqual(walkable ? [{ targetX: 12, targetY: y, accepted: true }] : [])
    await expect(page.locator('.pixel-character')).toHaveCSS('left', `${(walkable ? 12 : 11) * 48}px`)
    expect(fixture.unexpected).toEqual([])
  })
}

for (const [name, x, y] of [['hub-center', 11, 8], ['outer-meadow', -4, 4], ['pond-bridge', 19, 13]]) {
  test(`real fixture ${name} retains objects and pixel coverage`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    const fixture = await installHubWorld(page, { x, y })
    await enter(page)
    await verifyArt(page, fixture.state)
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: 'disabled' })
    expect(fixture.unexpected).toEqual([])
  })
}

for (const viewport of [{ width: 375, height: 667 }, { width: 667, height: 375 }]) {
  test(`mobile ${viewport.width}x${viewport.height} retains vertical bridge edges and open road entry`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport)
    const fixture = await installP41World(page, { x: 19, y: 0 })
    await enter(page)
    await verifyArt(page, fixture.state)
    await expect(pixel(page, 19, 0)).toHaveAttribute('data-asset-key', /bridge\/edges-0a\/corners-00/)
    await expect(pixel(page, 19, -1)).toHaveAttribute('data-family', 'path')
    await expect(pixel(page, 19, 0)).toBeInViewport()
    await page.screenshot({ path: testInfo.outputPath(`mobile-${viewport.width}x${viewport.height}.png`), animations: 'disabled' })
  })
}
