import { expect, test } from '@playwright/test'
import {
  API_URL,
  FRONTEND_URL,
  createE2EFixture,
  provisionLocalFixture,
} from './village-e2e-fixture'
import {
  resolveContextualInteraction,
  resolveHudInteraction,
  selectCurrentHudInteraction,
} from '../src/components/village/contextualInteraction'

const fixture = createE2EFixture('village-contextual')

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
    return { status: response.status, body: await response.json() }
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

function coordinateKey(x, y) {
  return `${x}:${y}`
}

function pathTo(state, target) {
  const walkable = new Set(state.terrainTiles
    .filter((tile) => tile.walkable)
    .map((tile) => coordinateKey(tile.x, tile.y)))
  const queue = [{ ...state.playerPosition, path: [] }]
  const seen = new Set([coordinateKey(state.playerPosition.x, state.playerPosition.y)])
  const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]

  while (queue.length) {
    const current = queue.shift()
    if (current.x === target.x && current.y === target.y) return current.path
    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y }
      const nextKey = coordinateKey(next.x, next.y)
      if (seen.has(nextKey) || !walkable.has(nextKey)) continue
      seen.add(nextKey)
      queue.push({ ...next, path: [...current.path, next] })
    }
  }
  throw new Error(`No path to ${target.x},${target.y}`)
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
  const after = await worldState(page, token)
  expect(after.playerPosition).toEqual(target)
}

async function placeAndSync(page, token, target) {
  await routePlayer(page, token, target)
  await syncVillage(page)
}

async function expectSinglePrompt(page, expected) {
  const prompt = page.locator('.village-interaction-prompt')
  await expect(prompt).toHaveCount(1)
  await expect(prompt).toHaveAttribute('data-interaction-type', expected.type)
  if (expected.category) await expect(prompt).toHaveAttribute('data-interaction-category', expected.category)
  if (expected.asset) await expect(prompt).toHaveAttribute('data-target-asset-type', expected.asset)
  const button = prompt.getByRole('button')
  await expect(button).toHaveAccessibleName(`${expected.name} · ${expected.action}`)
  return button
}

function withinViewport(box, viewport) {
  return Boolean(box)
    && box.x >= 0
    && box.y >= 0
    && box.x + box.width <= viewport.width
    && box.y + box.height <= viewport.height
}

function overlaps(left, right) {
  if (!left || !right) return false
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y
}

test('uses safe fallbacks for incomplete or unknown interaction metadata', async () => {
  expect(selectCurrentHudInteraction(null)).toBeNull()
  expect(resolveHudInteraction({ type: 'INTERACT' })).toEqual({
    displayName: '살펴볼 대상',
    actionLabel: '살펴보기',
  })
  expect(resolveContextualInteraction({
    type: 'INTERACT',
    category: 'FUTURE_CATEGORY',
    targetAssetType: 'FUTURE_ASSET',
  })).toMatchObject({
    displayName: '살펴볼 대상',
    actionLabel: '살펴보기',
    description: '마을에 놓인 대상을 천천히 살펴보세요.',
    primaryActionLabel: null,
  })
})

test('uses one server-ordered HUD prompt for TALK and INTERACT', async ({ page }, testInfo) => {
  const token = await enterVillage(page)

  await placeAndSync(page, token, { x: 10, y: 7 })
  await expectSinglePrompt(page, {
    type: 'TALK',
    asset: 'DEFAULT_NPC_GUIDE',
    name: '마을 안내자',
    action: '대화하기',
  })
  await expect(page.locator('.village-interaction-prompt button')).toHaveCount(1)

  await placeAndSync(page, token, { x: 4, y: 9 })
  await expectSinglePrompt(page, {
    type: 'INTERACT',
    category: 'FARM',
    asset: 'FARM_PLOT_EMPTY',
    name: '비어 있는 밭',
    action: '살펴보기',
  })
  await expect(page.locator('.village-interaction-prompt button')).toHaveCount(1)
  const runtimeState = await worldState(page, token)
  const runtimeInteraction = runtimeState.availableInteractions.find((interaction) => (
    interaction.type === 'INTERACT' && interaction.targetAssetType === 'FARM_PLOT_EMPTY'
  ))
  expect(runtimeInteraction).toMatchObject({
    type: 'INTERACT',
    available: true,
    targetAssetType: 'FARM_PLOT_EMPTY',
    displayName: '비어 있는 밭',
    category: 'FARM',
    actionLabel: '살펴보기',
  })
  await testInfo.attach('actual-interact-payload', {
    body: Buffer.from(JSON.stringify(runtimeInteraction, null, 2)),
    contentType: 'application/json',
  })
})

