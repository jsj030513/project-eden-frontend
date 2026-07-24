import { expect, test } from '@playwright/test'
import {
  API_URL,
  FRONTEND_URL,
  createE2EFixture,
  findEmptyPlotTarget,
  provisionLocalFixture,
} from './village-e2e-fixture'

const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const fixture = createE2EFixture('village-planting')

test.beforeAll(async ({ request }) => provisionLocalFixture(request, fixture))

async function dismissOnboarding(page) {
  const explore = page.getByRole('button', { name: '천천히 둘러보기' })
  if (await explore.isVisible().catch(() => false)) await explore.click()
  const later = page.getByRole('button', { name: '지금은 둘러볼게요' })
  if (await later.isVisible().catch(() => false)) await later.click()
}

async function enterVillage(page, activeFixture = fixture) {
  await page.goto(FRONTEND_URL)
  const enter = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enter.isVisible().catch(() => false)) await enter.click()
  const email = page.getByRole('textbox', { name: '이메일' })
  if (await email.isVisible().catch(() => false)) {
    await email.fill(activeFixture.email)
    await page.getByRole('textbox', { name: '비밀번호' }).fill(activeFixture.password)
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

async function requestWorldState(request, token) {
  const response = await request.get(`${API_URL}/api/worlds/me/state`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  return response.json()
}

function unaffectedWorldState(state, excludedObjectIds = []) {
  const excluded = new Set(excludedObjectIds)
  return {
    terrainTiles: state.terrainTiles,
    playerPosition: state.playerPosition,
    npcPositions: state.npcPositions,
    placedObjects: state.placedObjects.filter((object) => !excluded.has(object.id)),
  }
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
  const state = await worldState(page, token)
  for (const step of pathTo(state, target)) {
    const response = await browserApi(page, token, '/api/worlds/me/move', {
      method: 'POST',
      body: { targetX: step.x, targetY: step.y },
    })
    expect(response.status).toBe(200)
    expect(response.body.accepted).toBe(true)
  }
}

async function openTargetedCapture(page, token, useTouch = false) {
  const state = await worldState(page, token)
  const target = findEmptyPlotTarget(state)
  await routePlayer(page, token, target.adjacent)
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
  await expect(capture).toHaveAttribute('data-capture-mode', 'TARGETED_PLANTING')
  await expect(capture).toHaveAttribute('data-target-id', String(target.id))
  await expect(capture).toHaveAttribute('data-target-x', String(target.x))
  await expect(capture).toHaveAttribute('data-target-y', String(target.y))
  return { capture, target, state }
}

async function chooseFixtureImage(page, name = 'flower-targeted-memory.png') {
  await page.locator('input[type="file"]').nth(1).setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: PNG_BUFFER,
  })
  await expect(page.getByRole('button', { name: '기억 남기기' })).toBeVisible()
}

function plantingResponse({ photoId, target, applied = true }) {
  const worldChange = applied
    ? {
        worldChangeId: 991001,
        worldCategory: 'NATURE',
        assetType: 'FARM_FLOWER',
        messageKey: 'FLOWER',
        displayMessage: '이 기억이 빈 밭에 꽃으로 피어났습니다.',
        spawnedObjectIds: [992001],
        villageChanged: true,
        focusX: target.x * 48,
        focusY: target.y * 48,
      }
    : null
  return {
    photoId,
    targetId: target.id,
    targetX: target.x,
    targetY: target.y,
    plantingApplied: applied,
    cropAssetType: applied ? 'FARM_FLOWER' : null,
    recognition: {
      recognitionId: 993001,
      id: 993001,
      photoId,
      recognizedObject: applied ? 'FLOWER' : 'CAT',
      category: applied ? 'NATURE' : 'ANIMAL',
      confidence: 0.91,
      recognized: true,
      fallback: false,
      worldChange,
    },
    worldChange,
  }
}

