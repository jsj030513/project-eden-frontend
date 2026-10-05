import { expect, test } from '@playwright/test'
import { readFileSync, readdirSync } from 'node:fs'
import { buildAuditedWorld, HUB_AUDIT, installHubWorld } from './hub-pixel-fixture'
import { resolveWorldTiles } from '../src/components/village/worldTileResolver'
import { lookupPixelTile } from '../src/components/village/pixelTileManifest'

const resolved = resolveWorldTiles(buildAuditedWorld().terrainTiles)
const byTile = new Map(resolved.map((tile) => [`${tile.x}:${tile.y}`, tile]))
const at = (x, y) => byTile.get(`${x}:${y}`)
const boundaries = [
  ['north', { x: 11, y: 0 }, { x: 11, y: -1 }, 'south', 4],
  ['south', { x: 11, y: 15 }, { x: 11, y: 16 }, 'north', 1],
  ['west', { x: 0, y: 7 }, { x: -1, y: 7 }, 'east', 2],
  ['east', { x: 23, y: 7 }, { x: 24, y: 7 }, 'west', 8],
]

test('audited hub covers exactly 384 cells and preserves all 35 template object anchors', () => {
  const hub = resolved.filter((tile) => tile.x >= 0 && tile.x <= 23 && tile.y >= 0 && tile.y <= 15)
  expect(hub).toHaveLength(384)
  const counts = Object.fromEntries(Object.keys(HUB_AUDIT.counts).map((type) => [type, hub.filter((tile) => tile.terrainType === type).length]))
  expect(counts).toEqual({ FOREST: 124, GRASS: 156, ROAD: 33, BUILDING: 9, SOIL: 32, WATER: 24, BRIDGE: 6 })
  expect(hub.filter((tile) => lookupPixelTile(tile))).toHaveLength(384)
  expect(resolved).toHaveLength(1280)
  expect(resolved.filter((tile) => lookupPixelTile(tile))).toHaveLength(1280)
  expect(resolved.filter((tile) => !lookupPixelTile(tile))).toHaveLength(0)
  const building = hub.filter((tile) => tile.terrainType === 'BUILDING')
  expect(building).toHaveLength(9)
  expect(building.every((tile) => tile.walkable === false && lookupPixelTile(tile)?.family === 'building-footprint')).toBe(true)
  expect(HUB_AUDIT.placedObjects).toHaveLength(35)
  expect(HUB_AUDIT.placedObjects.find((object) => object.assetType === 'PLAZA')).toMatchObject({ x: 528, y: 336 })
  expect(HUB_AUDIT.placedObjects.find((object) => object.assetType === 'COMMUNITY_HOUSE')).toMatchObject({ x: 672, y: 288 })
})

test('production sources have no hub JPG reference while the reference asset remains', () => {
  const sourceRoot = new URL('../src/', import.meta.url)
  const sources = readdirSync(sourceRoot, { recursive: true })
    .filter((path) => /\.(jsx?|css|json|svg)$/.test(path))
    .map((path) => new URL(path, sourceRoot))
  sources.push(new URL('../index.html', import.meta.url))
  for (const source of sources) {
    expect(readFileSync(source, 'utf8'), source.pathname).not.toContain('eden-village-hub-v1.jpg')
  }
  expect(readFileSync(new URL('../public/art/eden-village-hub-v1.jpg', import.meta.url)).length).toBeGreaterThan(1000)
})

for (const [type, x, y, family, edges] of [
  ['WATER', 17, 11, 'water', 9], ['ROAD', 11, 6, 'path', 10], ['SOIL', 3, 4, 'soil', 9],
]) {
  test(`authoritative hub ${type} resolves its actual neighboring edges`, () => {
    const tile = at(x, y)
    expect(tile.terrainType).toBe(type)
    const visual = lookupPixelTile(tile)
    expect(visual).toMatchObject({ family, mode: 'exact', edgeMask: edges })
    expect(visual.layers.some((layer) => layer.atlas === 'transitions')).toBe(true)
  })
}

for (const [name, inside, outside, direction, bit] of boundaries) {
  test(`${name} boundary uses global neighbor data with the same atlas lookup`, () => {
    const outer = at(outside.x, outside.y)
    expect(at(inside.x, inside.y).family).toBe('forest-ground')
    expect(outer.neighborFamilies[direction]).toBe('forest-ground')
    const visual = lookupPixelTile(outer)
    expect(visual.family).toBe('path')
    expect(visual.edgeMask & bit).toBe(bit)
    expect(visual.layers.at(-1).atlas).toBe('base')
    const reversed = resolveWorldTiles([...buildAuditedWorld().terrainTiles].reverse()).find((tile) => tile.x === outside.x && tile.y === outside.y)
    expect(lookupPixelTile(reversed)).toEqual(visual)
  })
}

async function enter(page) {
  await page.goto('/')
  await page.getByRole('button', { name: '마을로 들어가기' }).click()
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', '1280')
  await expect(page.locator('.village-page .pixel-terrain__tile').first()).toBeVisible()
}

