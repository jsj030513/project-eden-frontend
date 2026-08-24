import { expect, test } from '@playwright/test'
import {
  API_URL,
  FRONTEND_URL,
  createE2EFixture,
  provisionLocalFixture,
} from './village-e2e-fixture'
import {
  normalizeVillageHistory,
  resolveAnimalCopy,
  selectRecentVillageHistory,
} from '../src/components/village/contextualInteraction'
import { configureResourceStableRendering } from './village-resource-stable-rendering'

const PNG_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)
const runtimeIssuesByPage = new WeakMap()
const controlRequestByPage = new WeakMap()
test.afterEach(async ({ page }) => {
  expect(runtimeIssuesByPage.get(page) ?? []).toEqual([])
})

function trackRuntimeIssues(page) {
  if (runtimeIssuesByPage.has(page)) return runtimeIssuesByPage.get(page)
  const issues = []
  runtimeIssuesByPage.set(page, issues)
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    const text = message.text()
    if (message.type() === 'error'
      || (message.type() === 'warning'
        && /(react|key|duplicate|hydration|module|accessib)/i.test(text))) {
      issues.push(`${message.type()}: ${text}`)
    }
  })
  return issues
}

async function createHistory(request, token, fileName) {
  const upload = await request.post(`${API_URL}/api/photos`, {
    headers: { Authorization: `Bearer ${token}` },
    multipart: {
      file: {
        name: fileName,
        mimeType: 'image/png',
        buffer: PNG_BUFFER,
      },
    },
  })
  expect(upload.status()).toBe(201)
  const uploaded = await upload.json()
  const photoId = uploaded.photoId ?? uploaded.id
  expect(photoId).toBeTruthy()
  const recognition = await request.post(`${API_URL}/api/photos/${photoId}/recognize`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(recognition.status()).toBe(200)
}

async function provisionCommunityFixture(request, suiteName, { history = false } = {}) {
  const fixture = createE2EFixture(suiteName)
  const provisioned = await provisionLocalFixture(request, fixture)
  if (history) {
    await createHistory(request, provisioned.token, `${suiteName}-one.png`)
    await createHistory(request, provisioned.token, `${suiteName}-two.png`)
  }
  return { fixture, provisioned }
}

async function dismissOnboarding(page) {
  const explore = page.getByRole('button', { name: '천천히 둘러보기' })
  if (await explore.isVisible().catch(() => false)) await explore.click()
  const later = page.getByRole('button', { name: '지금은 둘러볼게요' })
  if (await later.isVisible().catch(() => false)) await later.click()
}

function observeChunkHydration(page) {
  let resolveSuccessfulResponse
  const successfulResponse = new Promise((resolve) => { resolveSuccessfulResponse = resolve })
  const isChunkRequest = (request) => request.method() === 'GET'
    && request.url().includes('/api/worlds/me/chunks?')
  const onResponse = (response) => {
    if (isChunkRequest(response.request()) && response.ok()) resolveSuccessfulResponse(response)
  }
  page.on('response', onResponse)
  return {
    async wait() {
      const payload = await (await successfulResponse).json()
      expect(payload.chunks.length).toBeGreaterThan(0)
      expect(payload.chunks.flatMap((chunk) => chunk.terrain || []).length).toBeGreaterThan(0)
      page.off('response', onResponse)
      return payload
    },
  }
}

function observeFirstWorldState(page) {
  let resolveResponse
  const firstResponse = new Promise((resolve) => { resolveResponse = resolve })
  const onResponse = (response) => {
    const request = response.request()
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/worlds/me/state') {
      resolveResponse(response)
    }
  }
  page.on('response', onResponse)
  return {
    async wait() {
      const response = await firstResponse
      const payload = await response.json().catch(() => null)
      page.off('response', onResponse)
      expect(response.status(), `first /state response: ${JSON.stringify(payload)}`).toBe(200)
      expect(payload?.worldId, 'first /state must identify the authenticated world').toBeTruthy()
      expect(payload?.terrainTiles?.length, 'first /state must return canonical terrain').toBeGreaterThanOrEqual(384)
      expect(payload?.placedObjects?.length, 'first /state must return canonical objects').toBeGreaterThanOrEqual(35)
      expect(payload?.npcPositions?.length, 'first /state must return canonical NPC runtime').toBe(4)
      return payload
    },
  }
}

