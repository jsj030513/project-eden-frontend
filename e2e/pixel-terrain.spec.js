import { expect, test } from '@playwright/test'
import { configureResourceStableRendering } from './village-resource-stable-rendering'

const families = ['grass', 'path', 'soil', 'water', 'rock-ground']

async function installWorld(page, { offsetX = 0, offsetY = 0 } = {}) {
  const moves = []
  const unexpected = []
  const world = {
    worldId: 1, mapBounds: { minX: 0, minY: 0, maxX: 23, maxY: 15 },
    playerPosition: { x: 11, y: 10 }, placedObjects: [], npcPositions: [],
    availableInteractions: [{ type: 'INSPECT', x: 10, y: 10, available: true }],
    terrainTiles: Array.from({ length: 384 }, (_, index) => {
      const x = index % 24
      const y = Math.floor(index / 24)
      let terrainType = 'GRASS'
      if (x >= 8 && x <= 10 && y >= 7 && y <= 9) terrainType = 'SOIL'
      if (x >= 12 && x <= 14 && y >= 8 && y <= 10) terrainType = 'WATER'
      if (x >= 12 && x <= 14 && y >= 11 && y <= 12) terrainType = 'ROCK'
      if (x === 11 || (y === 10 && x < 11)) terrainType = 'ROAD'
      // A diagonal notch and isolated path exercise both corner types.
      if (x === 14 && y === 8) terrainType = 'GRASS'
      if (x === 8 && y === 12) terrainType = 'ROAD'
      if (y === 5 && x >= 8 && x <= 13) terrainType = ['FLOWER_FIELD', 'FOREST', 'BRIDGE', 'BEACH', 'BUILDING', 'CLIFF'][x - 8]
      return { x, y, terrainType, walkable: !['WATER', 'ROCK', 'BUILDING', 'CLIFF'].includes(terrainType) }
    }),
  }
  world.mapBounds = { minX: offsetX, minY: offsetY, maxX: 23 + offsetX, maxY: 15 + offsetY }
  world.playerPosition = { x: 11 + offsetX, y: 10 + offsetY }
  world.terrainTiles = world.terrainTiles.map((tile) => ({ ...tile, x: tile.x + offsetX, y: tile.y + offsetY }))
  world.availableInteractions = world.availableInteractions.map((interaction) => ({ ...interaction, x: interaction.x + offsetX, y: interaction.y + offsetY }))
  const responses = {
    '/api/characters/me': { id: 1 }, '/api/worlds/me': { id: 1 },
    '/api/houses/me': { id: 1 }, '/api/inventories/me': { id: 1 },
    '/api/village/me': { id: 1 }, '/api/village/interpretation': {},
    '/api/village/changes': [], '/api/village/history': [], '/api/npcs/me': [],
    '/api/worlds/me/state': world,
    '/api/worlds/me/chunks': { world: { worldId: 1, minTileX: offsetX, minTileY: offsetY, maxTileX: 23 + offsetX, maxTileY: 15 + offsetY }, chunks: [] },
  }
  await configureResourceStableRendering(page)
  await page.addInitScript(() => {
    sessionStorage.setItem('projectEdenAccessToken', 'test.access.token')
    sessionStorage.setItem('projectEdenTutorialCompleted', 'true')
  })
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    if (path === '/api/worlds/me/move') {
      const { targetX, targetY } = request.postDataJSON()
      const accepted = world.terrainTiles.some((tile) => tile.x === targetX && tile.y === targetY && tile.walkable)
      if (accepted) world.playerPosition = { x: targetX, y: targetY }
      moves.push({ targetX, targetY, accepted })
      return route.fulfill({ json: { accepted, currentX: world.playerPosition.x, currentY: world.playerPosition.y } })
    }
    if (Object.hasOwn(responses, path)) return route.fulfill({ json: responses[path] })
    unexpected.push(`${request.method()} ${path}`)
    return route.fulfill({ status: 500, json: { message: 'Unexpected test request' } })
  })
  return { moves, unexpected }
}

async function enter(page) {
  await page.goto('/')
  await page.getByRole('button', { name: '마을로 들어가기' }).click()
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', '384')
}

async function expectPixelArt(page) {
  for (const family of families) {
    const tiles = page.locator(`.village-page .pixel-terrain__tile[data-family="${family}"]`)
    await expect(tiles.first()).toBeVisible()
    expect(await tiles.evaluateAll((nodes) => nodes.some((node) => {
      const rect = node.getBoundingClientRect()
      return rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
    }))).toBe(true)
    await expect(tiles.first()).toHaveCSS('image-rendering', 'pixelated')
    await expect(tiles.first()).toHaveCSS('opacity', '1')
    await expect(tiles.first()).toHaveCSS('pointer-events', 'none')
  }
}

