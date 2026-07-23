import { expect, test } from '@playwright/test'
import {
  API_URL,
  FRONTEND_URL,
  createE2EFixture,
  provisionLocalFixture,
} from './village-e2e-fixture'

const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const fixture = createE2EFixture('village-capture')

test.describe.configure({ mode: 'serial' })
test.beforeAll(async ({ request }) => provisionLocalFixture(request, fixture))

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
  const token = await page.evaluate(() => sessionStorage.getItem('projectEdenAccessToken'))
  expect(token).toBeTruthy()
  return token
}

async function syncVillage(page) {
  await page.reload()
  const enter = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enter.isVisible().catch(() => false)) await enter.click()
  await expect(page.locator('.terrain-tile')).toHaveCount(384)
  await dismissOnboarding(page)
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
    return { status: response.status, body: text ? JSON.parse(text) : null }
  }, {
    apiUrl: API_URL,
    authToken: token,
    requestPath: path,
    requestMethod: method,
    requestBody: body,
  })
}

async function worldState(page, token) {
  const response = await browserApi(page, token, '/api/worlds/me/state')
  expect(response.status).toBe(200)
  return response.body
}

function key(x, y) {
  return `${x}:${y}`
}

function pathTo(state, target) {
  const walkable = new Set(state.terrainTiles.filter((tile) => tile.walkable).map((tile) => key(tile.x, tile.y)))
  const queue = [{ ...state.playerPosition, path: [] }]
  const seen = new Set([key(state.playerPosition.x, state.playerPosition.y)])
  const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
  while (queue.length) {
    const current = queue.shift()
    if (current.x === target.x && current.y === target.y) return current.path
    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y }
      const nextKey = key(next.x, next.y)
      if (seen.has(nextKey) || !walkable.has(nextKey)) continue
      seen.add(nextKey)
      queue.push({ ...next, path: [...current.path, next] })
    }
  }
  throw new Error(`No walkable path to ${target.x},${target.y}`)
}

async function routePlayer(page, token, target) {
  const before = await worldState(page, token)
  for (const step of pathTo(before, target)) {
    const response = await browserApi(page, token, '/api/worlds/me/move', {
      method: 'POST',
      body: { targetX: step.x, targetY: step.y },
    })
    expect(response.status).toBe(200)
    expect(response.body.accepted).toBe(true)
  }
}

async function openEmptyFarmCapture(page, token, useTouch = false) {
  await routePlayer(page, token, { x: 4, y: 9 })
  await syncVillage(page)
  const prompt = page.getByRole('button', { name: '비어 있는 밭 · 살펴보기' })
  if (useTouch) await prompt.tap()
  else await prompt.click()
  const panel = page.getByRole('region', { name: '비어 있는 밭 살펴보기' })
  await expect(panel).toBeVisible()
  const cta = panel.getByRole('button', { name: '사진으로 기억 심기' })
  if (useTouch) await cta.tap()
  else await cta.click()
  const capture = page.getByLabel('따뜻한 숲과 노을을 담는 카메라 화면')
  await expect(capture).toBeVisible()
  await expect(capture).toHaveAttribute('data-capture-context', 'contextual')
  await expect(capture).toHaveAttribute('data-target-asset-type', 'FARM_PLOT_EMPTY')
  await expect(capture).toHaveAttribute('data-target-category', 'FARM')
  await expect(capture).toHaveAttribute('data-target-x', '3')
  await expect(capture).toHaveAttribute('data-target-y', '9')
  await expect(capture).toHaveAttribute('data-target-display-name', '비어 있는 밭')
  expect(await capture.getAttribute('data-target-id')).toMatch(/^\d+$/)
  await expect(panel).toHaveCount(0)
  return capture
}

async function chooseFixtureImage(page) {
  await page.locator('input[type="file"]').nth(1).setInputFiles({
    name: 'capture-return-fixture.png',
    mimeType: 'image/png',
    buffer: PNG_BUFFER,
  })
  await expect(page.getByRole('button', { name: '기억 남기기' })).toBeVisible()
}