async function enterVillage(page, fixture, request) {
  trackRuntimeIssues(page)
  await configureResourceStableRendering(page)
  if (request) controlRequestByPage.set(page, request)
  const firstWorldState = observeFirstWorldState(page)
  const chunkHydration = observeChunkHydration(page)
  await page.goto(FRONTEND_URL)
  const enter = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enter.isVisible().catch(() => false)) await enter.click()
  const email = page.getByRole('textbox', { name: '이메일' })
  if (await email.isVisible().catch(() => false)) {
    await email.fill(fixture.email)
    await page.getByRole('textbox', { name: '비밀번호' }).fill(fixture.password)
    await page.getByRole('button', { name: '들어가기' }).click()
  }
  const statePayload = await firstWorldState.wait()
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', /^(384|448|512|576|640|704|768|832|896|960|1024|1088|1152|1216|1280)$/)
  const chunkPayload = await chunkHydration.wait()
  expect(String(chunkPayload.world?.worldId), 'first /chunks must match first /state world').toBe(String(statePayload.worldId))
  await dismissOnboarding(page)
  const token = await page.evaluate(() => sessionStorage.getItem('projectEdenAccessToken'))
  expect(token).toBeTruthy()
  return token
}

async function syncVillage(page) {
  const firstWorldState = observeFirstWorldState(page)
  const chunkHydration = observeChunkHydration(page)
  await page.reload()
  const enter = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enter.isVisible().catch(() => false)) await enter.click()
  const statePayload = await firstWorldState.wait()
  try {
    await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', /^(384|448|512|576|640|704|768|832|896|960|1024|1088|1152|1216|1280)$/)
  } catch (error) {
    const diagnostics = await page.evaluate(() => window.__edenPhase3cDiagnostics ?? null).catch(() => null)
    throw new Error(`${error.message}\nHydration diagnostics: ${JSON.stringify(diagnostics)}\nCanonical state: ${JSON.stringify({ worldId: statePayload.worldId, terrain: statePayload.terrainTiles?.length, objects: statePayload.placedObjects?.length })}`)
  }
  const chunkPayload = await chunkHydration.wait()
  expect(String(chunkPayload.world?.worldId), 'reload /chunks must match reload /state world').toBe(String(statePayload.worldId))
  await dismissOnboarding(page)
}

