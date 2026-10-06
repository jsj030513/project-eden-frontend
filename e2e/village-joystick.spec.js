import { expect, test } from '@playwright/test'
import { configureResourceStableRendering } from './village-resource-stable-rendering'

async function enterMockVillage(page) {
  const moves = []
  const unexpected = []
  const world = {
    worldId: 1,
    mapBounds: { minX: 0, minY: 0, maxX: 23, maxY: 15 },
    playerPosition: { x: 11, y: 10 },
    terrainTiles: Array.from({ length: 384 }, (_, index) => ({
      x: index % 24, y: Math.floor(index / 24), terrainType: 'GRASS', walkable: true,
    })),
    placedObjects: [],
    npcPositions: [],
    availableInteractions: [{ type: 'INSPECT', x: 10, y: 10, available: true }],
  }
  const responses = {
    '/api/characters/me': { id: 1 }, '/api/worlds/me': { id: 1 },
    '/api/houses/me': { id: 1 }, '/api/inventories/me': { id: 1 },
    '/api/village/me': { id: 1 }, '/api/village/interpretation': {},
    '/api/village/changes': [], '/api/village/history': [], '/api/npcs/me': [],
    '/api/worlds/me/state': world,
    '/api/worlds/me/chunks': { world: { worldId: 1, minTileX: 0, minTileY: 0, maxTileX: 23, maxTileY: 15 }, chunks: [] },
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
    if (path === '/api/worlds/me/move' && request.method() === 'POST') {
      const { targetX, targetY } = request.postDataJSON()
      moves.push({ targetX, targetY })
      world.playerPosition = { x: targetX, y: targetY }
      return route.fulfill({ json: { accepted: true, currentX: targetX, currentY: targetY } })
    }
    if (Object.hasOwn(responses, path)) return route.fulfill({ json: responses[path] })
    unexpected.push(`${request.method()} ${path}`)
    return route.fulfill({ status: 500, json: { message: 'Unexpected test request' } })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '마을로 들어가기' }).click()
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', '384')
  return { moves, unexpected }
}

for (const viewport of [{ width: 375, height: 667 }, { width: 667, height: 375 }]) {
  test.describe(`joystick at ${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport, hasTouch: true })

    for (const input of ['mouse', 'touch']) {
      test(`${input} preserves tile input, captured dragging and movement`, async ({ page, context }) => {
        const { moves, unexpected } = await enterMockVillage(page)
        const activate = (locator) => input === 'touch' ? locator.tap() : locator.click()
        const tile = page.getByRole('button', { name: '좌표 10, 10 살펴보기', exact: true })
        const joystick = page.locator('.virtual-joystick')
        await expect(joystick).toBeVisible()
        expect(await tile.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2))
        })).toBe(true)
        await activate(tile)
        const inspect = page.getByRole('complementary', { name: '타일 살펴보기' })
        await expect(inspect).toBeVisible()
        await expect(joystick).not.toHaveClass(/is-active/)
        await activate(inspect.getByRole('button', { name: '사진 분석', exact: true }))
        await expect(page.locator('[data-capture-mode="vision"]')).toBeVisible()
        await activate(page.getByRole('button', { name: '마을로 돌아가기' }))
        await activate(page.getByRole('button', { name: '타일 정보 닫기' }))
        expect(moves).toHaveLength(0)

        await page.evaluate(() => {
          document.querySelector('.village-stage').addEventListener('pointerdown', (event) => {
            window.joystickPointer = { id: event.pointerId, type: event.pointerType }
          }, { once: true })
        })
        // Same start and touch protocol as the backend-backed village joystick tests.
        const start = { x: 72, y: viewport.height - 92 }
        const client = input === 'touch' ? await context.newCDPSession(page) : null
        const touchPoint = (point) => ({ ...point, id: 1, radiusX: 4, radiusY: 4, force: 1 })
        if (client) {
          await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint(start)] })
        } else {
          await page.mouse.move(start.x, start.y)
          await page.mouse.down()
        }
        await expect(joystick).toHaveClass(/is-active/)
        await expect(page.locator('.virtual-joystick__pad')).toHaveCSS('opacity', '0.72')
        expect(await joystick.evaluate((element) => element.hasPointerCapture(window.joystickPointer.id))).toBe(true)
        expect(await page.evaluate(() => window.joystickPointer.type)).toBe(input)

        // Capture must keep movement working outside the transparent overlay's rectangle.
        const end = { x: viewport.width - 20, y: start.y }
        if (client) {
          await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [touchPoint(end)] })
        } else {
          await page.mouse.move(end.x, end.y, { steps: 3 })
        }
        await expect.poll(() => moves.length).toBeGreaterThan(0)
        if (client) await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        else await page.mouse.up()
        await expect(joystick).not.toHaveClass(/is-active/)
        expect(await joystick.evaluate((element) => element.hasPointerCapture(window.joystickPointer.id))).toBe(false)
        await expect.poll(() => page.evaluate(() => window.__edenPhase3cDiagnostics.activeMovementSchedulers)).toBe(0)
        const finalMove = moves.at(-1)
        expect(finalMove.targetX).toBeGreaterThan(11)
        expect(finalMove.targetY).toBe(10)
        await expect(page.locator('.pixel-character')).toHaveCSS('left', `${finalMove.targetX * 48}px`)
        await activate(tile)
        await expect(inspect).toBeVisible()
        await expect(joystick).not.toHaveClass(/is-active/)
        expect(unexpected).toEqual([])
      })
    }
  })
}