function plantedWorldState(state, target) {
  const cropId = 992001
  return {
    ...state,
    placedObjects: [
      ...state.placedObjects.filter((object) => object.id !== target.id),
      {
        id: cropId,
        assetType: 'FARM_FLOWER',
        worldCategory: 'NATURE',
        x: target.x * 48,
        y: target.y * 48,
        terrainType: 'SOIL',
        habitatType: 'DECORATION_ONLY',
        worldChangeId: 991001,
        depth: target.y * 48,
        variant: 0,
      },
    ],
    worldChanges: [
      ...(state.worldChanges ?? []),
      plantingResponse({ photoId: 900001, target, applied: true }).worldChange,
    ],
    availableInteractions: [
      ...(state.availableInteractions ?? []).filter((interaction) => interaction.targetId !== target.id),
      {
        x: target.x,
        y: target.y,
        type: 'INTERACT',
        available: true,
        reason: null,
        targetId: cropId,
        targetAssetType: 'FARM_FLOWER',
        displayName: '꽃밭',
        category: 'CROP',
        actionLabel: '작물 살펴보기',
      },
    ],
  }
}

function observeRequests(page) {
  const requests = []
  const listener = (request) => {
    if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
      let data = null
      if (request.headers()['content-type']?.includes('application/json')) {
        data = request.postDataJSON()
      }
      requests.push({ method: request.method(), url: request.url(), data })
    }
  }
  page.on('request', listener)
  return {
    requests,
    stop: () => page.off('request', listener),
    count: (method, fragment) => requests.filter((request) => request.method === method && request.url.includes(fragment)).length,
  }
}

async function installPhotoRoute(page, photoId, callback) {
  let count = 0
  await page.route('**/api/photos', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    count += 1
    if (callback) return callback(route, count)
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: photoId, photoId }),
    })
  })
  return () => count
}

async function installPlantableRoutes(page, target, state, photoId = 900001) {
  const getPhotoCount = await installPhotoRoute(page, photoId)
  let plantingCount = 0
  let plantingBody = null
  let planted = false
  await page.route('**/api/worlds/me/plant-memory', async (route) => {
    plantingCount += 1
    plantingBody = route.request().postDataJSON()
    planted = true
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(plantingResponse({ photoId, target, applied: true })),
    })
  })
  await page.route('**/api/worlds/me/state', async (route) => {
    if (!planted) return route.continue()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(plantedWorldState(state, target)),
    })
  })
  return {
    get photoCount() { return getPhotoCount() },
    get plantingCount() { return plantingCount },
    get plantingBody() { return plantingBody },
  }
}

test('sends the exact targeted contract and renders only the refetched crop', async ({ page }) => {
  const token = await enterVillage(page)
  const { target, state } = await openTargetedCapture(page, token)
  const routes = await installPlantableRoutes(page, target, state)
  const observer = observeRequests(page)
  await chooseFixtureImage(page)
  await page.getByRole('button', { name: '기억 남기기' }).evaluate((button) => {
    button.click()
    button.click()
  })

  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(page.locator('.village-reveal-layer')).toHaveCount(1)
  expect(routes.photoCount).toBe(1)
  expect(routes.plantingCount).toBe(1)
  expect(routes.plantingBody).toEqual({
    photoId: 900001,
    targetId: target.id,
    expectedX: target.x,
    expectedY: target.y,
  })
  expect(observer.count('POST', '/api/photos')).toBe(1)
  expect(observer.count('POST', '/plant-memory')).toBe(1)
  expect(observer.count('POST', '/recognize')).toBe(0)
  expect(observer.count('POST', '/api/seeds/plant')).toBe(0)
  expect(observer.count('POST', 'world-change')).toBe(0)
  expect(observer.count('GET', '/api/worlds/me/state')).toBe(1)
  await expect(page.locator('.village-reveal-layer')).toHaveCount(0, { timeout: 5_000 })
  await expect(page.getByRole('button', { name: '비어 있는 밭 · 살펴보기' })).toHaveCount(0)
  const cropPrompt = page.getByRole('button', { name: '꽃밭 · 작물 살펴보기' })
  await expect(cropPrompt).toBeVisible()
  await cropPrompt.click()
  await expect(page.getByRole('region', { name: '꽃밭 살펴보기' })).toBeVisible()
  observer.stop()
})

