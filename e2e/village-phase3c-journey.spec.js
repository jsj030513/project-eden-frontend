import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import {
  API_URL,
  FRONTEND_URL,
  createE2EFixture,
  provisionLocalFixture,
} from './village-e2e-fixture'

const fixture = createE2EFixture('phase3c-journey')
const mobileFixture = createE2EFixture('phase3c-mobile')
const evidenceDir = '/private/tmp/project-eden-phase3c'

test.beforeAll(async ({ request }) => {
  await mkdir(evidenceDir, { recursive: true })
  await provisionLocalFixture(request, fixture)
  await provisionLocalFixture(request, mobileFixture)
})

async function enter(page, account = fixture) {
  await page.goto(FRONTEND_URL)
  const enterButton = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enterButton.isVisible().catch(() => false)) await enterButton.click()
  const email = page.getByRole('textbox', { name: '이메일' })
  if (await email.isVisible().catch(() => false)) {
    await email.fill(account.email)
    await page.getByRole('textbox', { name: '비밀번호' }).fill(account.password)
    await page.getByRole('button', { name: '들어가기' }).click()
  }
  await expect(page.locator('.pixel-character')).toBeVisible()
  for (const name of ['천천히 둘러보기', '지금은 둘러볼게요']) {
    const button = page.getByRole('button', { name })
    if (await button.isVisible().catch(() => false)) await button.click()
  }
  return page.evaluate(() => sessionStorage.getItem('projectEdenAccessToken'))
}

async function api(page, token, path, method = 'GET', body) {
  return page.evaluate(async ({ apiUrl, tokenValue, pathValue, methodValue, bodyValue }) => {
    const response = await fetch(`${apiUrl}${pathValue}`, {
      method: methodValue,
      headers: {
        Authorization: `Bearer ${tokenValue}`,
        ...(bodyValue ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(bodyValue ? { body: JSON.stringify(bodyValue) } : {}),
    })
    return { status: response.status, body: await response.json() }
  }, { apiUrl: API_URL, tokenValue: token, pathValue: path, methodValue: method, bodyValue: body })
}

async function moveLine(page, token, toX, toY) {
  const temporarilyBlocked = new Set()
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const state = (await api(page, token, '/api/worlds/me/state')).body
    const start = state.playerPosition
    if (start.x === toX && start.y === toY) return
    const walkable = new Set(state.terrainTiles
      .filter((tile) => tile.walkable)
      .map((tile) => `${tile.x}:${tile.y}`))
    walkable.add(`${toX}:${toY}`)
    const occupied = new Set((state.npcPositions || []).map((npc) => `${npc.x}:${npc.y}`))
    const queue = [{ ...start, path: [] }]
    const seen = new Set([`${start.x}:${start.y}`])
    let path = null
    while (queue.length && !path) {
      const current = queue.shift()
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
        const next = { x: current.x + dx, y: current.y + dy }
        const key = `${next.x}:${next.y}`
        if (seen.has(key) || !walkable.has(key) || occupied.has(key)
          || temporarilyBlocked.has(key)) continue
        const nextPath = [...current.path, next]
        if (next.x === toX && next.y === toY) {
          path = nextPath
          break
        }
        seen.add(key)
        queue.push({ ...next, path: nextPath })
      }
    }
    expect(path, `No authoritative route to ${toX}:${toY}`).toBeTruthy()
    const next = path[0]
    const result = await api(page, token, '/api/worlds/me/move', 'POST', {
      targetX: next.x,
      targetY: next.y,
    })
    expect(result.status).toBe(200)
    if (!result.body.accepted) {
      temporarilyBlocked.add(`${next.x}:${next.y}`)
    }
  }
  throw new Error(`Authoritative route exceeded step budget for ${toX}:${toY}`)
}

async function reloadVillage(page) {
  await page.reload()
  const enterButton = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enterButton.isVisible().catch(() => false)) await enterButton.click()
  await expect(page.locator('.pixel-character')).toBeVisible()
}

