import { expect, test } from '@playwright/test'
import { installP51World } from './p51-terrain-fixture'
import { installP41World } from './p41-terrain-fixture'
import { installHubWorld } from './hub-pixel-fixture'
import { resolveWorldTiles } from '../src/components/village/worldTileResolver'
import { lookupPixelTile, pixelTileStyle } from '../src/components/village/pixelTileManifest'

const output = '/tmp/eden-p51-verification'
const tileAt = (page, x, y) => page.locator(`.pixel-terrain__tile[data-tile="${x}:${y}"]`)
async function enter(page) {
  await page.goto('/')
  await page.getByRole('button', { name: '마을로 들어가기' }).click()
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', '1280')
}
async function verify(page, fixture) {
  const expected = Object.fromEntries(resolveWorldTiles(fixture.state.terrainTiles).map((tile) => {
    const visual = lookupPixelTile(tile)
    return [`${tile.x}:${tile.y}`, { key: visual.key, position: pixelTileStyle(visual).backgroundPosition }]
  }))
  await expect.poll(async () => page.locator('.pixel-terrain__tile').evaluateAll((nodes, expected) =>
    nodes.length > 0 && nodes.every((node) => node.dataset.assetKey === expected[node.dataset.tile]?.key
      && node.style.backgroundPosition === expected[node.dataset.tile]?.position), expected)).toBe(true)
  await expect(page.locator('.pixel-terrain__tile').first()).toHaveCSS('image-rendering', 'pixelated')
  await expect(page.locator('.pixel-terrain')).toHaveCSS('pointer-events', 'none')
  expect(fixture.unexpected).toEqual([])
}

for (const name of [
  'grass-shore', 'forest-bank', 'sand-shore', 'rock-coast', 'cliff-rock-coast', 'earth-bank', 'soil-bank',
  'mixed-grass-sand-corner', 'mixed-sand-rock-corner', 'mixed-grass-rock-corner',
]) {
  test(`Chromium ${name} renders material layers over opaque WATER at the negative chunk seam`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    const fixture = await installP51World(page, name)
    await enter(page)
    await verify(page, fixture)
    for (const x of [-1, 0]) {
      await expect(tileAt(page, x, -2)).toHaveAttribute('data-family', 'water')
      await expect(tileAt(page, x, -2)).toBeInViewport()
      await expect(tileAt(page, x, -2)).toHaveCSS('background-image', /terrain-atlas.png/)
    }
    await expect(tileAt(page, -2, -2)).toBeInViewport()
    await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' })
    if (name.startsWith('mixed-')) {
      const target = tileAt(page, -2, -2)
      await target.screenshot({ path: `${output}/${name}-detail.png`, animations: 'disabled' })
      const before = await target.getAttribute('style')
      fixture.state.terrainTiles.reverse()
      await enter(page)
      await verify(page, fixture)
      expect(await target.getAttribute('style')).toBe(before)
    }
  })
}

for (const [name, x, y, mask] of [
  ['bridge-water', 8, 12, '05'], ['bridge-vertical', 19, 3, '0a'], ['bridge-cross', -4, 13, '00'],
]) {
  test(`Chromium ${name} retains existing deck edges and open entries`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    const fixture = await installP41World(page, { x, y })
    await enter(page)
    await verify(page, fixture)
    await expect(tileAt(page, x, y)).toHaveAttribute('data-asset-key', new RegExp(`bridge/edges-${mask}/corners-00`))
    await expect(tileAt(page, x, y)).toBeInViewport()
    await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' })
  })
}

test('Chromium real fixture pond uses only actual grass, forest, road, rock and bridge neighbors', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const fixture = await installHubWorld(page, { x: 19, y: 13 })
  await enter(page)
  await verify(page, fixture)
  await expect(page.locator('.pixel-terrain__tile[data-family="water"]').first()).toBeVisible()
  await page.screenshot({ path: `${output}/pond-real-fixture.png`, animations: 'disabled' })
})

for (const [name, width, height] of [['mobile-portrait', 375, 667], ['mobile-landscape', 667, 375]]) {
  test(`Chromium ${name} keeps pixel sampling and mixed bank ownership`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    const fixture = await installP51World(page, 'mixed-grass-sand-corner', { x: -3, y: 0 })
    await enter(page)
    await verify(page, fixture)
    await expect(tileAt(page, -2, -2)).toBeInViewport()
    await page.screenshot({ path: `${output}/${name}.png`, animations: 'disabled' })
  })
}

for (const failure of ['missing transitions', 'invalid transition size', 'missing base', 'invalid base size']) {
  test(`P5 WATER ${failure} retains the existing renderer fallback`, async ({ page }) => {
    const fixture = await installP51World(page, 'sand-shore')
    const base = failure.includes('base')
    const name = base ? 'terrain-atlas.png' : 'transition-atlas.png'
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQ0AAAAASUVORK5CYII=', 'base64')
    await page.route(`**/${name}`, (route) => failure.startsWith('missing') ? route.abort() : route.fulfill({ contentType: 'image/png', body: png }))
    await enter(page)
    if (base) {
      await expect(page.locator('.pixel-terrain__tile')).toHaveCount(0)
      await expect(page.locator('.terrain-water').first()).toBeVisible()
    } else {
      await expect(tileAt(page, -2, -2)).toHaveAttribute('data-asset-mode', 'base')
      await expect(tileAt(page, -2, -2)).toHaveCSS('background-image', /terrain-atlas.png/)
      await expect(tileAt(page, -2, -2)).not.toHaveCSS('background-image', /transition-atlas.png/)
    }
    expect(fixture.unexpected).toEqual([])
  })
}