async function verifyRenderedTiles(page) {
  const rendered = await page.locator('.village-page .pixel-terrain__tile').evaluateAll((nodes) => nodes.map((node) => ({
    tile: node.dataset.tile, key: node.dataset.assetKey, family: node.dataset.family,
  })))
  for (const item of rendered) {
    const visual = lookupPixelTile(byTile.get(item.tile))
    expect(item.key).toBe(visual.key)
    expect(item.family).toBe(visual.family)
  }
  expect(new Set(rendered.map((item) => item.tile)).size).toBe(rendered.length)
  return rendered
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 667 }, { width: 667, height: 375 }]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport })
    test('pixel hub retains the real object layer, INSPECT and no runtime JPG request', async ({ page }, testInfo) => {
      const jpgRequests = []
      page.on('request', (request) => { if (request.url().includes('eden-village-hub-v1.jpg')) jpgRequests.push(request.url()) })
      const { unexpected } = await installHubWorld(page)
      await enter(page)
      await expect(page.locator('.village-page .pixel-terrain')).toHaveCount(1)
      await expect(page.locator('.village-page .grass-tiles')).toHaveCSS('background-image', 'none')
      await expect(page.locator('.village-page .persistent-terrain')).toHaveCSS('opacity', '1')
      await expect(page.locator('.village-page .persistent-terrain')).toHaveCSS('pointer-events', 'none')
      await expect(page.locator('.village-page .pixel-terrain')).toHaveCSS('pointer-events', 'none')
      await expect(page.locator('.village-page .ground-flora')).toHaveCount(0)
      await expect(page.locator('.village-page .hub-decoration')).toHaveCSS('display', 'none')
      await verifyRenderedTiles(page)
      const objects = page.locator('.village-page .persistent-world-objects')
      await expect(objects).toHaveAttribute('data-total-count', '35')
      await expect(objects).toHaveCSS('pointer-events', 'none')
      await expect(objects.locator('.asset-plaza')).toHaveCSS('opacity', '1')
      await expect(objects.locator('.asset-community_house')).toBeVisible()
      const positions = await objects.locator('[data-world-object-id]').evaluateAll((nodes) => nodes.map((node) => ({ id: Number(node.dataset.worldObjectId), x: parseFloat(node.style.left), y: parseFloat(node.style.top) })))
      for (const object of positions) expect(HUB_AUDIT.placedObjects).toContainEqual(expect.objectContaining(object))
      expect(new Set(positions.map((object) => object.id)).size).toBe(positions.length)
      await page.screenshot({ path: testInfo.outputPath('hub-p3.png'), animations: 'disabled' })
      await page.getByRole('button', { name: '좌표 10, 8 살펴보기', exact: true }).click()
      await expect(page.getByRole('complementary', { name: '타일 살펴보기' })).toBeVisible()
      expect(jpgRequests).toEqual([])
      expect(unexpected).toEqual([])
    })
  })
}

for (const [name, inside, outside] of boundaries) {
  test(`${name} seam paints center and outer with shared pixel and opaque fallback layers`, async ({ page }, testInfo) => {
    await installHubWorld(page, inside)
    await enter(page)
    const rendered = await verifyRenderedTiles(page)
    expect(rendered.some(({ tile }) => { const [x, y] = tile.split(':').map(Number); return x >= 0 && x <= 23 && y >= 0 && y <= 15 })).toBe(true)
    await expect(page.locator(`.pixel-terrain__tile[data-tile="${outside.x}:${outside.y}"]`)).toBeInViewport()
    await expect(page.locator('.persistent-terrain')).toHaveCSS('overflow', 'visible')
    const forestColors = await page.locator('.terrain-forest').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).background))
    expect(new Set(forestColors).size).toBe(1)
    await page.screenshot({ path: testInfo.outputPath(`${name}-p3.png`), animations: 'disabled' })
  })
}

test('bridge planks remain visible, movement crosses BRIDGE and adjacent WATER stays blocked', async ({ page }, testInfo) => {
  const { moves, unexpected } = await installHubWorld(page, { x: 19, y: 13 })
  await enter(page)
  const bridge = page.locator('.terrain-bridge')
  const hubBridgeCount = await bridge.evaluateAll((nodes) => nodes.filter((node) => (
    parseFloat(node.style.top) === 13 * 48
      && parseFloat(node.style.left) >= 17 * 48
      && parseFloat(node.style.left) <= 22 * 48
  )).length)
  expect(hubBridgeCount).toBe(6)
  await expect(bridge.first()).toHaveCSS('background-image', /repeating-linear-gradient/)
  const deck = page.locator('.pixel-terrain__tile[data-tile="19:13"]')
  await expect(deck).toHaveAttribute('data-family', 'bridge')
  await expect(deck).toHaveAttribute('data-asset-key', /bridge\/edges-05\/corners-00/)
  await expect(deck).toHaveCSS('background-image', /transition-atlas.png.*terrain-atlas.png/)
  expect(HUB_AUDIT.rows[13].slice(17, 23)).toBe('BBBBBB')
  await page.screenshot({ path: testInfo.outputPath('bridge-p3.png'), animations: 'disabled' })
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(350)
  await page.keyboard.up('ArrowUp')
  expect(moves).toEqual([])
  await expect(page.locator('.pixel-character')).toHaveCSS('top', '624px')
  await page.keyboard.down('ArrowRight')
  await expect.poll(() => moves.length).toBeGreaterThan(0)
  await page.keyboard.up('ArrowRight')
  await expect.poll(() => page.evaluate(() => window.__edenPhase3cDiagnostics.activeMovementSchedulers)).toBe(0)
  expect(moves.every((move) => move.accepted && move.targetY === 13)).toBe(true)
  await expect(page.locator('.pixel-character')).toHaveCSS('left', `${moves.at(-1).targetX * 48}px`)
  expect(unexpected).toEqual([])
})