test('visits deterministic regions, persists discovery and records visual evidence', async ({ page }) => {
  const token = await enter(page)
  await page.screenshot({ path: `${evidenceDir}/01-hub.png`, fullPage: true })

  await moveLine(page, token, 0, 7)
  await reloadVillage(page)
  await page.screenshot({ path: `${evidenceDir}/02-hub-boundary.png`, fullPage: true })
  expect((await api(page, token, '/api/worlds/me/move', 'POST', { targetX: -1, targetY: 7 })).body.newlyDiscovered).toBeTruthy()
  await reloadVillage(page)
  await page.screenshot({ path: `${evidenceDir}/03-meadow-entry.png`, fullPage: true })
  await page.screenshot({ path: `${evidenceDir}/04-meadow.png`, fullPage: true })

  await reloadVillage(page)
  expect((await api(page, token, '/api/worlds/me/chunks?centerChunkX=-1&centerChunkY=0&radius=0')).body
    .chunks[0].discoveredAt).toBeTruthy()
  await moveLine(page, token, 23, 7)
  await reloadVillage(page)
  expect((await api(page, token, '/api/worlds/me/move', 'POST', { targetX: 24, targetY: 7 })).body.newlyDiscovered).toBeTruthy()
  await reloadVillage(page)
  await page.screenshot({ path: `${evidenceDir}/05-forest-entry.png`, fullPage: true })
  await page.screenshot({ path: `${evidenceDir}/06-forest.png`, fullPage: true })

  await moveLine(page, token, 11, 15)
  await reloadVillage(page)
  expect((await api(page, token, '/api/worlds/me/move', 'POST', { targetX: 11, targetY: 16 })).body.newlyDiscovered).toBeTruthy()
  await reloadVillage(page)
  await page.screenshot({ path: `${evidenceDir}/07-pond-entry.png`, fullPage: true })
  await page.screenshot({ path: `${evidenceDir}/08-pond.png`, fullPage: true })
  await moveLine(page, token, 9, 16)
  const rejected = await api(page, token, '/api/worlds/me/move', 'POST', { targetX: 9, targetY: 17 })
  expect(rejected.body.accepted).toBeFalsy()
  await reloadVillage(page)
  await page.screenshot({ path: `${evidenceDir}/09-water-rejected.png`, fullPage: true })
  await moveLine(page, token, 11, 16)
  expect((await api(page, token, '/api/worlds/me/move', 'POST', { targetX: 11, targetY: 17 })).body.accepted).toBeTruthy()
  await moveLine(page, token, 11, 7)
  await reloadVillage(page)
  await page.screenshot({ path: `${evidenceDir}/10-hub-return.png`, fullPage: true })

  const started = Date.now()
  let steps = 0
  while (Date.now() - started < 30_000) {
    const state = (await api(page, token, '/api/worlds/me/state')).body
    const occupied = new Set(state.npcPositions.map((npc) => `${npc.x}:${npc.y}`))
    const target = state.terrainTiles.find((tile) => (
      tile.walkable
      && Math.abs(tile.x - state.playerPosition.x) + Math.abs(tile.y - state.playerPosition.y) === 1
      && !occupied.has(`${tile.x}:${tile.y}`)
    ))
    expect(target).toBeTruthy()
    const result = await api(page, token, '/api/worlds/me/move', 'POST', {
      targetX: target.x,
      targetY: target.y,
    })
    expect(result.body.accepted).toBeTruthy()
    steps += 1
    await page.waitForTimeout(120)
  }
  console.log(`PHASE3C_30_SECOND_EVIDENCE durationMs=${Date.now() - started} requests=${steps} maxInFlight=1`)
})

test('renders HUB and each outer region in mobile touch viewport', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  try {
    const token = await enter(page, mobileFixture)
    const stops = [
      ['11-mobile-hub.png', 11, 7],
      ['12-mobile-meadow.png', -1, 7],
      ['13-mobile-forest.png', 24, 7],
      ['14-mobile-pond.png', 11, 16],
    ]
    for (const [name, x, y] of stops) {
      await moveLine(page, token, x, y)
      await reloadVillage(page)
      await page.screenshot({ path: `${evidenceDir}/${name}`, fullPage: true })
    }
    await page.screenshot({ path: `${evidenceDir}/15-mobile-joystick.png`, fullPage: true })
    await moveLine(page, token, 0, 7)
    await reloadVillage(page)
    expect((await api(page, token, '/api/worlds/me/move', 'POST', { targetX: -1, targetY: 7 })).body.newlyDiscovered).toBeFalsy()
    await reloadVillage(page)
    await page.screenshot({ path: `${evidenceDir}/16-mobile-region-revisit.png`, fullPage: true })
  } finally {
    await context.close()
  }
})
