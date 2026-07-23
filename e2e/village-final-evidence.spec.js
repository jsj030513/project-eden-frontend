import { expect, test } from '@playwright/test'
import {
  API_URL,
  FRONTEND_URL,
  createE2EFixture,
  provisionLocalFixture,
} from './village-e2e-fixture'

const TILE_SIZE = 48
const fixture = createE2EFixture('village-final')

test.describe.configure({ mode: 'serial' })
test.beforeAll(async ({ request }) => provisionLocalFixture(request, fixture))

function evidence(name, value) {
  console.log(`EVIDENCE ${name} ${JSON.stringify(value)}`)
}

async function attachEvidence(testInfo, name, value) {
  await testInfo.attach(name, {
    body: Buffer.from(JSON.stringify(value, null, 2)),
    contentType: 'application/json',
  })
  evidence(name, value)
}

async function dismissOnboarding(page) {
  const explore = page.getByRole('button', { name: '천천히 둘러보기' })
  if (await explore.isVisible().catch(() => false)) await explore.click()

  const later = page.getByRole('button', { name: '지금은 둘러볼게요' })
  if (await later.isVisible().catch(() => false)) await later.click()
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

  await expect(page.locator('.terrain-tile')).toHaveCount(384)
  await dismissOnboarding(page)
  await expect(page.locator('.pixel-character')).toBeVisible()

  const token = await page.evaluate(() => window.sessionStorage.getItem('projectEdenAccessToken'))
  expect(token).toBeTruthy()
  return token
}

async function syncVillage(page) {
  await page.reload()
  const enter = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enter.isVisible().catch(() => false)) await enter.click()
  await expect(page.locator('.terrain-tile')).toHaveCount(384)
  await dismissOnboarding(page)
  await expect(page.locator('.pixel-character')).toBeVisible()
}

async function browserApi(page, token, path, { method = 'GET', body } = {}) {
  return page.evaluate(async ({ apiUrl, authToken, requestPath, requestMethod, requestBody }) => {
    const response = await fetch(`${apiUrl}${requestPath}`, {
      method: requestMethod,
      headers: {
        Authorization: `Bearer ${authToken}`,
        ...(requestBody === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(requestBody === undefined ? {} : { body: JSON.stringify(requestBody) }),
    })
    const text = await response.text()
    let responseBody = text
    try {
      responseBody = text ? JSON.parse(text) : null
    } catch {
      // Preserve the actual non-JSON response.
    }
    return { status: response.status, body: responseBody }
  }, {
    apiUrl: API_URL,
    authToken: token,
    requestPath: path,
    requestMethod: method,
    requestBody: body,
  })
}

async function state(page, token) {
  const response = await browserApi(page, token, '/api/worlds/me/state')
  expect(response.status).toBe(200)
  return response.body
}

function key(x, y) {
  return `${x}:${y}`
}

function pathTo(worldState, target) {
  const start = worldState.playerPosition
  const walkable = new Set(worldState.terrainTiles.filter((tile) => tile.walkable).map((tile) => key(tile.x, tile.y)))
  const queue = [{ ...start, path: [] }]
  const seen = new Set([key(start.x, start.y)])
  const directions = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ]

  while (queue.length) {
    const current = queue.shift()
    if (current.x === target.x && current.y === target.y) return current.path
    for (const direction of directions) {
      const next = { x: current.x + direction.dx, y: current.y + direction.dy }
      const nextKey = key(next.x, next.y)
      if (seen.has(nextKey) || !walkable.has(nextKey)) continue
      seen.add(nextKey)
      queue.push({ ...next, path: [...current.path, next] })
    }
  }
  throw new Error(`No walkable path to ${target.x},${target.y}`)
}

async function routePlayer(page, token, target) {
  const before = await state(page, token)
  for (const step of pathTo(before, target)) {
    const response = await browserApi(page, token, '/api/worlds/me/move', {
      method: 'POST',
      body: { targetX: step.x, targetY: step.y },
    })
    expect(response.status).toBe(200)
    expect(response.body.accepted).toBe(true)
  }
  const after = await state(page, token)
  expect(after.playerPosition).toEqual(target)
  return after
}

async function screenTile(page) {
  return page.locator('.pixel-character').evaluate((element, tileSize) => ({
    x: Math.round(Number.parseFloat(element.style.left) / tileSize),
    y: Math.round(Number.parseFloat(element.style.top) / tileSize),
  }), TILE_SIZE)
}

function withinViewport(box, viewport) {
  return Boolean(box)
    && box.x >= 0
    && box.y >= 0
    && box.x + box.width <= viewport.width
    && box.y + box.height <= viewport.height
}

function overlaps(a, b) {
  if (!a || !b) return false
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

test('server rejects an invalid move and preserves the approved position', async ({ page }, testInfo) => {
  const token = await enterVillage(page)
  const before = await state(page, token)
  const beforeScreen = await screenTile(page)
  const requestBody = {
    targetX: before.playerPosition.x + 3,
    targetY: before.playerPosition.y,
  }

  const rejected = await browserApi(page, token, '/api/worlds/me/move', {
    method: 'POST',
    body: requestBody,
  })
  const after = await state(page, token)
  const afterScreen = await screenTile(page)

  expect(rejected.status).toBe(200)
  expect(rejected.body).toMatchObject({
    accepted: false,
    currentX: before.playerPosition.x,
    currentY: before.playerPosition.y,
    reason: 'MOVE_TOO_FAR',
  })
  expect(after.playerPosition).toEqual(before.playerPosition)
  expect(afterScreen).toEqual(beforeScreen)

  await attachEvidence(testInfo, 'server-reject', {
    endpoint: '/api/worlds/me/move',
    method: 'POST',
    requestBody,
    status: rejected.status,
    responseBody: rejected.body,
    beforeServerPosition: before.playerPosition,
    afterServerPosition: after.playerPosition,
    beforeScreenPosition: beforeScreen,
    afterScreenPosition: afterScreen,
  })
})

test('a real ten-second key hold drives one movement scheduler', async ({ page }, testInfo) => {
  const token = await enterVillage(page)
  await routePlayer(page, token, { x: 0, y: 7 })
  await syncVillage(page)

  const start = await state(page, token)
  const consoleErrors = []
  const pageErrors = []
  const moveRequests = []
  let inFlight = 0
  let maxInFlight = 0

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => {
    if (!request.url().endsWith('/api/worlds/me/move') || request.method() !== 'POST') return
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    moveRequests.push({ method: request.method(), url: request.url(), body: request.postDataJSON() })
  })
  const releaseRequest = (request) => {
    if (request.url().endsWith('/api/worlds/me/move') && request.method() === 'POST') inFlight = Math.max(0, inFlight - 1)
  }
  page.on('requestfinished', releaseRequest)
  page.on('requestfailed', releaseRequest)

  const startedAt = Date.now()
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(10_200)
  await page.keyboard.up('ArrowRight')
  const durationMs = Date.now() - startedAt
  await page.waitForTimeout(800)

  const end = await state(page, token)
  const endScreen = await screenTile(page)
  expect(durationMs).toBeGreaterThanOrEqual(10_000)
  expect(moveRequests.length).toBeGreaterThan(1)
  expect(maxInFlight).toBe(1)
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])
  expect(endScreen).toEqual(end.playerPosition)
  expect(end.playerPosition.x).toBeGreaterThan(start.playerPosition.x)

  await attachEvidence(testInfo, 'keyboard-hold', {
    durationMs,
    requestCount: moveRequests.length,
    maxInFlight,
    startServerPosition: start.playerPosition,
    endServerPosition: end.playerPosition,
    endScreenPosition: endScreen,
    consoleErrors,
    pageErrors,
    rollback: false,
    boundaryReached: end.playerPosition.x === end.mapBounds.maxX,
  })
})

