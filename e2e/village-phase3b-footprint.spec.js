import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import {
  API_URL,
  FRONTEND_URL,
  createE2EFixture,
  provisionLocalFixture,
} from './village-e2e-fixture'
import {
  HUB_BRIDGE,
  COMMUNITY_HOUSE,
  bridgeVisualStyle,
  communityHouseVisualStyle,
} from '../src/components/village/worldHubLayout'

const fixture = createE2EFixture('village-phase3b-footprint')
const evidenceDirectory = '/private/tmp/project-eden-phase3b-closure'

test.beforeAll(async ({ request }) => {
  await mkdir(evidenceDirectory, { recursive: true })
  await provisionLocalFixture(request, fixture)
})

async function dismissOnboarding(page) {
  for (const name of ['천천히 둘러보기', '지금은 둘러볼게요']) {
    const button = page.getByRole('button', { name })
    if (await button.isVisible().catch(() => false)) await button.click()
  }
}

async function enterVillage(page) {
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
  await dismissOnboarding(page)
  return page.evaluate(() => window.sessionStorage.getItem('projectEdenAccessToken'))
}

async function syncVillage(page) {
  await page.reload()
  const enter = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enter.isVisible().catch(() => false)) await enter.click()
  await expect(page.locator('.persistent-terrain')).toHaveAttribute('data-total-count', /^(384|448|512|576|640|704|768|832|896|960|1024|1088|1152|1216|1280)$/)
  await dismissOnboarding(page)
}