function recognitionFixture(photoId, recognizedObject = 'FLOWER') {
  return {
    recognitionId: 880001,
    photoId,
    recognized: recognizedObject !== 'UNKNOWN',
    recognizedObject,
    confidence: recognizedObject === 'UNKNOWN' ? 0 : 0.91,
    fallback: recognizedObject === 'UNKNOWN',
    worldChange: {
      worldChangeId: 990001,
      worldCategory: recognizedObject === 'UNKNOWN' ? 'UNKNOWN' : 'NATURE',
      assetType: recognizedObject === 'UNKNOWN' ? 'MEMORY_SPARK' : 'FLOWER_CLUSTER',
      displayMessage: recognizedObject === 'UNKNOWN'
        ? '특별한 기억이 마을 어딘가에 작은 변화를 남겼습니다.'
        : '이 기억은 마을의 새로운 풍경이 되었습니다.',
      focusX: 240,
      focusY: 336,
    },
  }
}

function plantingFixture(photoId, recognizedObject = 'FLOWER') {
  const recognition = recognitionFixture(photoId, recognizedObject)
  const plantingApplied = recognizedObject !== 'UNKNOWN'
  const worldChange = plantingApplied
    ? {
        ...recognition.worldChange,
        assetType: 'FARM_FLOWER',
        focusX: 144,
        focusY: 432,
        spawnedObjectIds: [990101],
        villageChanged: true,
      }
    : null
  return {
    photoId,
    targetId: 880101,
    targetX: 3,
    targetY: 9,
    plantingApplied,
    cropAssetType: plantingApplied ? 'FARM_FLOWER' : null,
    recognition: { ...recognition, worldChange },
    worldChange,
  }
}

async function installSuccessfulCaptureRoutes(page, photoId, recognizedObject = 'FLOWER') {
  const counts = { photo: 0, planting: 0 }
  await page.route('**/api/photos', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    counts.photo += 1
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: photoId, photoId }) })
  })
  await page.route('**/api/worlds/me/plant-memory', async (route) => {
    counts.planting += 1
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(plantingFixture(photoId, recognizedObject)) })
  })
  return counts
}

function observeRequests(page) {
  const requests = []
  const listener = (request) => requests.push({ method: request.method(), url: request.url() })
  page.on('request', listener)
  return {
    requests,
    stop: () => page.off('request', listener),
    count: (method, pattern) => requests.filter((request) => request.method === method && request.url.includes(pattern)).length,
  }
}

async function screenPosition(page) {
  return page.locator('.pixel-character').evaluate((element) => ({
    x: Math.round(Number.parseFloat(element.style.left) / 48),
    y: Math.round(Number.parseFloat(element.style.top) / 48),
  }))
}

function withinViewport(box, viewport) {
  return Boolean(box)
    && box.x >= 0
    && box.y >= 0
    && box.x + box.width <= viewport.width
    && box.y + box.height <= viewport.height
}

test('preserves target context through entry and clears it on mutation-free cancel', async ({ page }) => {
  const token = await enterVillage(page)
  const observer = observeRequests(page)
  await openEmptyFarmCapture(page, token)
  expect(observer.count('POST', '/api/photos')).toBe(0)
  expect(observer.count('POST', '/recognize')).toBe(0)
  expect(observer.count('POST', '/plant')).toBe(0)
  expect(observer.count('POST', 'world-change')).toBe(0)
  const worldStateRequestsBeforeCancel = observer.count('GET', '/api/worlds/me/state')

  await page.keyboard.press('Escape')
  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(page.locator('.npc-dialogue-panel,.tile-inspect-panel')).toHaveCount(0)
  expect(observer.count('GET', '/api/worlds/me/state')).toBe(worldStateRequestsBeforeCancel)

  await page.getByRole('button', { name: '오늘의 순간 남기기' }).click()
  const generalCapture = page.getByLabel('따뜻한 숲과 노을을 담는 카메라 화면')
  await expect(generalCapture).toHaveAttribute('data-capture-context', 'general')
  await expect(generalCapture).toHaveAttribute('data-capture-mode', 'GENERAL_MEMORY')
  await expect(generalCapture).not.toHaveAttribute('data-target-asset-type', /.+/)
  observer.stop()
  await page.keyboard.press('Escape')
})