test('empty farm CTA opens capture without planting or upload requests', async ({ page }, testInfo) => {
  const token = await enterVillage(page)
  await routePlayer(page, token, { x: 4, y: 9 })
  await syncVillage(page)

  await page.getByRole('button', { name: '비어 있는 밭 · 살펴보기' }).click()
  await expect(page.getByRole('region', { name: '비어 있는 밭 살펴보기' })).toBeVisible()

  const responses = []
  const captureResponse = (response) => {
    const request = response.request()
    if (request.resourceType() !== 'fetch' && request.resourceType() !== 'xhr') return
    responses.push({ method: request.method(), url: response.url(), status: response.status() })
  }
  page.on('response', captureResponse)
  await page.getByRole('button', { name: '사진으로 기억 심기' }).click()
  await expect(page.getByLabel('따뜻한 숲과 노을을 담는 카메라 화면')).toBeVisible()
  await page.waitForTimeout(500)
  page.off('response', captureResponse)

  const plantRequests = responses.filter((request) => request.method === 'POST' && request.url.includes('/api/seeds/plant'))
  const photoRequests = responses.filter((request) => request.method === 'POST' && request.url.endsWith('/api/photos'))
  const recognitionRequests = responses.filter((request) => request.method === 'POST' && request.url.includes('/recognize'))
  const worldChangeRequests = responses.filter((request) => request.method === 'POST' && request.url.includes('world-change'))

  expect(plantRequests).toHaveLength(0)
  expect(photoRequests).toHaveLength(0)
  expect(recognitionRequests).toHaveLength(0)
  expect(worldChangeRequests).toHaveLength(0)

  await attachEvidence(testInfo, 'empty-farm-cta-network', {
    capturedRequests: responses,
    plantEndpoint: 'POST /api/seeds/plant',
    plantRequestCount: plantRequests.length,
    photoRequestCount: photoRequests.length,
    recognitionRequestCount: recognitionRequests.length,
    worldChangeRequestCount: worldChangeRequests.length,
  })
})