for (const viewport of [{ width: 1280, height: 720 }, { width: 375, height: 667 }, { width: 667, height: 375 }]) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, deviceScaleFactor: 1 })
    test('renders all five pixel families and preserves INSPECT with before/after evidence', async ({ page }, testInfo) => {
      const { unexpected } = await installWorld(page)
      // P3 keeps the CSS missing-art fallback while removing runtime JPG use.
      await page.route('**/art/pixel/**', (route) => route.abort())
      await enter(page)
      await expect(page.locator('.village-page .pixel-terrain__tile')).toHaveCount(0)
      await page.screenshot({ path: testInfo.outputPath('fallback-no-atlas.png'), animations: 'disabled' })
      await page.unroute('**/art/pixel/**')
      await enter(page)
      await expectPixelArt(page)
      await expect(page.locator('.village-page .grass-tiles')).toHaveCSS('background-image', 'none')
      await page.screenshot({ path: testInfo.outputPath('after-p2.png'), animations: 'disabled' })
      const retained = await page.locator('.village-page .terrain-tile').evaluateAll((nodes) => nodes.filter((node) => node.classList.contains('terrain-future')).map((node) => [node.style.left, node.style.top]))
      const supported = await page.locator('.village-page .terrain-tile').evaluateAll((nodes) => nodes.filter((node) => ['flower_field', 'forest', 'bridge', 'beach', 'building', 'cliff'].some((type) => node.classList.contains(`terrain-${type}`))).map((node) => [node.style.left, node.style.top]))
      const overlayCoordinates = await page.locator('.village-page .pixel-terrain__tile').evaluateAll((nodes) => nodes.map((node) => [node.style.left, node.style.top]))
      for (const coordinate of retained) expect(overlayCoordinates).not.toContainEqual(coordinate)
      for (const coordinate of supported) expect(overlayCoordinates).toContainEqual(coordinate)
      await page.getByRole('button', { name: '좌표 10, 10 살펴보기', exact: true }).click()
      await expect(page.getByRole('complementary', { name: '타일 살펴보기' })).toBeVisible()
      await expect(page.getByRole('button', { name: '사진 분석', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '타일 정보 닫기' }).click()
      expect(unexpected).toEqual([])
    })
  })
}

test('missing transition PNG falls back to opaque family bases', async ({ page }) => {
  await installWorld(page)
  await page.route('**/transition-atlas.png', (route) => route.abort())
  await enter(page)
  await expectPixelArt(page)
  await expect(page.locator('.pixel-terrain__tile[data-asset-mode="exact"]')).toHaveCount(0)
  await expect(page.locator('.pixel-terrain__tile[data-family="water"]').first()).toHaveCSS('background-image', /terrain-atlas.png/)
})

test('missing base PNG never exposes transition-only or blank replacement tiles', async ({ page }) => {
  await installWorld(page)
  await page.route('**/terrain-atlas.png', (route) => route.abort())
  await enter(page)
  await expect(page.locator('.village-page .pixel-terrain__tile')).toHaveCount(0)
  for (const type of ['grass', 'road', 'soil', 'water', 'rock']) {
    await expect(page.locator(`.village-page .terrain-${type}`).first()).toBeVisible()
  }
})

test('pixel art preserves authoritative collision, movement and camera tracking', async ({ page }) => {
  const { moves, unexpected } = await installWorld(page)
  await enter(page)
  await expectPixelArt(page)
  const player = page.locator('.village-page .pixel-character')
  await expect(player).toHaveCSS('left', '528px')
  await page.keyboard.down('ArrowRight') // (12,10) WATER is non-walkable.
  await page.waitForTimeout(350) // Hold across multiple movement scheduler ticks.
  await page.keyboard.up('ArrowRight')
  expect(moves).toEqual([])
  await expect(player).toHaveCSS('left', '528px')
  await page.keyboard.down('ArrowLeft')
  await expect.poll(() => moves.length).toBeGreaterThan(0)
  await page.keyboard.up('ArrowLeft')
  await expect.poll(() => page.evaluate(() => window.__edenPhase3cDiagnostics.activeMovementSchedulers)).toBe(0)
  const final = moves.at(-1)
  expect(final.accepted).toBe(true)
  await expect(player).toHaveCSS('left', `${final.targetX * 48}px`)
  const cameraX = await page.locator('.village-page .village-world').evaluate((node) => Number(node.style.getPropertyValue('--character-x')))
  expect(cameraX).toBe(final.targetX * 48)
  expect(unexpected).toEqual([])
})

test('negative outer-chunk coordinates paint outside the local layer origin without clipping', async ({ page }, testInfo) => {
  await installWorld(page, { offsetX: -16, offsetY: -16 })
  await enter(page)
  await expectPixelArt(page)
  await expect(page.locator('.village-page .pixel-terrain')).toHaveCSS('overflow', 'visible')
  const water = page.locator('.village-page .pixel-terrain__tile[data-tile="-4:-7"]')
  await expect(water).toHaveCSS('left', '-192px')
  await expect(water).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('negative-world.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '좌표 -6, -6 살펴보기', exact: true }).click()
  await expect(page.getByRole('complementary', { name: '타일 살펴보기' })).toBeVisible()
})