test('treats a non-plantable response as a saved memory without inventing a crop reveal', async ({ page }) => {
  const token = await enterVillage(page)
  const { target } = await openTargetedCapture(page, token)
  const getPhotoCount = await installPhotoRoute(page, 900002)
  let plantingCount = 0
  await page.route('**/api/worlds/me/plant-memory', async (route) => {
    plantingCount += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(plantingResponse({ photoId: 900002, target, applied: false })),
    })
  })
  const observer = observeRequests(page)
  await chooseFixtureImage(page, 'cat-non-plantable.png')
  await page.getByRole('button', { name: '기억 남기기' }).click()

  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(page.locator('.village-reveal-layer')).toHaveCount(0)
  await expect(page.locator('.village-status')).toContainText('이 사진에서는 심을 수 있는 작물을 찾지 못했어요')
  await expect(page.getByRole('button', { name: '비어 있는 밭 · 살펴보기' })).toBeVisible()
  expect(getPhotoCount()).toBe(1)
  expect(plantingCount).toBe(1)
  expect(observer.count('GET', '/api/worlds/me/state')).toBe(1)
  expect(observer.count('POST', '/recognize')).toBe(0)
  observer.stop()
})

test('keeps general capture on the existing recognize endpoint', async ({ page }) => {
  await enterVillage(page)
  await page.getByRole('button', { name: '오늘의 순간 남기기' }).click()
  await expect(page.getByLabel('따뜻한 숲과 노을을 담는 카메라 화면')).toHaveAttribute(
    'data-capture-mode',
    'GENERAL_MEMORY',
  )
  const getPhotoCount = await installPhotoRoute(page, 900003)
  let recognizeCount = 0
  await page.route('**/api/photos/900003/recognize', async (route) => {
    recognizeCount += 1
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recognitionId: 993003,
        photoId: 900003,
        recognized: true,
        recognizedObject: 'FLOWER',
        confidence: 0.91,
        fallback: false,
        worldChange: {
          worldChangeId: 991003,
          worldCategory: 'NATURE',
          assetType: 'FLOWER_CLUSTER',
          displayMessage: '이 기억은 마을의 새로운 풍경이 되었습니다.',
          focusX: 240,
          focusY: 336,
        },
      }),
    })
  })
  const observer = observeRequests(page)
  await chooseFixtureImage(page)
  await page.getByRole('button', { name: '기억 남기기' }).click()
  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(page.locator('.village-reveal-layer')).toHaveCount(1)
  expect(getPhotoCount()).toBe(1)
  expect(recognizeCount).toBe(1)
  expect(observer.count('POST', '/plant-memory')).toBe(0)
  expect(observer.count('GET', '/api/worlds/me/state')).toBe(1)
  observer.stop()
})

test('retries a failed upload from upload without calling planting early', async ({ page }) => {
  const token = await enterVillage(page)
  const { target, state } = await openTargetedCapture(page, token)
  let uploadCount = 0
  await page.route('**/api/photos', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    uploadCount += 1
    if (uploadCount === 1) {
      return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"upload failed"}' })
    }
    return route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ id: 900004, photoId: 900004 }),
    })
  })
  let plantingCount = 0
  let planted = false
  await page.route('**/api/worlds/me/plant-memory', async (route) => {
    plantingCount += 1
    planted = true
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(plantingResponse({ photoId: 900004, target, applied: true })),
    })
  })
  await page.route('**/api/worlds/me/state', async (route) => {
    if (!planted) return route.continue()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(plantedWorldState(state, target)),
    })
  })
  await chooseFixtureImage(page)
  await page.getByRole('button', { name: '기억 남기기' }).click()
  await expect(page.locator('.capture-error-card')).toBeVisible()
  expect(uploadCount).toBe(1)
  expect(plantingCount).toBe(0)
  await page.getByRole('button', { name: '같은 사진 다시 살펴보기' }).click()
  await expect(page.locator('.village-stage')).toBeVisible()
  expect(uploadCount).toBe(2)
  expect(plantingCount).toBe(1)
})