for (const viewport of [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`touch responsive QA ${viewport.width}x${viewport.height}`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    try {
      const token = await enterVillage(page)
      await routePlayer(page, token, { x: 0, y: 7 })
      await syncVillage(page)

      const media = await page.evaluate(() => ({
        coarsePointer: window.matchMedia('(pointer: coarse)').matches,
        hoverNone: window.matchMedia('(hover: none)').matches,
        maxTouchPoints: navigator.maxTouchPoints,
      }))
      expect(media.coarsePointer).toBe(true)
      expect(media.hoverNone).toBe(true)
      expect(media.maxTouchPoints).toBeGreaterThan(0)

      const joystick = page.locator('.virtual-joystick')
      await expect(joystick).toBeVisible()
      const start = await state(page, token)
      const moveResponses = []
      page.on('response', (response) => {
        if (response.url().endsWith('/api/worlds/me/move')) moveResponses.push(response.status())
      })

      const client = await context.newCDPSession(page)
      const touchStart = { x: 72, y: viewport.height - 92 }
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...touchStart, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
      })
      await page.waitForTimeout(100)
      await expect(page.locator('.virtual-joystick')).toHaveClass(/is-active/)
      const activePadBox = await page.locator('.virtual-joystick__pad').boundingBox()
      const hudBox = await page.locator('.village-action-bar').boundingBox()
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: touchStart.x + 48, y: touchStart.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
      })
      await page.waitForTimeout(900)
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(700)

      const afterTouch = await state(page, token)
      const afterTouchScreen = await screenTile(page)
      expect(moveResponses.length).toBeGreaterThan(0)
      expect(afterTouch.playerPosition.x).toBeGreaterThan(start.playerPosition.x)
      expect(afterTouchScreen).toEqual(afterTouch.playerPosition)
      expect(overlaps(activePadBox, hudBox)).toBe(false)

      const inspectTrigger = page.locator('.tile-interaction').first()
      await inspectTrigger.click({ force: true })
      const inspectPanel = page.locator('.tile-inspect-panel')
      await expect(inspectPanel).toBeVisible()
      const inspectBox = await inspectPanel.boundingBox()
      expect(withinViewport(inspectBox, viewport)).toBe(true)
      await page.getByRole('button', { name: '타일 정보 닫기' }).click()

      await routePlayer(page, token, { x: 10, y: 7 })
      await syncVillage(page)
      await page.getByRole('button', { name: '마을 안내자 · 대화하기' }).click()
      const dialoguePanel = page.getByRole('region', { name: '마을 안내자와의 대화' })
      await expect(dialoguePanel).toBeVisible()
      const dialogueBox = await dialoguePanel.boundingBox()
      expect(withinViewport(dialogueBox, viewport)).toBe(true)
      await dialoguePanel.getByRole('button', { name: '닫기' }).click()

      await page.getByRole('button', { name: '오늘의 순간 남기기' }).click()
      await expect(page.getByLabel('따뜻한 숲과 노을을 담는 카메라 화면')).toBeVisible()
      const closeCapture = page.getByRole('button', { name: '마을로 돌아가기' })
      const captureCloseBox = await closeCapture.boundingBox()
      expect(withinViewport(captureCloseBox, viewport)).toBe(true)
      await closeCapture.click()
      await expect(page.locator('.village-stage')).toBeVisible()

      const overflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth > window.innerWidth,
        vertical: document.documentElement.scrollHeight > window.innerHeight,
      }))
      const captureButtonBox = await page.getByRole('button', { name: '오늘의 순간 남기기' }).boundingBox()
      const hudBottomGap = viewport.height - (hudBox.y + hudBox.height)
      const captureButtonBottomGap = viewport.height - (captureButtonBox.y + captureButtonBox.height)
      const safeAreaOverlap = hudBottomGap < 0 || captureButtonBottomGap < 0
      expect(overflow.horizontal).toBe(false)
      expect(overflow.vertical).toBe(false)
      expect(withinViewport(captureButtonBox, viewport)).toBe(true)
      expect(safeAreaOverlap).toBe(false)

      await attachEvidence(testInfo, `touch-${viewport.width}x${viewport.height}`, {
        viewport,
        ...media,
        joystickVisible: await joystick.isVisible(),
        joystickMoveRequestCount: moveResponses.length,
        startServerPosition: start.playerPosition,
        endServerPosition: afterTouch.playerPosition,
        endScreenPosition: afterTouchScreen,
        hudOverlap: overlaps(activePadBox, hudBox),
        inspectWithinViewport: withinViewport(inspectBox, viewport),
        dialogueWithinViewport: withinViewport(dialogueBox, viewport),
        captureCloseWithinViewport: withinViewport(captureCloseBox, viewport),
        captureButtonWithinViewport: withinViewport(captureButtonBox, viewport),
        horizontalOverflow: overflow.horizontal,
        verticalOverflow: overflow.vertical,
        hudBottomGap,
        captureButtonBottomGap,
        safeAreaOverlap,
      })
    } finally {
      await context.close()
    }
  })
}