async function api(page, token, path, { method = 'GET', body } = {}) {
  return page.evaluate(async ({ apiUrl, authToken, requestPath, requestMethod, requestBody }) => {
    const response = await fetch(`${apiUrl}${requestPath}`, {
      method: requestMethod,
      headers: {
        Authorization: `Bearer ${authToken}`,
        ...(requestBody == null ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(requestBody == null ? {} : { body: JSON.stringify(requestBody) }),
    })
    return { status: response.status, body: await response.json() }
  }, {
    apiUrl: API_URL,
    authToken: token,
    requestPath: path,
    requestMethod: method,
    requestBody: body,
  })
}

async function state(page, token) {
  const response = await api(page, token, '/api/worlds/me/state')
  expect(response.status).toBe(200)
  return response.body
}

function pathTo(world, target) {
  const key = (x, y) => `${x}:${y}`
  const walkable = new Set(world.terrainTiles.filter((tile) => tile.walkable).map((tile) => key(tile.x, tile.y)))
  const queue = [{ ...world.playerPosition, path: [] }]
  const seen = new Set([key(world.playerPosition.x, world.playerPosition.y)])
  while (queue.length) {
    const current = queue.shift()
    if (current.x === target.x && current.y === target.y) return current.path
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const next = { x: current.x + dx, y: current.y + dy }
      const nextKey = key(next.x, next.y)
      if (seen.has(nextKey) || !walkable.has(nextKey)) continue
      seen.add(nextKey)
      queue.push({ ...next, path: [...current.path, next] })
    }
  }
  throw new Error(`No walkable path to ${target.x},${target.y}`)
}

async function route(page, token, target) {
  const before = await state(page, token)
  for (const step of pathTo(before, target)) {
    const moved = await api(page, token, '/api/worlds/me/move', {
      method: 'POST',
      body: { targetX: step.x, targetY: step.y },
    })
    expect(moved.body.accepted).toBe(true)
  }
  expect((await state(page, token)).playerPosition).toEqual(target)
}

async function screenshot(page, name) {
  await page.screenshot({ path: `${evidenceDirectory}/${name}.png`, fullPage: true })
}

test('uses one explicit bridge and community-house footprint contract', () => {
  expect(HUB_BRIDGE).toEqual({ minX: 17, maxX: 22, y: 13, entryX: 16, exitX: 23 })
  expect(bridgeVisualStyle()).toEqual({
    left: '816px',
    top: '624px',
    width: '288px',
    height: '48px',
  })
  expect(COMMUNITY_HOUSE).toEqual({
    minX: 13, maxX: 15, minY: 3, maxY: 5,
    anchorX: 14, anchorY: 6, approachX: 14, approachY: 7,
  })
  expect(communityHouseVisualStyle()).toEqual({
    '--community-house-width': '144px',
    '--community-house-height': '144px',
    '--community-house-offset-x': '48px',
  })
})

test('crosses the persisted bridge and rejects adjacent water', async ({ page }) => {
  const token = await enterVillage(page)
  const initial = await state(page, token)
  const bridgeTiles = initial.terrainTiles.filter((tile) => (
    tile.y === HUB_BRIDGE.y && tile.x >= HUB_BRIDGE.minX && tile.x <= HUB_BRIDGE.maxX
  ))
  expect(bridgeTiles).toHaveLength(6)
  expect(bridgeTiles.every((tile) => tile.terrainType === 'BRIDGE' && tile.walkable)).toBe(true)

  await route(page, token, { x: HUB_BRIDGE.entryX, y: HUB_BRIDGE.y })
  await syncVillage(page)
  await screenshot(page, '01-bridge-full')
  await screenshot(page, '02-bridge-entry')

  await route(page, token, { x: 19, y: HUB_BRIDGE.y })
  await syncVillage(page)
  await screenshot(page, '03-bridge-center')

  await route(page, token, { x: HUB_BRIDGE.exitX, y: HUB_BRIDGE.y })
  await syncVillage(page)
  await screenshot(page, '04-bridge-crossed')

  await route(page, token, { x: 18, y: HUB_BRIDGE.y })
  const rejected = await api(page, token, '/api/worlds/me/move', {
    method: 'POST',
    body: { targetX: 18, targetY: HUB_BRIDGE.y - 1 },
  })
  expect(rejected.body).toMatchObject({
    accepted: false,
    currentX: 18,
    currentY: HUB_BRIDGE.y,
    terrainType: 'WATER',
    reason: 'TERRAIN_BLOCKED',
  })
  await syncVillage(page)
  await screenshot(page, '05-adjacent-water-rejected')
})

test('aligns the community-house artwork, front door, interaction, and collision', async ({ page }) => {
  const token = await enterVillage(page)
  await route(page, token, {
    x: COMMUNITY_HOUSE.approachX,
    y: COMMUNITY_HOUSE.approachY,
  })
  await syncVillage(page)

  const house = page.locator('.asset-community_house')
  await expect(house).toBeVisible()
  await expect(page.getByRole('button', { name: '마을 회관 · 둘러보기' })).toBeVisible()
  const visual = await house.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const world = document.querySelector('.village-world').getBoundingClientRect()
    const worldStyle = getComputedStyle(document.querySelector('.village-world'))
    const originX = Number.parseFloat(worldStyle.getPropertyValue('--world-origin-x')) || 0
    const originY = Number.parseFloat(worldStyle.getPropertyValue('--world-origin-y')) || 0
    return {
      left: Math.round((rect.left - world.left) / 1.1 - originX),
      top: Math.round((rect.top - world.top) / 1.1 - originY),
      width: Math.round(rect.width / 1.1),
      bodyHeight: Math.round(rect.height / 1.1),
    }
  })
  expect(visual).toEqual({ left: 624, top: 216, width: 144, bodyHeight: 72 })
  await screenshot(page, '06-community-house-full')
  await screenshot(page, '07-community-house-door')

  await page.getByRole('button', { name: '마을 회관 · 둘러보기' }).click()
  await expect(page.getByRole('region', { name: '커뮤니티 하우스 살펴보기' })).toBeVisible()
  await screenshot(page, '08-community-house-summary')
  await page.keyboard.press('Escape')

  await route(page, token, { x: 13, y: 6 })
  const blocked = await api(page, token, '/api/worlds/me/move', {
    method: 'POST',
    body: { targetX: 13, targetY: 5 },
  })
  expect(blocked.body).toMatchObject({
    accepted: false,
    currentX: 13,
    currentY: 6,
    terrainType: 'BUILDING',
    reason: 'TERRAIN_BLOCKED',
  })
  expect((await state(page, token)).availableInteractions)
    .not.toContainEqual(expect.objectContaining({ targetAssetType: 'COMMUNITY_HOUSE', type: 'INTERACT' }))
  await syncVillage(page)
  await screenshot(page, '09-community-house-body-collision')
})

test('keeps both reconciled landmarks visible in a mobile camera', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })
  try {
    const page = await context.newPage()
    const token = await enterVillage(page)
    await route(page, token, { x: HUB_BRIDGE.entryX, y: HUB_BRIDGE.y })
    await syncVillage(page)
    await expect(page.locator('.visual-bridge')).toBeVisible()
    await screenshot(page, '10-mobile-bridge')
    await route(page, token, {
      x: COMMUNITY_HOUSE.approachX,
      y: COMMUNITY_HOUSE.approachY,
    })
    await syncVillage(page)
    await expect(page.locator('.asset-community_house')).toBeVisible()
    await screenshot(page, '11-mobile-community-house')
  } finally {
    await context.close()
  }
})