test('reuses the uploaded photo and target after a lost planting response', async ({ page }) => {
  const token = await enterVillage(page)
  const { target, state } = await openTargetedCapture(page, token)
  const getPhotoCount = await installPhotoRoute(page, 900005)
  let plantingCount = 0
  const plantingBodies = []
  let planted = false
  await page.route('**/api/worlds/me/plant-memory', async (route) => {
    plantingCount += 1
    plantingBodies.push(route.request().postDataJSON())
    if (plantingCount === 1) return route.abort('failed')
    planted = true
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(plantingResponse({ photoId: 900005, target, applied: true })),
    })
  })
  await page.route('**/api/worlds/me/state', async (route) => {
    if (!planted) return route.continue()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(plantedWorldState(state, target)),
    })
  })
  const observer = observeRequests(page)
  await chooseFixtureImage(page)
  await page.getByRole('button', { name: '기억 남기기' }).click()
  await expect(page.locator('.capture-error-card')).toBeVisible()
  await page.getByRole('button', { name: '다시 연결하기' }).evaluate((button) => {
    button.click()
    button.click()
  })
  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(page.locator('.village-reveal-layer')).toHaveCount(1)
  expect(getPhotoCount()).toBe(1)
  expect(plantingCount).toBe(2)
  expect(plantingBodies[1]).toEqual(plantingBodies[0])
  expect(observer.count('GET', '/api/worlds/me/state')).toBe(1)
  observer.stop()
})

for (const conflict of [
  {
    code: 'TARGET_ALREADY_PLANTED',
    message: '그 사이 이 밭에 다른 기억이 심어졌어요',
    refresh: true,
  },
  {
    code: 'TARGET_CHANGED',
    message: '선택한 밭의 모습이 달라졌어요',
    refresh: true,
  },
  {
    code: 'PHOTO_ALREADY_EXPRESSED',
    message: '이 사진은 이미 다른 기억으로 마을에 남아 있어요',
    refresh: false,
  },
  {
    code: 'TARGET_OUT_OF_RANGE',
    message: '밭에서 조금 멀어졌어요',
    refresh: true,
  },
]) {
  test(`handles ${conflict.code} as a terminal targeted conflict`, async ({ page }) => {
    const token = await enterVillage(page)
    await openTargetedCapture(page, token)
    const getPhotoCount = await installPhotoRoute(page, 900100)
    let plantingCount = 0
    await page.route('**/api/worlds/me/plant-memory', async (route) => {
      plantingCount += 1
      return route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ message: conflict.code }),
      })
    })
    const observer = observeRequests(page)
    await chooseFixtureImage(page)
    await page.getByRole('button', { name: '기억 남기기' }).click()
    await expect(page.locator('.village-stage')).toBeVisible()
    await expect(page.locator('.village-status')).toContainText(conflict.message)
    await expect(page.locator('.village-reveal-layer')).toHaveCount(0)
    expect(getPhotoCount()).toBe(1)
    expect(plantingCount).toBe(1)
    expect(observer.count('GET', '/api/worlds/me/state')).toBe(conflict.refresh ? 1 : 0)
    await page.getByRole('button', { name: '오늘의 순간 남기기' }).click()
    await expect(page.getByLabel('따뜻한 숲과 노을을 담는 카메라 화면')).toHaveAttribute(
      'data-capture-mode',
      'GENERAL_MEMORY',
    )
    observer.stop()
    await page.keyboard.press('Escape')
  })
}