test('successful capture returns once, refetches world state once, and reveals once', async ({ page }) => {
  const token = await enterVillage(page)
  await openEmptyFarmCapture(page, token)
  const counts = await installSuccessfulCaptureRoutes(page, 910001)
  const observer = observeRequests(page)
  const consoleErrors = []
  const pageErrors = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await chooseFixtureImage(page)
  await page.getByRole('button', { name: '기억 남기기' }).evaluate((button) => {
    button.click()
    button.click()
  })

  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(page.locator('.village-reveal-layer')).toHaveCount(1)
  await expect(page.locator('.npc-dialogue-panel,.tile-inspect-panel')).toHaveCount(0)
  await expect(page.locator('.village-interaction-prompt')).toHaveCount(0)
  expect(counts).toEqual({ photo: 1, planting: 1 })
  expect(observer.count('GET', '/api/worlds/me/state')).toBe(1)
  expect(observer.count('GET', '/api/village/me')).toBe(1)
  expect(observer.count('POST', '/recognize')).toBe(0)
  expect(observer.count('POST', '/api/seeds/plant')).toBe(0)
  expect(observer.count('POST', 'world-change')).toBe(0)
  expect(consoleErrors).toEqual([])
  expect(pageErrors).toEqual([])

  await expect(page.locator('.village-reveal-layer')).toHaveCount(0, { timeout: 5_000 })
  await expect(page.getByRole('button', { name: '비어 있는 밭 · 살펴보기' })).toBeVisible()
  await page.waitForTimeout(600)
  await expect(page.locator('.village-reveal-layer')).toHaveCount(0)
  observer.stop()
})

test('upload failure stays recoverable without duplicate upload or world mutation', async ({ page }) => {
  const token = await enterVillage(page)
  const before = await worldState(page, token)
  await openEmptyFarmCapture(page, token)
  let uploadCount = 0
  await page.route('**/api/photos', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    uploadCount += 1
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'fixture upload failure' }) })
  })
  const observer = observeRequests(page)
  await chooseFixtureImage(page)
  await page.getByRole('button', { name: '기억 남기기' }).evaluate((button) => {
    button.click()
    button.click()
  })

  await expect(page.locator('.capture-error-card')).toBeVisible()
  await expect(page.getByLabel('따뜻한 숲과 노을을 담는 카메라 화면')).toHaveAttribute('data-capture-status', 'server-error')
  expect(uploadCount).toBe(1)
  expect(observer.count('POST', '/recognize')).toBe(0)
  expect(observer.count('POST', '/plant-memory')).toBe(0)
  expect(observer.count('GET', '/api/worlds/me/state')).toBe(0)
  await expect(page.locator('.village-reveal-layer')).toHaveCount(0)
  const after = await worldState(page, token)
  expect(after.playerPosition).toEqual(before.playerPosition)
  observer.stop()
})

test('plant-memory failure preserves the uploaded photo and does not reveal', async ({ page }) => {
  const token = await enterVillage(page)
  const before = await worldState(page, token)
  await openEmptyFarmCapture(page, token)
  let uploadCount = 0
  let plantingCount = 0
  await page.route('**/api/photos', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    uploadCount += 1
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 920001, photoId: 920001 }) })
  })
  await page.route('**/api/worlds/me/plant-memory', async (route) => {
    plantingCount += 1
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'fixture planting failure' }) })
  })
  const observer = observeRequests(page)
  await chooseFixtureImage(page)
  await page.getByRole('button', { name: '기억 남기기' }).click()

  await expect(page.locator('.capture-error-card')).toBeVisible()
  expect(uploadCount).toBe(1)
  expect(plantingCount).toBe(1)
  expect(observer.count('GET', '/api/worlds/me/state')).toBe(0)
  expect(observer.count('POST', '/recognize')).toBe(0)
  await expect(page.locator('.village-reveal-layer')).toHaveCount(0)
  const after = await worldState(page, token)
  expect(after.playerPosition).toEqual(before.playerPosition)
  observer.stop()
})

test('a world-state-only refetch failure retains the prior world and position', async ({ page }) => {
  const token = await enterVillage(page)
  const before = await worldState(page, token)
  const beforeScreen = await screenPosition(page)
  await openEmptyFarmCapture(page, token)
  const counts = await installSuccessfulCaptureRoutes(page, 930001)
  let worldStateFailures = 0
  await page.route('**/api/worlds/me/state', async (route) => {
    if (worldStateFailures > 0) return route.continue()
    worldStateFailures += 1
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'fixture world-state failure' }) })
  })
  await chooseFixtureImage(page)
  await page.getByRole('button', { name: '기억 남기기' }).click()

  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(page.locator('.terrain-tile')).toHaveCount(384)
  expect(counts).toEqual({ photo: 1, planting: 1 })
  expect(worldStateFailures).toBe(1)
  expect(await screenPosition(page)).toEqual(beforeScreen)
  await expect(page.locator('.village-reveal-layer')).toHaveCount(1)
  await expect(page.locator('.village-reveal-layer')).toHaveCount(0, { timeout: 5_000 })
  const after = await worldState(page, token)
  expect(after.playerPosition).toEqual(before.playerPosition)
})

