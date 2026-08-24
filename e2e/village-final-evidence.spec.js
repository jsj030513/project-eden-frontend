import { expect, test } from '@playwright/test'
import {
  API_URL,
  FRONTEND_URL,
  createE2EFixture,
  provisionLocalFixture,
} from './village-e2e-fixture'
import { configureResourceStableRendering } from './village-resource-stable-rendering'
import { communityHouseVisualStyle } from '../src/components/village/worldHubLayout'
import { WORLD_CAMERA_SCALE } from '../src/components/village/worldViewport'

const TILE_SIZE = 48
const fixture = createE2EFixture('village-final')
const touchViewports = [
  { viewport: { width: 375, height: 667 }, fixture: createE2EFixture('village-final-touch-375') },
  { viewport: { width: 390, height: 844 }, fixture: createE2EFixture('village-final-touch-390') },
  { viewport: { width: 430, height: 932 }, fixture: createE2EFixture('village-final-touch-430') },
]

test.beforeAll(async ({ request }) => {
  await provisionLocalFixture(request, fixture)
  for (const touchViewport of touchViewports) {
    await provisionLocalFixture(request, touchViewport.fixture)
  }
})

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

async function enterVillage(page, userFixture = fixture) {
  await configureResourceStableRendering(page)
  await page.goto(FRONTEND_URL)

  const enter = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enter.isVisible().catch(() => false)) await enter.click()

  const email = page.getByRole('textbox', { name: '이메일' })
  if (await email.isVisible().catch(() => false)) {
    await email.fill(userFixture.email)
    await page.getByRole('textbox', { name: '비밀번호' }).fill(userFixture.password)
    await page.getByRole('button', { name: '들어가기' }).click()
  }

  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', /^(384|448|512|576|640|704|768|832|896|960|1024|1088|1152|1216|1280)$/)
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
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', /^(384|448|512|576|640|704|768|832|896|960|1024|1088|1152|1216|1280)$/)
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