test('empty farm contextual CTA enters capture without persistence requests', async ({ page }) => {
  const token = await enterVillage(page)
  await placeAndSync(page, token, { x: 4, y: 9 })

  const prompt = await expectSinglePrompt(page, {
    type: 'INTERACT', category: 'FARM', asset: 'FARM_PLOT_EMPTY', name: '비어 있는 밭', action: '살펴보기',
  })
  await prompt.click()
  const panel = page.getByRole('region', { name: '비어 있는 밭 살펴보기' })
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('아직 아무 기억도 심어지지 않은 밭이에요.')

  const requests = []
  const collect = (request) => {
    if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
      requests.push({ method: request.method(), url: request.url() })
    }
  }
  page.on('request', collect)
  await panel.getByRole('button', { name: '사진으로 기억 심기' }).click()
  await expect(page.getByLabel('따뜻한 숲과 노을을 담는 카메라 화면')).toBeVisible()
  await page.waitForTimeout(300)
  page.off('request', collect)

  const mutations = requests.filter(({ method, url }) => method === 'POST' && (
    url.includes('/plant') || url.endsWith('/api/photos') || url.includes('/recognize') || url.includes('world-change')
  ))
  expect(mutations).toEqual([])

  await page.keyboard.press('Escape')
  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(panel).toHaveCount(0)
})

test('renders asset-specific crop contextual panels', async ({ page }) => {
  const token = await enterVillage(page)
  const cases = [
    { player: { x: 2, y: 11 }, asset: 'FARM_CARROT', name: '당근밭', copy: '당근이 건강하게 자라고 있어요.' },
    { player: { x: 7, y: 9 }, asset: 'FARM_TOMATO', name: '토마토밭', copy: '토마토가 햇빛을 받으며 익어가고 있어요.' },
    { player: { x: 9, y: 9 }, asset: 'FARM_CABBAGE', name: '양배추밭', copy: '양배추 잎이 단단하게 여물고 있어요.' },
  ]

  for (const item of cases) {
    await placeAndSync(page, token, item.player)
    const prompt = await expectSinglePrompt(page, {
      type: 'INTERACT', category: 'CROP', asset: item.asset, name: item.name, action: '작물 살펴보기',
    })
    await prompt.click()
    const panel = page.getByRole('region', { name: `${item.name} 살펴보기` })
    await expect(panel).toContainText(item.copy)
    await expect(panel.getByRole('button', { name: '사진으로 기억 심기' })).toHaveCount(0)
    await panel.getByRole('button', { name: `${item.name} 정보 닫기` }).click()
  }
})

test('renders dog, cat, and bird contextual panels without TALK conversion', async ({ page }) => {
  const token = await enterVillage(page)
  const cases = [
    { player: { x: 17, y: 10 }, asset: 'DEFAULT_DOG', name: '강아지', copy: '마을을 지켜보며 조용히 쉬고 있는 강아지예요.' },
    { player: { x: 18, y: 10 }, asset: 'DEFAULT_CAT', name: '고양이', copy: '따뜻한 햇볕 아래에서 편안히 쉬고 있는 고양이예요.' },
    { player: { x: 19, y: 9 }, asset: 'DEFAULT_BIRD', name: '새', copy: '마을의 작은 소리를 들으며 주변을 바라보는 새예요.' },
  ]

  for (const item of cases) {
    await placeAndSync(page, token, item.player)
    const prompt = await expectSinglePrompt(page, {
      type: 'INTERACT', category: 'ANIMAL', asset: item.asset, name: item.name, action: '다가가기',
    })
    await prompt.click()
    const panel = page.getByRole('region', { name: `${item.name} 살펴보기` })
    await expect(panel).toContainText(item.copy)
    await expect(panel).toHaveAttribute('data-interaction-category', 'ANIMAL')
    await panel.getByRole('button', { name: `${item.name} 정보 닫기` }).click()
  }
})

test('renders the community house panel and closes contextual UI on range exit', async ({ page }) => {
  const token = await enterVillage(page)
  await placeAndSync(page, token, { x: 7, y: 3 })
  const communityPrompt = await expectSinglePrompt(page, {
    type: 'INTERACT', category: 'COMMUNITY', asset: 'COMMUNITY_HOUSE', name: '마을 회관', action: '둘러보기',
  })
  await communityPrompt.click()
  const communityPanel = page.getByRole('region', { name: '커뮤니티 하우스 살펴보기' })
  await expect(communityPanel).toContainText('친구들의 기억과 활동이 모이는 마을 공간이에요.')
  await page.keyboard.press('Escape')
  await expect(communityPanel).toHaveCount(0)

  await placeAndSync(page, token, { x: 3, y: 8 })
  const farmPrompt = await expectSinglePrompt(page, {
    type: 'INTERACT', category: 'FARM', asset: 'FARM_PLOT_EMPTY', name: '비어 있는 밭', action: '살펴보기',
  })
  await farmPrompt.click()
  const farmPanel = page.getByRole('region', { name: '비어 있는 밭 살펴보기' })
  await expect(farmPanel).toBeVisible()
  await page.keyboard.down('ArrowUp')
  await page.waitForTimeout(280)
  await page.keyboard.up('ArrowUp')
  await page.waitForTimeout(900)
  await expect(farmPanel).toHaveCount(0)
  await expect(page.locator('.village-interaction-prompt[data-target-asset-type="FARM_PLOT_EMPTY"]')).toHaveCount(0)
})