for (const viewport of [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`targeted planting returns to a usable crop prompt at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    const page = await context.newPage()
    try {
      const token = await enterVillage(page)
      const { target, state } = await openTargetedCapture(page, token, true)
      await installPlantableRoutes(page, target, state, 900200 + viewport.width)
      await chooseFixtureImage(page)
      const submit = page.getByRole('button', { name: '기억 남기기' })
      await submit.tap()
      await expect(page.locator('.village-stage')).toBeVisible()
      await expect(page.locator('.village-reveal-layer')).toHaveCount(0, { timeout: 5_000 })
      const cropPrompt = page.getByRole('button', { name: '꽃밭 · 작물 살펴보기' })
      await expect(cropPrompt).toBeVisible()
      const media = await page.evaluate(() => ({
        coarse: matchMedia('(pointer: coarse)').matches,
        touchPoints: navigator.maxTouchPoints,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        verticalOverflow: document.documentElement.scrollHeight > innerHeight,
      }))
      expect(media).toEqual({
        coarse: true,
        touchPoints: expect.any(Number),
        horizontalOverflow: false,
        verticalOverflow: false,
      })
      expect(media.touchPoints).toBeGreaterThan(0)
      const box = await cropPrompt.boundingBox()
      expect(box).toBeTruthy()
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
      await cropPrompt.tap()
      await expect(page.getByRole('region', { name: '꽃밭 살펴보기' })).toBeVisible()
    } finally {
      await context.close()
    }
  })
}

test('actual C1 runtime persists one empty plot as a crop and returns the backend reveal', async ({
  page,
  request,
}, testInfo) => {
  const observerFixture = createE2EFixture('planting-observer')
  const observerProvision = await provisionLocalFixture(request, observerFixture)
  const observerBefore = await requestWorldState(request, observerProvision.token)
  const token = await enterVillage(page)
  const { target } = await openTargetedCapture(page, token)
  const currentUserBefore = await worldState(page, token)
  const beforePrompt = await page.getByLabel('따뜻한 숲과 노을을 담는 카메라 화면').getAttribute('data-target-id')
  const requests = observeRequests(page)
  const responsePromise = page.waitForResponse((response) => (
    response.request().method() === 'POST' && response.url().includes('/api/worlds/me/plant-memory')
  ))
  await chooseFixtureImage(page, 'flower-c2-runtime.png')
  await page.getByRole('button', { name: '기억 남기기' }).click()
  const response = await responsePromise
  const body = await response.json()

  expect(response.status()).toBe(200)
  expect(body).toMatchObject({
    targetId: target.id,
    targetX: target.x,
    targetY: target.y,
    plantingApplied: true,
    cropAssetType: 'FARM_FLOWER',
  })
  expect(body.photoId).toBeTruthy()
  expect(body.worldChange?.worldChangeId).toBeTruthy()
  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(page.locator('.village-reveal-layer')).toHaveCount(1)
  await expect(page.locator('.village-reveal-layer')).toHaveCount(0, { timeout: 5_000 })
  await expect(page.getByRole('button', { name: '비어 있는 밭 · 살펴보기' })).toHaveCount(0)
  const cropPrompt = page.getByRole('button', { name: '꽃밭 · 작물 살펴보기' })
  await expect(cropPrompt).toBeVisible()
  await cropPrompt.click()
  await expect(page.getByRole('region', { name: '꽃밭 살펴보기' })).toBeVisible()
  expect(requests.count('POST', '/api/photos')).toBe(1)
  expect(requests.count('POST', '/plant-memory')).toBe(1)
  expect(requests.count('POST', '/recognize')).toBe(0)
  expect(requests.count('POST', '/api/seeds/plant')).toBe(0)
  expect(requests.count('GET', '/api/worlds/me/state')).toBe(1)
  await testInfo.attach('actual-c1-runtime-evidence', {
    body: Buffer.from(JSON.stringify({
      user: fixture.email,
      playerTile: target.adjacent,
      beforePromptTargetId: Number(beforePrompt),
      request: requests.requests.find((request) => request.url.includes('/plant-memory'))?.data,
      response: body,
      afterPrompt: '꽃밭 · 작물 살펴보기',
      worldStateRefetchCount: requests.count('GET', '/api/worlds/me/state'),
    }, null, 2)),
    contentType: 'application/json',
  })
  requests.stop()

  await syncVillage(page)
  await expect(page.locator('.village-reveal-layer')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '비어 있는 밭 · 살펴보기' })).toHaveCount(0)
  const reloadedCropPrompt = page.getByRole('button', { name: '꽃밭 · 작물 살펴보기' })
  await expect(reloadedCropPrompt).toBeVisible()
  await reloadedCropPrompt.click()
  await expect(page.getByRole('region', { name: '꽃밭 살펴보기' })).toBeVisible()
  const currentUserAfter = await worldState(page, token)
  const spawnedObjectIds = body.worldChange?.spawnedObjectIds ?? []
  expect(unaffectedWorldState(currentUserAfter, spawnedObjectIds)).toEqual(
    unaffectedWorldState(currentUserBefore, [target.id]),
  )
  const observerAfter = await requestWorldState(request, observerProvision.token)
  expect(observerAfter).toEqual(observerBefore)
})

test('actual C1 runtime persists a non-plantable recognition while keeping the empty plot', async ({
  browser,
  request,
}, testInfo) => {
  const nonPlantFixture = createE2EFixture('planting-nonplantable')
  await provisionLocalFixture(request, nonPlantFixture)
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    const token = await enterVillage(page, nonPlantFixture)
    const { target } = await openTargetedCapture(page, token)
    const worldBefore = await worldState(page, token)
    const responsePromise = page.waitForResponse((response) => (
      response.request().method() === 'POST' && response.url().includes('/api/worlds/me/plant-memory')
    ))
    await chooseFixtureImage(page, 'cat-c2-nonplantable-runtime.png')
    await page.getByRole('button', { name: '기억 남기기' }).click()
    const response = await responsePromise
    const body = await response.json()

    expect(response.status()).toBe(200)
    expect(body).toMatchObject({
      targetId: target.id,
      targetX: target.x,
      targetY: target.y,
      plantingApplied: false,
      cropAssetType: null,
      worldChange: null,
    })
    expect(body.recognition?.recognitionId ?? body.recognition?.id).toBeTruthy()
    await expect(page.locator('.village-stage')).toBeVisible()
    await expect(page.locator('.village-reveal-layer')).toHaveCount(0)
    await expect(page.locator('.village-status')).toContainText('이 사진에서는 심을 수 있는 작물을 찾지 못했어요')
    await expect(page.getByRole('button', { name: '비어 있는 밭 · 살펴보기' })).toBeVisible()

    const retry = await browserApi(page, token, '/api/worlds/me/plant-memory', {
      method: 'POST',
      body: {
        photoId: body.photoId,
        targetId: target.id,
        expectedX: target.x,
        expectedY: target.y,
      },
    })
    expect(retry.status).toBe(200)
    expect(retry.body.plantingApplied).toBe(false)
    expect(retry.body.recognition?.recognitionId ?? retry.body.recognition?.id)
      .toBe(body.recognition?.recognitionId ?? body.recognition?.id)

    await syncVillage(page)
    await expect(page.locator('.village-reveal-layer')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '비어 있는 밭 · 살펴보기' })).toBeVisible()
    const reloadedState = await worldState(page, token)
    expect(reloadedState.placedObjects).toContainEqual(expect.objectContaining({
      id: target.id,
      assetType: 'FARM_PLOT_EMPTY',
    }))
    expect(reloadedState.placedObjects.filter((object) => (
      object.x === target.x * 48 && object.y === target.y * 48
    ))).toEqual([
      expect.objectContaining({ id: target.id, assetType: 'FARM_PLOT_EMPTY' }),
    ])
    expect(reloadedState).toEqual(worldBefore)

    await testInfo.attach('actual-nonplantable-runtime-evidence', {
      body: Buffer.from(JSON.stringify({
        user: nonPlantFixture.email,
        target,
        firstResponse: body,
        sameTargetRetry: retry.body,
        reloadEmptyPlotVisible: true,
      }, null, 2)),
      contentType: 'application/json',
    })
  } finally {
    await context.close()
  }
})