for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
  test(`renders the complete compact server-authored village at ${viewport.width}x${viewport.height}`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({ viewport })
    try {
      const page = await context.newPage()
      await enterVillage(page)
      const metrics = await page.evaluate(() => {
        const world = document.querySelector('.village-world')?.getBoundingClientRect()
        const objects = [...document.querySelectorAll('[data-world-object-id]')]
        const house = document.querySelector('.asset-community_house')?.getBoundingClientRect()
        const labels = [...document.querySelectorAll('.world-object-label')].map((label) => label.textContent)
        return {
          world: world ? { left: world.left, top: world.top, right: world.right, bottom: world.bottom, width: world.width, height: world.height } : null,
          house: house ? { width: house.width, height: house.height } : null,
          objectCount: objects.length,
          animalCount: objects.filter((object) => object.classList.contains('is-world-animal')).length,
          npcCount: objects.filter((object) => object.classList.contains('is-world-npc')).length,
          farmZones: document.querySelectorAll('.visual-farm').length,
          plazaVisible: Boolean(document.querySelector('.visual-plaza')),
          pondVisible: Boolean(document.querySelector('.visual-pond')),
          bridgeVisible: Boolean(document.querySelector('.visual-bridge')),
          roleLabels: labels.filter((label) => ['마을 안내자', '정원 관리인', '기억 보관인', '동물 돌봄이'].includes(label)),
          dogVisible: Boolean(document.querySelector('.asset-default_dog')),
          catVisible: Boolean(document.querySelector('.asset-default_cat')),
          birdCount: document.querySelectorAll('.asset-default_bird').length,
          duplicateObjectIds: objects.length - new Set(objects.map((object) => object.dataset.worldObjectId)).size,
          horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
          verticalOverflow: document.documentElement.scrollHeight > innerHeight,
        }
      })
      expect(metrics.world.left).toBeLessThanOrEqual(0)
      expect(metrics.world.top).toBeLessThanOrEqual(0)
      expect(metrics.world.right).toBeGreaterThanOrEqual(viewport.width)
      expect(metrics.world.bottom).toBeGreaterThanOrEqual(viewport.height)
      expect(metrics.objectCount).toBeGreaterThanOrEqual(35)
      expect(metrics.animalCount).toBeGreaterThanOrEqual(4)
      expect(metrics.npcCount).toBe(4)
      expect(metrics.farmZones).toBe(4)
      expect(metrics.plazaVisible).toBe(true)
      expect(metrics.pondVisible).toBe(true)
      expect(metrics.bridgeVisible).toBe(true)
      const houseStyle = communityHouseVisualStyle()
      const expectedHouseWidth = Number.parseFloat(houseStyle['--community-house-width']) * WORLD_CAMERA_SCALE
      const expectedHouseHeight = Number.parseFloat(houseStyle['--community-house-height']) / 2 * WORLD_CAMERA_SCALE
      expect(metrics.house.width).toBeCloseTo(expectedHouseWidth, 0)
      expect(metrics.house.height).toBeCloseTo(expectedHouseHeight, 0)
      expect(metrics.roleLabels).toHaveLength(4)
      expect(metrics.dogVisible).toBe(true)
      expect(metrics.catVisible).toBe(true)
      expect(metrics.birdCount).toBeGreaterThanOrEqual(2)
      expect(metrics.duplicateObjectIds).toBe(0)
      expect(metrics.horizontalOverflow).toBe(false)
      expect(metrics.verticalOverflow).toBe(false)
      await testInfo.attach(`compact-village-${viewport.width}x${viewport.height}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
      await attachEvidence(testInfo, `compact-${viewport.width}x${viewport.height}`, metrics)
    } finally {
      await context.close()
    }
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
  const npcTiles = new Set((worldState.npcPositions || []).map((npc) => key(npc.x, npc.y)))
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
      if (seen.has(nextKey) || !walkable.has(nextKey) || npcTiles.has(nextKey)) continue
      seen.add(nextKey)
      queue.push({ ...next, path: [...current.path, next] })
    }
  }
  throw new Error(`No walkable path to ${target.x},${target.y}`)
}

async function routePlayer(page, token, target) {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const current = await state(page, token)
    if (current.playerPosition.x === target.x && current.playerPosition.y === target.y) return current
    const [step] = pathTo(current, target)
    const response = await browserApi(page, token, '/api/worlds/me/move', {
      method: 'POST',
      body: { targetX: step.x, targetY: step.y },
    })
    expect(response.status).toBe(200)
    if (!response.body.accepted && response.body.reason === 'NPC_BLOCKED') continue
    expect(response.body.accepted).toBe(true)
  }
  throw new Error(`Could not route player to ${target.x},${target.y} after NPC replanning`)
}

async function placeNextToNpc(page, token, assetType) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const current = await state(page, token)
    const npc = current.npcPositions.find((candidate) => candidate.assetType === assetType)
    expect(npc).toBeTruthy()
    const candidates = [
      { x: npc.x + 1, y: npc.y },
      { x: npc.x - 1, y: npc.y },
      { x: npc.x, y: npc.y + 1 },
      { x: npc.x, y: npc.y - 1 },
    ]
    for (const candidate of candidates) {
      try {
        pathTo(current, candidate)
      } catch {
        continue
      }
      await routePlayer(page, token, candidate)
      await syncVillage(page)
      const prompt = page.locator(
        `.village-interaction-prompt[data-target-asset-type="${assetType}"]`,
      )
      if (await prompt.count() === 1) return prompt.getByRole('button')
    }
  }
  throw new Error(`No server-authoritative interaction position found for ${assetType}`)
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

for (const { viewport, fixture: touchFixture } of touchViewports) {
  test(`touch responsive QA ${viewport.width}x${viewport.height}`, async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    try {
      const token = await enterVillage(page, touchFixture)
      await routePlayer(page, token, { x: 0, y: 7 })
      await syncVillage(page)

      await expect.poll(() => page.evaluate(
        () => window.matchMedia('(pointer: coarse)').matches,
      )).toBe(true)
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

      await routePlayer(page, token, { x: 11, y: 8 })
      await syncVillage(page)
      const inspectTriggers = page.locator('.tile-interaction')
      const visibleInspectIndex = await inspectTriggers.evaluateAll((elements) => elements.findIndex((element) => {
        const rect = element.getBoundingClientRect()
        return rect.left >= 0
          && rect.top >= 0
          && rect.right <= window.innerWidth
          && rect.bottom <= window.innerHeight
      }))
      expect(visibleInspectIndex).toBeGreaterThanOrEqual(0)
      const inspectTrigger = inspectTriggers.nth(visibleInspectIndex)
      await inspectTrigger.click({ force: true })
      const inspectPanel = page.locator('.tile-inspect-panel')
      await expect(inspectPanel).toBeVisible()
      const inspectBox = await inspectPanel.boundingBox()
      expect(withinViewport(inspectBox, viewport)).toBe(true)
      await page.getByRole('button', { name: '타일 정보 닫기' }).click()

      const dialogueButton = await placeNextToNpc(page, token, 'DEFAULT_NPC_GUIDE')
      await expect(dialogueButton).toHaveAccessibleName('마을 안내자 · 대화하기')
      await dialogueButton.click()
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

      await testInfo.attach(`compact-village-touch-${viewport.width}x${viewport.height}`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: 'image/png',
      })
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