test('coordinates INSPECT, CONTEXTUAL, DIALOGUE, and MEMORY_UPLOAD panels', async ({ page }) => {
  const token = await enterVillage(page)

  await placeAndSync(page, token, { x: 3, y: 7 })
  await page.locator('.tile-interaction').first().click({ force: true })
  const inspect = page.locator('.tile-inspect-panel')
  await expect(inspect).toBeVisible()
  await page.keyboard.press('ArrowDown', { delay: 30 })
  await page.waitForTimeout(850)
  const contextualPrompt = await expectSinglePrompt(page, {
    type: 'INTERACT', category: 'FARM', asset: 'FARM_PLOT_EMPTY', name: '비어 있는 밭', action: '살펴보기',
  })
  await contextualPrompt.click()
  await expect(inspect).toHaveCount(0)
  await expect(page.getByRole('region', { name: '비어 있는 밭 살펴보기' })).toBeVisible()

  await placeAndSync(page, token, { x: 17, y: 10 })
  const animalPrompt = await expectSinglePrompt(page, {
    type: 'INTERACT', category: 'ANIMAL', asset: 'DEFAULT_DOG', name: '강아지', action: '다가가기',
  })
  await animalPrompt.click()
  await expect(page.getByRole('region', { name: '강아지 살펴보기' })).toBeVisible()
  await page.keyboard.press('ArrowUp', { delay: 30 })
  await page.waitForTimeout(800)
  await page.keyboard.press('ArrowUp', { delay: 30 })
  await page.waitForTimeout(850)
  const talkPrompt = await expectSinglePrompt(page, {
    type: 'TALK', asset: 'DEFAULT_NPC_ANIMAL_CARETAKER', name: '동물 돌봄이', action: '대화하기',
  })
  await talkPrompt.click()
  await expect(page.locator('.contextual-interaction-panel')).toHaveCount(0)
  const dialogue = page.getByRole('region', { name: '동물 돌봄이와의 대화' })
  await expect(dialogue).toBeVisible()

  await page.getByRole('button', { name: '오늘의 순간 남기기' }).click()
  await expect(dialogue).toHaveCount(0)
  await expect(page.getByLabel('따뜻한 숲과 노을을 담는 카메라 화면')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(page.locator('.npc-dialogue-panel,.tile-inspect-panel')).toHaveCount(0)
})

for (const viewport of [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`contextual prompt and panel remain touch-safe at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
    const page = await context.newPage()
    try {
      const token = await enterVillage(page)
      await placeAndSync(page, token, { x: 4, y: 9 })

      const media = await page.evaluate(() => ({
        coarse: matchMedia('(pointer: coarse)').matches,
        hoverNone: matchMedia('(hover: none)').matches,
        touchPoints: navigator.maxTouchPoints,
      }))
      expect(media).toMatchObject({ coarse: true, hoverNone: true })
      expect(media.touchPoints).toBeGreaterThan(0)

      const promptButton = await expectSinglePrompt(page, {
        type: 'INTERACT', category: 'FARM', asset: 'FARM_PLOT_EMPTY', name: '비어 있는 밭', action: '살펴보기',
      })
      const promptBox = await page.locator('.village-interaction-prompt').boundingBox()
      const joystickBox = await page.locator('.virtual-joystick').boundingBox()
      expect(withinViewport(promptBox, viewport)).toBe(true)
      expect(overlaps(promptBox, joystickBox)).toBe(false)

      await promptButton.click()
      const panel = page.getByRole('region', { name: '비어 있는 밭 살펴보기' })
      await expect(panel).toBeVisible()
      const panelBox = await panel.boundingBox()
      expect(withinViewport(panelBox, viewport)).toBe(true)
      await expect(panel.getByRole('button', { name: '사진으로 기억 심기' })).toBeVisible()
      await expect(panel.getByRole('button', { name: '비어 있는 밭 정보 닫기' })).toBeVisible()
      await panel.getByRole('button', { name: '비어 있는 밭 정보 닫기' }).click()

      await placeAndSync(page, token, { x: 0, y: 7 })
      const before = await worldState(page, token)
      const client = await context.newCDPSession(page)
      const start = { x: 64, y: viewport.height - 90 }
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ ...start, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
      })
      await client.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: start.x + 46, y: start.y, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
      })
      await page.waitForTimeout(800)
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      await page.waitForTimeout(700)
      const after = await worldState(page, token)
      expect(after.playerPosition.x).toBeGreaterThan(before.playerPosition.x)

      const overflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth > window.innerWidth,
        vertical: document.documentElement.scrollHeight > window.innerHeight,
      }))
      expect(overflow).toEqual({ horizontal: false, vertical: false })
    } finally {
      await context.close()
    }
  })
}
