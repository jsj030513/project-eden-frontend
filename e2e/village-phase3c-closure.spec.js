import { mkdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'
import {
  API_URL,
  FRONTEND_URL,
  createE2EFixture,
  provisionLocalFixture,
} from './village-e2e-fixture'

const reloginFixture = createE2EFixture('phase3c-relogin')
const mobileFixture = createE2EFixture('phase3c-mobile-first-reveal')
const stabilityFixture = createE2EFixture('phase3c-runtime-stability')
const evidenceDir = '/private/tmp/project-eden-phase3c-closure'

test.beforeAll(async ({ request }) => {
  await mkdir(evidenceDir, { recursive: true })
  await provisionLocalFixture(request, reloginFixture)
  await provisionLocalFixture(request, mobileFixture)
  await provisionLocalFixture(request, stabilityFixture)
})

async function enter(page, account) {
  await page.goto(FRONTEND_URL)
  const enterButton = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enterButton.isVisible().catch(() => false)) await enterButton.click()
  const email = page.getByRole('textbox', { name: '이메일' })
  if (await email.isVisible().catch(() => false)) {
    await email.fill(account.email)
    await page.getByRole('textbox', { name: '비밀번호' }).fill(account.password)
    await page.getByRole('button', { name: '들어가기' }).click()
  }
  await expect(page.locator('.village-stage')).toBeVisible()
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
  const state = (await api(page, token, '/api/worlds/me/state')).body
  let { x, y } = state.playerPosition
  const stepTo = async (targetX, targetY) => {
    const result = await api(page, token, '/api/worlds/me/move', 'POST', { targetX, targetY })
    expect(result.status).toBe(200)
    expect(result.body.accepted).toBeTruthy()
    x = result.body.currentX
    y = result.body.currentY
  }
  if (y !== 7) {
    while (x !== 11) await stepTo(x + Math.sign(11 - x), y)
    while (y !== 7) await stepTo(x, y + Math.sign(7 - y))
  }
  while (x !== toX) await stepTo(x + Math.sign(toX - x), y)
  while (y !== toY) await stepTo(x, y + Math.sign(toY - y))
}

async function reloadVillage(page) {
  await page.reload()
  const enterButton = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enterButton.isVisible().catch(() => false)) await enterButton.click()
  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(page.locator('.pixel-character')).toBeVisible()
}

async function forestChunk(page, token) {
  const response = await api(page, token, '/api/worlds/me/chunks?centerChunkX=3&centerChunkY=0&radius=0')
  expect(response.status).toBe(200)
  return response.body.chunks[0]
}

async function touchDirection(context, page, horizontalDelta) {
  const moveResponse = page.waitForResponse((response) => (
    response.url().endsWith('/api/worlds/me/move') && response.request().method() === 'POST'
  ))
  const client = await context.newCDPSession(page)
  const start = { x: 74, y: 744 }
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ ...start, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
  })
  await page.waitForTimeout(80)
  await client.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: start.x + horizontalDelta, y: start.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
  })
  const response = await moveResponse
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  return { status: response.status(), body: await response.json() }
}

test('restores discovery from the backend after logout and does not reveal it again', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
  const page = await context.newPage()
  try {
    let token = await enter(page, reloginFixture)
    await moveLine(page, token, 23, 7)
    await reloadVillage(page)

    const firstBody = (await touchDirection(context, page, 48)).body
    expect(firstBody.newlyDiscovered).toBe(true)
    await expect(page.locator('.region-discovery-banner')).toContainText('숲')
    const firstDiscoveredAt = (await forestChunk(page, token)).discoveredAt
    expect(firstDiscoveredAt).toBeTruthy()

    await page.evaluate(() => window.dispatchEvent(new CustomEvent('project-eden:unauthorized')))
    await expect(page.getByRole('textbox', { name: '이메일' })).toBeVisible()
    expect(await page.evaluate(() => sessionStorage.getItem('projectEdenAccessToken'))).toBeNull()
    const afterLogout = await page.evaluate(() => window.__edenPhase3cDiagnostics)
    expect(afterLogout.activeMovementSchedulers).toBe(0)
    expect(afterLogout.activeRafLoops).toBe(0)
    expect(afterLogout.activeChunkRequests).toBe(0)
    expect(afterLogout.activeRevealTimers).toBe(0)
    expect(afterLogout.keyboardHandlers).toBe(0)

    token = await enter(page, reloginFixture)
    const restored = await forestChunk(page, token)
    expect(restored.discoveredAt).toBe(firstDiscoveredAt)
    await moveLine(page, token, 23, 7)
    await reloadVillage(page)
    const repeatBody = (await touchDirection(context, page, 48)).body
    expect(repeatBody.newlyDiscovered).toBe(false)
    await expect(page.locator('.region-discovery-banner')).toHaveCount(0)
    expect((await forestChunk(page, token)).discoveredAt).toBe(firstDiscoveredAt)
  } finally {
    await context.close()
  }
})