test('a full Village refresh failure falls back without duplicate navigation or reveal', async ({ page }) => {
  const token = await enterVillage(page)
  const beforeScreen = await screenPosition(page)
  await openEmptyFarmCapture(page, token)
  const counts = await installSuccessfulCaptureRoutes(page, 940001)
  let villageFailures = 0
  await page.route('**/api/village/me', async (route) => {
    villageFailures += 1
    return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'fixture village refresh failure' }) })
  })
  const observer = observeRequests(page)
  await chooseFixtureImage(page)
  await page.getByRole('button', { name: '기억 남기기' }).click()

  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(page.locator('.terrain-tile')).toHaveCount(384)
  expect(await screenPosition(page)).toEqual(beforeScreen)
  expect(counts).toEqual({ photo: 1, planting: 1 })
  expect(villageFailures).toBe(1)
  expect(observer.count('GET', '/api/worlds/me/state')).toBe(0)
  await expect(page.locator('.village-reveal-layer')).toHaveCount(1)
  await expect(page.locator('.village-reveal-layer')).toHaveCount(0, { timeout: 5_000 })
  await page.waitForTimeout(500)
  await expect(page.locator('.village-reveal-layer')).toHaveCount(0)
  observer.stop()
})

test('non-plantable recognition returns safely without a crop reveal', async ({ page }) => {
  const token = await enterVillage(page)
  await openEmptyFarmCapture(page, token)
  const counts = await installSuccessfulCaptureRoutes(page, 950001, 'UNKNOWN')
  const observer = observeRequests(page)
  await chooseFixtureImage(page)
  await page.getByRole('button', { name: '기억 남기기' }).click()

  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(page.locator('.village-reveal-layer')).toHaveCount(0)
  await expect(page.locator('.village-status')).toContainText('이 사진에서는 심을 수 있는 작물을 찾지 못했어요')
  expect(counts).toEqual({ photo: 1, planting: 1 })
  expect(observer.count('GET', '/api/worlds/me/state')).toBe(1)
  expect(observer.count('POST', '/recognize')).toBe(0)
  observer.stop()
})

for (const viewport of [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`touch Capture cancel returns cleanly at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    const page = await context.newPage()
    try {
      const token = await enterVillage(page)
      const capture = await openEmptyFarmCapture(page, token, true)
      const media = await page.evaluate(() => ({
        coarse: matchMedia('(pointer: coarse)').matches,
        touchPoints: navigator.maxTouchPoints,
      }))
      expect(media.coarse).toBe(true)
      expect(media.touchPoints).toBeGreaterThan(0)
      const back = page.getByRole('button', { name: '마을로 돌아가기' })
      const backBox = await back.boundingBox()
      expect(withinViewport(backBox, viewport)).toBe(true)
      await back.tap()
      await expect(page.locator('.village-stage')).toBeVisible()
      await expect(capture).toHaveCount(0)
      await expect(page.locator('.npc-dialogue-panel,.tile-inspect-panel')).toHaveCount(0)
      const joystick = page.locator('.virtual-joystick')
      await expect(joystick).toBeVisible()
      const beforeMove = await worldState(page, token)
      const client = await context.newCDPSession(page)
      const touchStart = { x: 64, y: viewport.height - 90 }
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...touchStart, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
      })
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: touchStart.x + 46, y: touchStart.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
      })
      await page.waitForTimeout(650)
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(650)
      const afterMove = await worldState(page, token)
      expect(afterMove.playerPosition.x).toBeGreaterThan(beforeMove.playerPosition.x)
      const overflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth > innerWidth,
        vertical: document.documentElement.scrollHeight > innerHeight,
      }))
      expect(overflow).toEqual({ horizontal: false, vertical: false })
    } finally {
      await context.close()
    }
  })
}