async function browserApi(page, token, path, { method = 'GET', body } = {}) {
  // Test control traffic must not contend with the page's live chunk/state
  // hydration connection lifecycle. It still exercises the real HTTP API and
  // the same bearer identity, but remains usable while the page navigates.
  const request = controlRequestByPage.get(page) ?? page.context().request
  const response = await request.fetch(`${API_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { data: body }),
  })
  const text = await response.text()
  return { status: response.status(), body: text ? JSON.parse(text) : null }
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
  const npcTiles = new Set((state.npcPositions || []).map((npc) => coordinateKey(npc.x, npc.y)))
  const queue = [{ ...state.playerPosition, path: [] }]
  const seen = new Set([coordinateKey(state.playerPosition.x, state.playerPosition.y)])
  const directions = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]

  while (queue.length) {
    const current = queue.shift()
    if (current.x === target.x && current.y === target.y) return current.path
    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y }
      const nextKey = coordinateKey(next.x, next.y)
      if (seen.has(nextKey) || !walkable.has(nextKey) || npcTiles.has(nextKey)) continue
      seen.add(nextKey)
      queue.push({ ...next, path: [...current.path, next] })
    }
  }
  throw new Error(`No path to ${target.x},${target.y}`)
}

async function routePlayer(page, token, target) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = await worldState(page, token)
    if (current.playerPosition.x === target.x && current.playerPosition.y === target.y) return
    const route = pathTo(current, target)
    let blockedByNpc = false
    for (const step of route) {
      const response = await browserApi(page, token, '/api/worlds/me/move', {
        method: 'POST',
        body: { targetX: step.x, targetY: step.y },
      })
      expect(response.status).toBe(200)
      if (!response.body.accepted && response.body.reason === 'NPC_BLOCKED') {
        blockedByNpc = true
        break
      }
      expect(response.body.accepted).toBe(true)
    }
    if (!blockedByNpc) return
  }
  throw new Error(`Could not route player to ${target.x},${target.y} after NPC replanning`)
}

function cardinalCandidates(object) {
  const target = { x: Math.floor(object.x / 48), y: Math.floor(object.y / 48) }
  return [
    { x: target.x + 1, y: target.y },
    { x: target.x - 1, y: target.y },
    { x: target.x, y: target.y + 1 },
    { x: target.x, y: target.y - 1 },
  ]
}

async function placeNextToAsset(page, token, assetType, occurrence = 0) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const state = await worldState(page, token)
    const runtimeObjects = (state.npcPositions || [])
      .filter((object) => object.assetType === assetType)
      .map((object) => ({
        ...object,
        id: object.objectId,
        x: object.pixelX,
        y: object.pixelY,
      }))
    const matchingObjects = runtimeObjects.length
      ? runtimeObjects
      : state.placedObjects
        .filter((object) => object.assetType === assetType)
        .sort((left, right) => left.id - right.id)
    expect(matchingObjects.length).toBeGreaterThan(occurrence)
    const object = matchingObjects[occurrence]

    const interactionCandidates = assetType === 'COMMUNITY_HOUSE'
      ? [{ x: 14, y: 7 }]
      : cardinalCandidates(object)
    for (const adjacent of interactionCandidates) {
      try {
        pathTo(state, adjacent)
        await routePlayer(page, token, adjacent)
      } catch {
        continue
      }
      const positioned = await worldState(page, token)
      const targetAvailable = positioned.availableInteractions.some((interaction) => (
        interaction.available === true
          && (interaction.type === 'TALK' || interaction.type === 'INTERACT')
          && interaction.targetId === object.id
      ))
      if (targetAvailable) {
        // Movement is driven through the real API so the page has no local input
        // session to close. Rehydrate once from the authoritative state instead
        // of waiting for the unrelated 5.5s background refresh interval.
        await syncVillage(page)
        const renderedPrompt = page.locator(
          `.village-interaction-prompt[data-target-asset-type="${assetType}"]`,
        )
        if (await renderedPrompt.count() === 1) return { object, adjacent }
      }
    }
  }
  throw new Error(`No server-authoritative interaction position found for ${assetType}`)
}

async function openTouchInteraction(page, token, assetType, name, action) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const state = await worldState(page, token)
    const runtimeObjects = (state.npcPositions || [])
      .filter((object) => object.assetType === assetType)
      .map((object) => ({ ...object, id: object.objectId, x: object.pixelX, y: object.pixelY }))
    const object = (runtimeObjects.length ? runtimeObjects : state.placedObjects
      .filter((candidate) => candidate.assetType === assetType)
      .sort((left, right) => left.id - right.id))[0]
    expect(object).toBeTruthy()
    const candidates = assetType === 'COMMUNITY_HOUSE'
      ? [{ x: 14, y: 7 }]
      : cardinalCandidates(object)
    for (const adjacent of candidates) {
      try {
        pathTo(state, adjacent)
        await routePlayer(page, token, adjacent)
      } catch {
        continue
      }
      const positioned = await worldState(page, token)
      const targetAvailable = positioned.availableInteractions.some((interaction) => (
        interaction.available === true
          && (interaction.type === 'TALK' || interaction.type === 'INTERACT')
          && String(interaction.targetId) === String(object.id)
      ))
      if (!targetAvailable) continue
      await syncVillage(page)
      const prompt = page.locator(
        `.village-interaction-prompt[data-target-asset-type="${assetType}"]`,
      )
      if (await prompt.count() !== 1) continue
      await expect(prompt.getByRole('button')).toHaveAccessibleName(`${name} · ${action}`)
      await prompt.getByRole('button').tap()
      return
    }
  }
  throw new Error(`Moving interaction target never stabilized for ${assetType}`)
}

async function expectPrompt(page, { assetType, name, action }) {
  const prompt = page.locator(`.village-interaction-prompt[data-target-asset-type="${assetType}"]`)
  await expect(prompt).toHaveCount(1)
  const button = prompt.getByRole('button')
  await expect(button).toHaveAccessibleName(`${name} · ${action}`)
  return button
}

function observeRequests(page) {
  const requests = []
  const listener = (request) => {
    if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
      requests.push({ method: request.method(), url: request.url() })
    }
  }
  page.on('request', listener)
  return {
    requests,
    stop: () => page.off('request', listener),
  }
}

function unexpectedMutations(requests) {
  return requests.filter(({ method, url }) => method === 'POST'
    && !url.endsWith('/api/worlds/me/move')
    && !/\/api\/worlds\/me\/interactions\/\d+\/progress$/.test(url))
}

function interactionProgressMutations(requests) {
  return requests.filter(({ method, url }) => method === 'POST'
    && /\/api\/worlds\/me\/interactions\/\d+\/progress$/.test(url))
}

function withinViewport(box, viewport) {
  return Boolean(box)
    && box.x >= 0
    && box.y >= 0
    && box.x + box.width <= viewport.width
    && box.y + box.height <= viewport.height
}

function fixtureScenario(title, setup, scenario) {
  test.describe(title, () => {
    let prepared
    test.beforeAll(async ({ request }) => {
      prepared = await setup(request)
    })
    test(title, async ({ page, request }) => scenario({ page, request }, prepared))
  })
}

test('normalizes malformed history, keeps stable latest three, and resolves animal copy', () => {
  expect(normalizeVillageHistory(undefined)).toEqual([])
  expect(normalizeVillageHistory(null)).toEqual([])
  expect(normalizeVillageHistory({ message: 'not-an-array' })).toEqual([])
  expect(normalizeVillageHistory([null, {}, { message: '   ' }])).toEqual([])

  const selected = selectRecentVillageHistory([
    { id: 7, message: 'old', createdAt: '2026-01-01T00:00:00' },
    { id: 7, message: 'new-a', createdAt: '2026-01-04T00:00:00' },
    { id: 7, message: 'new-b', createdAt: '2026-01-04T00:00:00' },
    { message: 'middle', createdAt: '2026-01-03T00:00:00' },
    { message: 'missing-time' },
  ])
  expect(selected.map((item) => item.message)).toEqual(['new-a', 'new-b', 'middle'])
  expect(new Set(selected.map((item) => item.key)).size).toBe(3)
  expect(resolveAnimalCopy('DEFAULT_DOG').displayName).toBe('강아지')
  expect(resolveAnimalCopy('DEFAULT_CAT').displayName).toBe('고양이')
  expect(resolveAnimalCopy('DEFAULT_BIRD').displayName).toBe('새')
  expect(resolveAnimalCopy('FUTURE_ANIMAL')).toEqual({
    displayName: '동물 친구',
    description: '마을에서 지내는 동물 친구예요.',
  })
})

fixtureScenario('shows only the authenticated user latest three community records and returns focus on close', async (request) => {
  const own = await provisionCommunityFixture(request, 'community-history', { history: true })
  const foreign = await provisionCommunityFixture(request, 'community-foreign')
  await createHistory(request, foreign.provisioned.token, 'dog-foreign-user.png')
  return own
}, async ({ page, request }, { fixture }) => {
  const token = await enterVillage(page, fixture, request)
  const ownHistory = await browserApi(page, token, '/api/village/history')
  expect(ownHistory.status).toBe(200)
  expect(ownHistory.body.length).toBeGreaterThan(3)
  const expected = selectRecentVillageHistory(ownHistory.body)

  await placeNextToAsset(page, token, 'COMMUNITY_HOUSE')
  const prompt = await expectPrompt(page, {
    assetType: 'COMMUNITY_HOUSE', name: '마을 회관', action: '둘러보기',
  })
  const observer = observeRequests(page)
  await prompt.click()
  const panel = page.getByRole('region', { name: '커뮤니티 하우스 살펴보기' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('heading', { name: '최근 마을 기록' })).toBeVisible()
  const items = panel.locator('.community-history-summary li')
  await expect(items).toHaveCount(3)
  await expect(items.locator('span')).toHaveText(expected.map((item) => item.message))
  await expect(panel).not.toContainText('새들이 머무를 작은 자리가 생겼습니다.')
  await panel.getByRole('button', { name: '커뮤니티 하우스 정보 닫기' }).click()
  await expect(panel).toHaveCount(0)
  await expect(prompt).toBeFocused()
  observer.stop()
  expect(interactionProgressMutations(observer.requests)).toHaveLength(1)
  expect(unexpectedMutations(observer.requests)).toEqual([])
})

fixtureScenario('renders the community empty state and safely skips malformed history items',
  (request) => provisionCommunityFixture(request, 'community-empty'), async ({ page, request }, { fixture }) => {
  await page.route('**/api/village/history', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([null, {}, { message: ' ' }, { message: null, createdAt: 'invalid' }]),
    })
  })
  const token = await enterVillage(page, fixture, request)
  await placeNextToAsset(page, token, 'COMMUNITY_HOUSE')
  const prompt = await expectPrompt(page, {
    assetType: 'COMMUNITY_HOUSE', name: '마을 회관', action: '둘러보기',
  })
  await prompt.click()
  const panel = page.getByRole('region', { name: '커뮤니티 하우스 살펴보기' })
  await expect(panel).toContainText('아직 마을에 기록된 기억이 없어요.')
  await expect(panel).toContainText('사진으로 기억을 남기면 이곳에서 다시 볼 수 있어요.')
  await expect(panel.locator('.community-history-summary li')).toHaveCount(0)
  await expect(page.locator('[role="alert"]')).toHaveCount(0)
})

fixtureScenario('closes community on Escape and range exit, then allows re-entry',
  (request) => provisionCommunityFixture(request, 'community-reentry', { history: true }),
  async ({ page, request }, { fixture }) => {
  const token = await enterVillage(page, fixture, request)
  const { object, adjacent } = await placeNextToAsset(page, token, 'COMMUNITY_HOUSE')
  const prompt = await expectPrompt(page, {
    assetType: 'COMMUNITY_HOUSE', name: '마을 회관', action: '둘러보기',
  })
  await prompt.click()
  const panel = page.getByRole('region', { name: '커뮤니티 하우스 살펴보기' })
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(prompt).toBeFocused()

  await prompt.click()
  const target = { x: Math.floor(object.x / 48), y: Math.floor(object.y / 48) }
  const away = {
    x: adjacent.x + Math.sign(adjacent.x - target.x) * 2,
    y: adjacent.y + Math.sign(adjacent.y - target.y) * 2,
  }
  const state = await worldState(page, token)
  let exit = away
  try {
    pathTo(state, exit)
  } catch {
    exit = state.terrainTiles.find((tile) => tile.walkable
      && Math.abs(tile.x - target.x) + Math.abs(tile.y - target.y) > 2)
  }
  await routePlayer(page, token, exit)
  await syncVillage(page)
  await expect(panel).toHaveCount(0)
  await placeNextToAsset(page, token, 'COMMUNITY_HOUSE')
  await expectPrompt(page, {
    assetType: 'COMMUNITY_HOUSE', name: '마을 회관', action: '둘러보기',
  })
})

fixtureScenario('opens Dog, Cat, and Bird as distinct read-only accessible panels',
  (request) => provisionCommunityFixture(request, 'animal-panels'), async ({ page, request }, { fixture }) => {
  const token = await enterVillage(page, fixture, request)
  const cases = [
    {
      assetType: 'DEFAULT_DOG',
      name: '강아지',
      description: '마을을 지켜보며 조용히 쉬고 있는 강아지예요.',
    },
    {
      assetType: 'DEFAULT_CAT',
      name: '고양이',
      description: '따뜻한 햇볕 아래에서 편안히 쉬고 있는 고양이예요.',
    },
    {
      assetType: 'DEFAULT_BIRD',
      name: '새',
      description: '마을의 작은 소리를 들으며 주변을 바라보는 새예요.',
    },
  ]

  for (const item of cases) {
    await placeNextToAsset(page, token, item.assetType)
    const prompt = await expectPrompt(page, { ...item, action: '다가가기' })
    const observer = observeRequests(page)
    await prompt.click()
    const panel = page.getByRole('region', { name: `${item.name} 살펴보기` })
    await expect(panel.getByRole('heading', { name: item.name })).toBeVisible()
    await expect(panel).toContainText(item.description)
    await expect(panel.locator('.npc-dialogue-panel__actions button')).toHaveCount(1)
    await panel.getByRole('button', { name: `${item.name} 정보 닫기` }).click()
    await expect(prompt).toBeFocused()
    observer.stop()
    expect(interactionProgressMutations(observer.requests)).toHaveLength(1)
    expect(unexpectedMutations(observer.requests)).toEqual([])
  }
})

fixtureScenario('closes Dog, Cat, and Bird on Escape and range exit, then allows re-entry',
  (request) => provisionCommunityFixture(request, 'animal-reentry'), async ({ page, request }, { fixture }) => {
  const token = await enterVillage(page, fixture, request)
  for (const animal of [
    { assetType: 'DEFAULT_DOG', name: '강아지' },
    { assetType: 'DEFAULT_CAT', name: '고양이' },
    { assetType: 'DEFAULT_BIRD', name: '새' },
  ]) {
    const { object, adjacent } = await placeNextToAsset(page, token, animal.assetType)
    const prompt = await expectPrompt(page, { ...animal, action: '다가가기' })
    await prompt.click()
    const panel = page.getByRole('region', { name: `${animal.name} 살펴보기` })
    await expect(panel).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(prompt).toBeFocused()

    await prompt.click()
    await expect(panel).toBeVisible()
    const target = { x: Math.floor(object.x / 48), y: Math.floor(object.y / 48) }
    const state = await worldState(page, token)
    const away = state.terrainTiles
      .filter((tile) => tile.walkable
        && Math.abs(tile.x - target.x) + Math.abs(tile.y - target.y) > 2
        && !(tile.x === adjacent.x && tile.y === adjacent.y))
      .sort((left, right) => (
        Math.abs(left.x - adjacent.x) + Math.abs(left.y - adjacent.y)
      ) - (
        Math.abs(right.x - adjacent.x) + Math.abs(right.y - adjacent.y)
      ))[0]
    expect(away).toBeTruthy()
    await routePlayer(page, token, away)
    await syncVillage(page)
    await expect(panel).toHaveCount(0)

    await placeNextToAsset(page, token, animal.assetType)
    const reentryPrompt = await expectPrompt(page, { ...animal, action: '다가가기' })
    await reentryPrompt.click()
    await expect(panel).toBeVisible()
    await panel.getByRole('button', { name: `${animal.name} 정보 닫기` }).click()
  }
})

fixtureScenario('switches Crop, Capture, Animal, and NPC panels without stale state',
  (request) => provisionCommunityFixture(request, 'panel-switch'), async ({ page, request }, { fixture }) => {
  const token = await enterVillage(page, fixture, request)
  await placeNextToAsset(page, token, 'FARM_CARROT')
  await (await expectPrompt(page, {
    assetType: 'FARM_CARROT', name: '당근밭', action: '작물 살펴보기',
  })).click()
  const crop = page.getByRole('region', { name: '당근밭 살펴보기' })
  await expect(crop).toBeVisible()

  await page.getByRole('button', { name: '오늘의 순간 남기기' }).click()
  await expect(crop).toHaveCount(0)
  await expect(page.getByLabel('따뜻한 숲과 노을을 담는 카메라 화면')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.contextual-interaction-panel')).toHaveCount(0)

  await placeNextToAsset(page, token, 'FARM_CARROT')
  await (await expectPrompt(page, {
    assetType: 'FARM_CARROT', name: '당근밭', action: '작물 살펴보기',
  })).click()
  await expect(page.getByRole('region', { name: '당근밭 살펴보기' })).toBeVisible()

  await placeNextToAsset(page, token, 'DEFAULT_DOG')
  await (await expectPrompt(page, {
    assetType: 'DEFAULT_DOG', name: '강아지', action: '다가가기',
  })).click()
  await expect(page.getByRole('region', { name: '당근밭 살펴보기' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: '강아지 살펴보기' })).toBeVisible()

  await placeNextToAsset(page, token, 'DEFAULT_NPC_ANIMAL_CARETAKER')
  const talk = await expectPrompt(page, {
    assetType: 'DEFAULT_NPC_ANIMAL_CARETAKER', name: '동물 돌봄이', action: '대화하기',
  })
  await expect(page.locator('.village-interaction-prompt')).toHaveAttribute('data-interaction-type', 'TALK')
  await talk.click()
  await expect(page.getByRole('region', { name: '강아지 살펴보기' })).toHaveCount(0)
  const dialogue = page.getByRole('region', { name: '동물 돌봄이와의 대화' })
  await expect(dialogue).toBeVisible()

  await placeNextToAsset(page, token, 'DEFAULT_CAT')
  await (await expectPrompt(page, {
    assetType: 'DEFAULT_CAT', name: '고양이', action: '다가가기',
  })).click()
  await expect(dialogue).toHaveCount(0)
  await expect(page.getByRole('region', { name: '고양이 살펴보기' })).toBeVisible()
})

for (const [viewport, animal] of [
  [{ width: 375, height: 667 }, { assetType: 'DEFAULT_DOG', name: '강아지' }],
  [{ width: 390, height: 844 }, { assetType: 'DEFAULT_CAT', name: '고양이' }],
  [{ width: 430, height: 932 }, { assetType: 'DEFAULT_BIRD', name: '새' }],
]) {
  test.describe(`touch viewport ${viewport.width}x${viewport.height}`, () => {
    let mobileFixture
    test.beforeAll(async ({ request }) => {
      mobileFixture = (await provisionCommunityFixture(
        request,
        `community-touch-${viewport.width}`,
      )).fixture
    })
    test(`keeps community and ${animal.name} panels touch-safe at ${viewport.width}x${viewport.height}`, async ({ browser, request }) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    try {
      const token = await enterVillage(page, mobileFixture, request)
      await expect.poll(() => page.evaluate(
        () => matchMedia('(pointer: coarse)').matches,
      )).toBe(true)
      const media = await page.evaluate(() => ({
        coarse: matchMedia('(pointer: coarse)').matches,
        hoverNone: matchMedia('(hover: none)').matches,
        touchPoints: navigator.maxTouchPoints,
      }))
      expect(media).toMatchObject({ coarse: true, hoverNone: true })
      expect(media.touchPoints).toBeGreaterThan(0)

      await openTouchInteraction(page, token, 'COMMUNITY_HOUSE', '마을 회관', '둘러보기')
      const community = page.getByRole('region', { name: '커뮤니티 하우스 살펴보기' })
      await expect(community.getByText('아직 마을에 기록된 기억이 없어요.')).toBeVisible()
      expect(withinViewport(await community.boundingBox(), viewport)).toBe(true)
      await community.getByRole('button', { name: '커뮤니티 하우스 정보 닫기' }).tap()

      await openTouchInteraction(page, token, animal.assetType, animal.name, '다가가기')
      const animalPanel = page.getByRole('region', { name: `${animal.name} 살펴보기` })
      await expect(animalPanel).toBeVisible()
      expect(withinViewport(await animalPanel.boundingBox(), viewport)).toBe(true)
      await page.keyboard.press('Escape')
      await expect(animalPanel).toHaveCount(0)

      const overflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth > innerWidth,
        vertical: document.documentElement.scrollHeight > innerHeight,
      }))
      expect(overflow).toEqual({ horizontal: false, vertical: false })
      expect(runtimeIssuesByPage.get(page) ?? []).toEqual([])
    } finally {
      await context.close()
    }
    })
  })
}