test('captures the actual first mobile reveal and repeat-visit evidence', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()
  try {
    const token = await enter(page, mobileFixture)
    await moveLine(page, token, 0, 7)
    await reloadVillage(page)
    await page.screenshot({ path: `${evidenceDir}/mobile-before-discovery.png` })

    const firstMove = await touchDirection(context, page, -48)
    expect(firstMove.status).toBe(200)
    expect(firstMove.body.newlyDiscovered).toBe(true)
    await expect(page.locator('.region-discovery-banner')).toContainText('초원')
    await expect(page.locator('.pixel-character')).toBeVisible()
    await expect(page.locator('.terrain-tile').first()).toBeVisible()
    await page.screenshot({ path: `${evidenceDir}/mobile-first-reveal.png` })
    await expect(page.locator('.region-discovery-banner')).toBeHidden({ timeout: 5_000 })
    await page.screenshot({ path: `${evidenceDir}/mobile-after-reveal.png` })

    await moveLine(page, token, 0, 7)
    await reloadVillage(page)
    const repeatMove = await touchDirection(context, page, -48)
    expect(repeatMove.body.newlyDiscovered).toBe(false)
    await expect(page.locator('.region-discovery-banner')).toHaveCount(0)
    await page.screenshot({ path: `${evidenceDir}/mobile-repeat-visit-no-reveal.png` })
  } finally {
    await context.close()
  }
})

test('keeps one scheduler, RAF and key handler during a 30-second held movement', async ({ page }) => {
  const token = await enter(page, stabilityFixture)
  await moveLine(page, token, -8, 7)
  await reloadVillage(page)
  await page.evaluate(() => {
    const current = window.__edenPhase3cDiagnostics
    for (const key of Object.keys(current)) current[key] = 0
    current.keyboardHandlers = 1
    current.maxKeyboardHandlers = 1
  })

  let movementRequests = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/worlds/me/move') && request.method() === 'POST') movementRequests += 1
  })
  await page.locator('.village-stage').focus()
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(30_000)
  await page.keyboard.up('ArrowRight')
  await page.waitForTimeout(1_000)

  const diagnostics = await page.evaluate(() => window.__edenPhase3cDiagnostics)
  expect(movementRequests).toBeGreaterThan(0)
  expect(diagnostics.movementSchedulerStarts).toBe(1)
  expect(diagnostics.maxActiveMovementSchedulers).toBe(1)
  expect(diagnostics.activeMovementSchedulers).toBe(0)
  expect(diagnostics.maxActiveRafLoops).toBeLessThanOrEqual(1)
  expect(diagnostics.activeRafLoops).toBe(0)
  expect(diagnostics.rafStarts).toBe(diagnostics.rafStops)
  expect(diagnostics.maxActiveChunkRequests).toBeLessThanOrEqual(1)
  expect(diagnostics.activeChunkRequests).toBe(0)
  expect(diagnostics.activeRevealTimers).toBe(0)
  expect(diagnostics.keyboardHandlers).toBe(1)
  expect(diagnostics.maxKeyboardHandlers).toBe(1)

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('project-eden:unauthorized')))
  await expect(page.getByRole('textbox', { name: '이메일' })).toBeVisible()
  const cleaned = await page.evaluate(() => window.__edenPhase3cDiagnostics)
  expect(cleaned.activeMovementSchedulers).toBe(0)
  expect(cleaned.activeRafLoops).toBe(0)
  expect(cleaned.activeChunkRequests).toBe(0)
  expect(cleaned.activeRevealTimers).toBe(0)
  expect(cleaned.keyboardHandlers).toBe(0)

  await enter(page, stabilityFixture)
  const relogged = await page.evaluate(() => window.__edenPhase3cDiagnostics)
  expect(relogged.keyboardHandlers).toBe(1)
  expect(relogged.maxKeyboardHandlers).toBe(1)
  console.log(`PHASE3C_RUNTIME durationMs=30000 movementRequests=${movementRequests} diagnostics=${JSON.stringify(diagnostics)}`)
})
