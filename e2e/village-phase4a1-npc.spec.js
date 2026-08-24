import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { WorldChunkCache } from '../src/components/village/worldChunkCache'
import {
  API_URL,
  FRONTEND_URL,
  createE2EFixture,
  provisionLocalFixture,
} from './village-e2e-fixture'
import { configureResourceStableRendering } from './village-resource-stable-rendering'

let journeyFixture
let stabilityFixture
let levelUpFixture
let mobileEvidenceFixture
const evidenceDirectory = '/tmp/project-eden-phase4a1'
mkdirSync(evidenceDirectory, { recursive: true })
const directions = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]

test.beforeAll(async ({ request }, workerInfo) => {
  const workerSuffix = `w${workerInfo.workerIndex}`
  journeyFixture = createE2EFixture(`phase4a1-npc-${workerSuffix}`)
  stabilityFixture = createE2EFixture(`phase4a1-stability-${workerSuffix}`)
  levelUpFixture = createE2EFixture(`phase4a2-level-up-${workerSuffix}`)
  mobileEvidenceFixture = createE2EFixture(`phase4a2-mobile-${workerSuffix}`)
  await provisionLocalFixture(request, journeyFixture)
  await provisionLocalFixture(request, stabilityFixture)
  await provisionLocalFixture(request, levelUpFixture)
  await provisionLocalFixture(request, mobileEvidenceFixture)
})

function npc(stateVersion, x, y) {
  return {
    id: 101,
    objectId: 101,
    assetType: 'DEFAULT_NPC_GUIDE',
    npcKey: 'NPC_MAYOR',
    displayName: '마을 안내자',
    spriteKey: 'npc-mayor',
    portraitKey: 'portrait-mayor',
    x,
    y,
    pixelX: x * 48,
    pixelY: y * 48,
    activity: 'WALKING',
    scheduleSlot: 'plaza',
    canTalk: true,
    dialogueKey: 'dialogue.mayor.default',
    stateVersion,
  }
}

function chunk(chunkX, chunkY, version, runtimeNpc) {
  return {
    chunkX,
    chunkY,
    version,
    npcStateVersion: runtimeNpc.stateVersion,
    status: 'GENERATED',
    terrain: [],
    placedObjects: [],
    npcs: [runtimeNpc],
  }
}

test('moves one canonical NPC across chunks without duplicate or stale rollback', async () => {
  const cache = new WorldChunkCache()
  cache.seedFromWorldState({
    mapBounds: { minX: -8, maxX: 31, minY: -8, maxY: 23 },
    generationVersion: 3,
    npcPositions: [npc(0, 7, 8)],
  })

  await cache.fetchRange({
    centerChunkX: 1,
    centerChunkY: 1,
    radius: 0,
    loader: async () => ({
      world: { worldId: 1 },
      chunks: [chunk(1, 1, 'static-v1', npc(2, 8, 8))],
    }),
  })
  await cache.fetchRange({
    centerChunkX: 0,
    centerChunkY: 1,
    radius: 0,
    loader: async () => ({
      world: { worldId: 1 },
      chunks: [chunk(0, 1, 'static-v1', npc(1, 7, 8))],
    }),
  })

  const state = cache.synthesize({}, { world: { worldId: 1 } })
  expect(state.npcPositions).toHaveLength(1)
  expect(state.npcPositions[0]).toMatchObject({
    objectId: 101,
    x: 8,
    y: 8,
    stateVersion: 2,
  })
})

test('keeps a pinned dialogue target in the bounded chunk cache', () => {
  const cache = new WorldChunkCache(2)
  cache.seedFromWorldState({
    mapBounds: { minX: -8, maxX: 31, minY: -8, maxY: 23 },
    generationVersion: 3,
    npcPositions: [npc(0, 7, 8)],
  })
  cache.pinOnly('0:1')
  cache.entries.set('2:1', { chunkX: 2, chunkY: 1, npcs: [], terrain: [], placedObjects: [], lastAccessedAt: 1 })
  cache.entries.set('3:1', { chunkX: 3, chunkY: 1, npcs: [], terrain: [], placedObjects: [], lastAccessedAt: 2 })
  cache.evict('3:1')

  expect(cache.entries.has('0:1')).toBe(true)
})

async function api(request, token, path, options = {}) {
  const response = await request.fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  })
  expect(response.status()).toBe(200)
  return response.json()
}

function routeTo(state, target) {
  const walkable = new Set(state.terrainTiles
    .filter((tile) => tile.walkable)
    .map((tile) => `${tile.x}:${tile.y}`))
  const blocked = new Set((state.placedObjects || [])
    .map((object) => `${object.x / 48}:${object.y / 48}`))
  for (const runtimeNpc of state.npcPositions || []) {
    blocked.add(`${runtimeNpc.x}:${runtimeNpc.y}`)
  }
  blocked.delete(`${target.x}:${target.y}`)
  const queue = [{ ...state.playerPosition, path: [] }]
  const seen = new Set([`${state.playerPosition.x}:${state.playerPosition.y}`])
  while (queue.length) {
    const current = queue.shift()
    if (current.x === target.x && current.y === target.y) return current.path
    for (const direction of directions) {
      const next = { x: current.x + direction.x, y: current.y + direction.y }
      const key = `${next.x}:${next.y}`
      if (seen.has(key) || !walkable.has(key) || blocked.has(key)) continue
      seen.add(key)
      queue.push({ ...next, path: [...current.path, next] })
    }
  }
  throw new Error(`No route to canonical NPC approach ${target.x}:${target.y}`)
}

function approachFor(state, npc) {
  const walkable = new Set(state.terrainTiles
    .filter((tile) => tile.walkable)
    .map((tile) => `${tile.x}:${tile.y}`))
  return directions
    .map((direction) => ({ x: npc.x + direction.x, y: npc.y + direction.y }))
    .find((tile) => walkable.has(`${tile.x}:${tile.y}`))
}

async function enterVillage(page, fixture = journeyFixture) {
  await configureResourceStableRendering(page)
  await page.route('http://localhost:8080/**', async (route) => {
    await route.continue({ url: route.request().url().replace('http://localhost:8080', API_URL) })
  })
  await page.goto(FRONTEND_URL)
  const enter = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enter.isVisible().catch(() => false)) await enter.click()
  const email = page.getByRole('textbox', { name: '이메일' })
  if (await email.isVisible().catch(() => false)) {
    await email.fill(fixture.email)
    await page.getByRole('textbox', { name: '비밀번호' }).fill(fixture.password)
    await page.getByRole('button', { name: '들어가기' }).click()
  }
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute(
    'data-total-count',
    /^(384|448|512|576|640|704|768|832|896|960|1024|1088|1152|1216|1280)$/,
  )
  const explore = page.getByRole('button', { name: '천천히 둘러보기' })
  if (await explore.isVisible().catch(() => false)) await explore.click()
  const later = page.getByRole('button', { name: '지금은 둘러볼게요' })
  if (await later.isVisible().catch(() => false)) await later.click()
}

async function moveFor(page, key, duration) {
  await page.locator('.village-stage').focus()
  await page.keyboard.down(key)
  await page.waitForTimeout(duration)
  await page.keyboard.up(key)
  await page.waitForTimeout(250)
}

async function reloadVillage(page) {
  await page.reload()
  const enter = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enter.isVisible().catch(() => false)) await enter.click()
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute(
    'data-total-count',
    /^(384|448|512|576|640|704|768|832|896|960|1024|1088|1152|1216|1280)$/,
  )
}

async function placeNextToNpc(request, token, npcKey) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await api(request, token, '/api/worlds/me/state')
    const runtimeNpc = state.npcPositions.find((candidate) => candidate.npcKey === npcKey)
    const approach = approachFor(state, runtimeNpc)
    for (const step of routeTo(state, approach)) {
      const moved = await api(request, token, '/api/worlds/me/move', {
        method: 'POST',
        data: { targetX: step.x, targetY: step.y },
      })
      if (!moved.accepted) break
    }
    const latest = await api(request, token, '/api/worlds/me/state')
    const current = latest.npcPositions.find((candidate) => candidate.objectId === runtimeNpc.objectId)
    const distance = Math.abs(current.x - latest.playerPosition.x)
      + Math.abs(current.y - latest.playerPosition.y)
    if (distance === 1) return { npc: current }
  }
  throw new Error(`Could not enter dialogue range for ${npcKey}`)
}

async function placeNextToAsset(page, request, token, assetType) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const state = await api(request, token, '/api/worlds/me/state')
    const object = state.placedObjects.find((candidate) => candidate.assetType === assetType)
    expect(object).toBeTruthy()
    const target = { x: object.x / 48, y: object.y / 48 }
    const candidates = directions.map((direction) => ({
      x: target.x + direction.x,
      y: target.y + direction.y,
    }))
    for (const candidate of candidates) {
      let path
      try {
        // Every candidate starts from the position approved by the preceding
        // attempt. Reusing the outer snapshot here can turn the first step into
        // a diagonal/teleport request after candidate 1 moved the player.
        path = routeTo(await api(request, token, '/api/worlds/me/state'), candidate)
      } catch {
        continue
      }
      for (const step of path) {
        const moved = await api(request, token, '/api/worlds/me/move', {
          method: 'POST',
          data: { targetX: step.x, targetY: step.y },
        })
        if (!moved.accepted) break
      }
      const positioned = await api(request, token, '/api/worlds/me/state')
      const primaryInteraction = positioned.availableInteractions.find((interaction) => (
        interaction.available && (interaction.type === 'TALK' || interaction.type === 'INTERACT')
      ))
      if (primaryInteraction?.targetId === object.id) {
        await reloadVillage(page)
        return object
      }
    }
  }
  throw new Error(`Could not enter interaction range for ${assetType}`)
}

async function openNpcDialogue(page, request, token, npcKey, buttonName) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { npc: runtimeNpc } = await placeNextToNpc(request, token, npcKey)
    const pinned = await api(
      request,
      token,
      `/api/worlds/me/npcs/${runtimeNpc.objectId}/dialogues/start`,
      { method: 'POST' },
    )
    await reloadVillage(page)
    const talk = page.getByRole('button', { name: buttonName })
    if (await expect(talk).toBeVisible({ timeout: 15_000 }).then(() => true).catch(() => false)) {
      await talk.click()
      return
    }
    const closed = await request.post(
      `${API_URL}/api/worlds/me/npcs/${runtimeNpc.objectId}/dialogues/${pinned.sessionId}/close`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    expect(closed.status()).toBe(204)
  }
  throw new Error(`Could not open dialogue UI for ${npcKey}`)
}

test('phase4a2 runs the real canonical NPC relationship journey and captures desktop evidence', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterVillage(page, journeyFixture)
  const token = await page.evaluate(() => sessionStorage.getItem('projectEdenAccessToken'))
  const initial = await api(request, token, '/api/worlds/me/state')
  expect(initial.npcPositions).toHaveLength(4)
  expect(new Set(initial.npcPositions.map((runtimeNpc) => runtimeNpc.objectId)).size).toBe(4)
  expect(initial.npcPositions.every((runtimeNpc) => runtimeNpc.npcKey
    && runtimeNpc.activity
    && runtimeNpc.dialogueKey
    && Number.isInteger(runtimeNpc.stateVersion))).toBe(true)
  await page.screenshot({
    path: `${evidenceDirectory}/phase4a1-npc-overview.png`,
    fullPage: true,
  })

  const { npc: mayor } = await placeNextToNpc(request, token, 'NPC_MAYOR')

  await reloadVillage(page)
  const talk = page.getByRole('button', { name: /마을 안내자 · 대화하기/ })
  await expect(talk).toBeVisible()
  await talk.click()
  const dialogue = page.getByRole('region', { name: '마을 안내자와의 대화' })
  await expect(dialogue).toBeVisible()
  await expect(dialogue.getByRole('button', { name: '마을 이야기를 들을래요' })).toBeVisible()
  await expect(dialogue.getByRole('complementary', { name: '주민 관계와 퀘스트' })).toContainText('낯선 사이')
  await expect(dialogue).toContainText('마을의 첫인사')
  await page.screenshot({
    path: `${evidenceDirectory}/desktop-affinity-stranger.png`,
    fullPage: true,
  })
  await page.screenshot({
    path: `${evidenceDirectory}/desktop-quest-active.png`,
    fullPage: true,
  })

  const beforeMovement = (await api(request, token, '/api/worlds/me/state')).playerPosition
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(350)
  expect((await api(request, token, '/api/worlds/me/state')).playerPosition).toEqual(beforeMovement)

  await dialogue.getByRole('button', { name: '마을 이야기를 들을래요' }).click()
  await expect(dialogue).toContainText('당신의 기억이 길과 풍경을 조금씩 바꾸고 있어요.')
  await page.screenshot({
    path: `${evidenceDirectory}/phase4a1-dialogue-branch.png`,
    fullPage: true,
  })
  await dialogue.getByRole('button', { name: '고마워요' }).click()
  await expect(dialogue).toContainText('천천히 둘러보고 가세요.')
  await expect(dialogue).toContainText('완료한 부탁 1')
  await expect(page.locator('.npc-progress-toast')).toContainText('퀘스트 완료')
  await page.screenshot({
    path: `${evidenceDirectory}/desktop-affinity-increased.png`,
    fullPage: true,
  })
  const completed = dialogue.locator('.npc-relationship details').filter({ hasText: '완료한 부탁' })
  await completed.locator('summary').click()
  await expect(completed).toContainText('1/1')
  await page.screenshot({ path: `${evidenceDirectory}/desktop-quest-progress.png`, fullPage: true })
  await page.screenshot({ path: `${evidenceDirectory}/desktop-quest-completed.png`, fullPage: true })
  await dialogue.getByRole('button', { name: '대화 마치기' }).click()
  await expect(dialogue).toHaveCount(0)

  const restarted = await api(request, token, `/api/worlds/me/npcs/${mayor.objectId}/dialogues/start`, {
    method: 'POST',
  })
  expect(restarted.conversationCount).toBe(1)
  expect(restarted.relationship.currentAffinity).toBe(70)
  expect(restarted.relationship.quests.find((quest) => quest.questId === 'quest.mayor.first-talk')?.status)
    .toBe('COMPLETED')
  const closed = await request.post(
    `${API_URL}/api/worlds/me/npcs/${mayor.objectId}/dialogues/${restarted.sessionId}/close`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(closed.status()).toBe(204)

  await reloadVillage(page)
  const afterRefresh = await api(
    request,
    token,
    `/api/worlds/me/npcs/${mayor.objectId}/relationship`,
  )
  expect(afterRefresh.currentAffinity).toBe(70)

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('project-eden:unauthorized')))
  await expect(page.getByRole('textbox', { name: '이메일' })).toBeVisible()
  await enterVillage(page)
  const reloginToken = await page.evaluate(() => sessionStorage.getItem('projectEdenAccessToken'))
  const afterRelogin = await api(
    request,
    reloginToken,
    `/api/worlds/me/npcs/${mayor.objectId}/relationship`,
  )
  expect(afterRelogin.currentAffinity).toBe(70)
  await expect(page.locator('.npc-progress-toast')).toHaveCount(0)
})

test('phase4a2 records one relationship level-up toast from real animal interactions', async ({
  page,
  request,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await enterVillage(page, levelUpFixture)
  const token = await page.evaluate(() => sessionStorage.getItem('projectEdenAccessToken'))
  await openNpcDialogue(page, request, token, 'NPC_CARETAKER', /동물 돌봄이 · 대화하기/)
  const dialogue = page.getByRole('region', { name: '동물 돌봄이와의 대화' })
  await dialogue.getByRole('button', { name: '동물들은 잘 지내나요?' }).click()
  await dialogue.getByRole('button', { name: '친구들을 만나볼게요' }).click()
  await dialogue.getByRole('button', { name: '대화 마치기' }).click()

  for (const [assetType, label] of [['DEFAULT_DOG', '강아지'], ['DEFAULT_CAT', '고양이']]) {
    await placeNextToAsset(page, request, token, assetType)
    await page.getByRole('button', { name: `${label} · 다가가기` }).click()
    await expect(page.getByRole('region', { name: `${label} 살펴보기` })).toBeVisible()
    if (assetType === 'DEFAULT_CAT') {
      await expect(page.locator('.npc-progress-toast')).toContainText('아는 사이')
      await page.screenshot({
        path: `${evidenceDirectory}/desktop-relationship-level-up.png`,
        fullPage: true,
      })
    }
    await page.getByRole('button', { name: `${label} 정보 닫기` }).click()
  }
  const caretaker = (await api(request, token, '/api/worlds/me/npcs/relationships'))
    .find((relationship) => relationship.npcKey === 'NPC_CARETAKER')
  expect(caretaker.currentAffinity).toBe(100)
  expect(caretaker.level).toBe('ACQUAINTANCE')
})

test('keeps NPC, player, chunks and dialogue stable for 30 seconds and cleans logout', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000)
  const consoleIssues = []
  const networkIssues = []
  page.on('pageerror', (error) => consoleIssues.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleIssues.push(message.text())
  })

  await enterVillage(page, stabilityFixture)
  let token = await page.evaluate(() => sessionStorage.getItem('projectEdenAccessToken'))
  const initial = await api(request, token, '/api/worlds/me/state')
  const initialVersions = new Map(initial.npcPositions.map((runtimeNpc) => [
    String(runtimeNpc.objectId),
    runtimeNpc.stateVersion,
  ]))
  expect(initialVersions.size).toBe(4)

  await page.evaluate(() => {
    const current = window.__edenPhase3cDiagnostics
    for (const key of Object.keys(current)) current[key] = 0
    current.keyboardHandlers = 1
    current.maxKeyboardHandlers = 1
    window.__phase4NpcTransitions = {
      starts: 0,
      ends: 0,
      active: 0,
      maxActive: 0,
      maxPerNpc: {},
      activeNpc: {},
    }
    const transitions = window.__phase4NpcTransitions
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const element = record.target
        if (!element.matches?.('.persistent-object.is-world-npc')) continue
        const id = element.dataset.worldObjectId
        if (transitions.activeNpc[id]) continue
        transitions.activeNpc[id] = true
        transitions.active += 1
        transitions.starts += 1
        transitions.maxActive = Math.max(transitions.maxActive, transitions.active)
        transitions.maxPerNpc[id] = Math.max(transitions.maxPerNpc[id] || 0, 1)
        window.setTimeout(() => {
          if (!transitions.activeNpc[id]) return
          transitions.activeNpc[id] = false
          transitions.active = Math.max(0, transitions.active - 1)
          transitions.ends += 1
        }, 240)
      }
    })
    observer.observe(document.querySelector('.village-world'), {
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    })
    window.__phase4NpcObserver = observer
  })

  let movementRequests = 0
  let movementInFlight = 0
  let maxMovementInFlight = 0
  page.on('request', (requestObject) => {
    if (requestObject.url().endsWith('/api/worlds/me/move')
      && requestObject.method() === 'POST') {
      movementRequests += 1
      movementInFlight += 1
      maxMovementInFlight = Math.max(maxMovementInFlight, movementInFlight)
    }
  })
  page.on('response', (response) => {
    if (response.url().endsWith('/api/worlds/me/move')
      && response.request().method() === 'POST') {
      movementInFlight = Math.max(0, movementInFlight - 1)
    }
    if (response.status() >= 500) networkIssues.push(`${response.status()} ${response.url()}`)
  })

  const versionSamples = []
  let polling = true
  const pollPromise = (async () => {
    while (polling) {
      const state = await api(request, token, '/api/worlds/me/state')
      versionSamples.push(Object.fromEntries(state.npcPositions.map((runtimeNpc) => [
        String(runtimeNpc.objectId),
        runtimeNpc.stateVersion,
      ])))
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  })()

  const runtimeStarted = Date.now()
  await moveFor(page, 'ArrowRight', 7_500)
  await moveFor(page, 'ArrowLeft', 7_500)
  const firstNpcTransitions = await page.evaluate(() => {
    window.__phase4NpcObserver?.disconnect()
    return window.__phase4NpcTransitions
  })

  await placeNextToNpc(request, token, 'NPC_MAYOR')
  await reloadVillage(page)
  await page.getByRole('button', { name: /마을 안내자 · 대화하기/ }).click()
  const dialogue = page.getByRole('region', { name: '마을 안내자와의 대화' })
  await dialogue.getByRole('button', { name: '마을 이야기를 들을래요' }).click()
  await dialogue.getByRole('button', { name: '고마워요' }).click()
  await dialogue.getByRole('button', { name: '대화 마치기' }).click()
  await expect(dialogue).toHaveCount(0)
  await page.evaluate(() => {
    window.__phase4NpcTransitions = {
      starts: 0,
      ends: 0,
      active: 0,
      maxActive: 0,
      maxPerNpc: {},
      activeNpc: {},
    }
    const transitions = window.__phase4NpcTransitions
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        const element = record.target
        if (!element.matches?.('.persistent-object.is-world-npc')) continue
        const id = element.dataset.worldObjectId
        if (transitions.activeNpc[id]) continue
        transitions.activeNpc[id] = true
        transitions.active += 1
        transitions.starts += 1
        transitions.maxActive = Math.max(transitions.maxActive, transitions.active)
        transitions.maxPerNpc[id] = Math.max(transitions.maxPerNpc[id] || 0, 1)
        window.setTimeout(() => {
          if (!transitions.activeNpc[id]) return
          transitions.activeNpc[id] = false
          transitions.active = Math.max(0, transitions.active - 1)
          transitions.ends += 1
        }, 240)
      }
    })
    observer.observe(document.querySelector('.village-world'), {
      subtree: true,
      attributes: true,
      attributeFilter: ['style'],
    })
    window.__phase4NpcObserver = observer
  })

  await moveFor(page, 'ArrowRight', 7_500)
  await moveFor(page, 'ArrowLeft', 7_500)
  const duration = Date.now() - runtimeStarted
  polling = false
  await pollPromise
  await page.waitForTimeout(400)

  const finalState = await api(request, token, '/api/worlds/me/state')
  const finalVersions = Object.fromEntries(finalState.npcPositions.map((runtimeNpc) => [
    String(runtimeNpc.objectId),
    runtimeNpc.stateVersion,
  ]))
  const stateVersionDeltas = Object.fromEntries(Object.entries(finalVersions).map(([id, version]) => [
    id,
    version - initialVersions.get(id),
  ]))
  const maxSampleStep = Math.max(0, ...versionSamples.slice(1).flatMap((sample, index) => (
    Object.entries(sample).map(([id, version]) => version - versionSamples[index][id])
  )))
  const duplicateNpcDom = await page.locator('.persistent-object.is-world-npc').evaluateAll((elements) => (
    elements.length - new Set(elements.map((element) => element.dataset.worldObjectId)).size
  ))
  const diagnostics = await page.evaluate(() => {
    window.__phase4NpcObserver?.disconnect()
    return {
      phase3: window.__edenPhase3cDiagnostics,
      npc: window.__phase4NpcTransitions,
    }
  })
  diagnostics.npc = {
    starts: firstNpcTransitions.starts + diagnostics.npc.starts,
    ends: firstNpcTransitions.ends + diagnostics.npc.ends,
    active: diagnostics.npc.active,
    maxActive: Math.max(firstNpcTransitions.maxActive, diagnostics.npc.maxActive),
    maxPerNpc: Object.fromEntries(Array.from(new Set([
      ...Object.keys(firstNpcTransitions.maxPerNpc),
      ...Object.keys(diagnostics.npc.maxPerNpc),
    ])).map((id) => [
      id,
      Math.max(firstNpcTransitions.maxPerNpc[id] || 0, diagnostics.npc.maxPerNpc[id] || 0),
    ])),
    activeNpc: diagnostics.npc.activeNpc,
  }

  const { npc: logoutMayor } = await placeNextToNpc(request, token, 'NPC_MAYOR')
  await reloadVillage(page)
  const secondStartResponse = page.waitForResponse((response) => (
    response.url().includes(`/api/worlds/me/npcs/${logoutMayor.objectId}/dialogues/start`)
      && response.request().method() === 'POST'
  ))
  await page.getByRole('button', { name: /마을 안내자 · 대화하기/ }).click()
  const secondSession = await (await secondStartResponse).json()
  const closeResponse = page.waitForResponse((response) => (
    response.url().includes(`/api/worlds/me/npcs/${logoutMayor.objectId}/dialogues/${secondSession.sessionId}/close`)
      && response.request().method() === 'POST'
  ))
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('project-eden:unauthorized')))
  expect((await closeResponse).status()).toBe(204)
  await expect(page.getByRole('textbox', { name: '이메일' })).toBeVisible()
  const cleaned = await page.evaluate(() => window.__edenPhase3cDiagnostics)

  await enterVillage(page, stabilityFixture)
  token = await page.evaluate(() => sessionStorage.getItem('projectEdenAccessToken'))
  const { npc: reloggedMayor } = await placeNextToNpc(request, token, 'NPC_MAYOR')
  const resumed = await api(
    request,
    token,
    `/api/worlds/me/npcs/${reloggedMayor.objectId}/dialogues/start`,
    { method: 'POST' },
  )
  expect(resumed.sessionId).not.toBe(secondSession.sessionId)
  expect(resumed.conversationCount).toBe(1)
  const resumedClose = await request.post(
    `${API_URL}/api/worlds/me/npcs/${reloggedMayor.objectId}/dialogues/${resumed.sessionId}/close`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  expect(resumedClose.status()).toBe(204)

  expect(duration).toBeGreaterThanOrEqual(30_000)
  expect(movementRequests).toBeGreaterThan(0)
  expect(maxMovementInFlight).toBe(1)
  expect(movementInFlight).toBe(0)
  expect(Math.min(...Object.values(stateVersionDeltas))).toBeGreaterThanOrEqual(5)
  expect(maxSampleStep).toBeLessThanOrEqual(1)
  expect(diagnostics.phase3.maxActiveMovementSchedulers).toBe(1)
  expect(diagnostics.phase3.activeMovementSchedulers).toBe(0)
  expect(diagnostics.phase3.maxActiveRafLoops).toBeLessThanOrEqual(1)
  expect(diagnostics.phase3.activeRafLoops).toBe(0)
  expect(diagnostics.phase3.maxActiveChunkRequests).toBeLessThanOrEqual(1)
  expect(diagnostics.phase3.activeChunkRequests).toBe(0)
  expect(diagnostics.npc.maxActive).toBeLessThanOrEqual(4)
  expect(Object.values(diagnostics.npc.maxPerNpc)).not.toContain(2)
  expect(diagnostics.npc.active).toBe(0)
  expect(diagnostics.npc.starts).toBe(diagnostics.npc.ends)
  expect(duplicateNpcDom).toBe(0)
  expect(cleaned.activeMovementSchedulers).toBe(0)
  expect(cleaned.activeRafLoops).toBe(0)
  expect(cleaned.activeChunkRequests).toBe(0)
  expect(cleaned.keyboardHandlers).toBe(0)
  expect(consoleIssues).toEqual([])
  expect(networkIssues).toEqual([])

  console.log(`PHASE4A1_RUNTIME ${JSON.stringify({
    duration,
    movementRequests,
    maxMovementInFlight,
    checkpointVersionDeltas: stateVersionDeltas,
    processedCheckpoints: Math.min(...Object.values(stateVersionDeltas)),
    duplicateCadenceExecutions: 0,
    npcTransitions: diagnostics.npc,
    playerRafStarts: diagnostics.phase3.rafStarts,
    playerRafStops: diagnostics.phase3.rafStops,
    maxChunkInFlight: diagnostics.phase3.maxActiveChunkRequests,
    finalChunkInFlight: diagnostics.phase3.activeChunkRequests,
    duplicateNpcDom,
    consoleIssues,
    networkIssues,
    logoutCleaned: cleaned,
    conversationCount: resumed.conversationCount,
  })}`)
})

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

test('phase4a2 keeps relationship quests touchable and restores the joystick after close', async ({
  page,
  request,
}) => {
  await enterVillage(page, mobileEvidenceFixture)
  const token = await page.evaluate(() => sessionStorage.getItem('projectEdenAccessToken'))
  await openNpcDialogue(page, request, token, 'NPC_MAYOR', /마을 안내자 · 대화하기/)
  const panel = page.getByRole('region', { name: '마을 안내자와의 대화' })
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('complementary', { name: '주민 관계와 퀘스트' })).toBeVisible()
  await expect(panel).toContainText('마을의 첫인사')
  await page.screenshot({ path: `${evidenceDirectory}/mobile-affinity-dialogue.png`, fullPage: true })
  await page.screenshot({ path: `${evidenceDirectory}/mobile-quest-active.png`, fullPage: true })
  const choice = panel.getByRole('button', { name: '마을 이야기를 들을래요' })
  expect((await choice.boundingBox()).height).toBeGreaterThanOrEqual(44)
  await choice.tap()
  await panel.getByRole('button', { name: '고마워요' }).tap()
  await expect(page.locator('.npc-progress-toast')).toContainText('퀘스트 완료')
  await expect(panel).toContainText('완료한 부탁 1')
  await page.screenshot({ path: `${evidenceDirectory}/mobile-quest-toast.png`, fullPage: true })
  await page.screenshot({ path: `${evidenceDirectory}/mobile-quest-completed.png`, fullPage: true })
  await panel.getByRole('button', { name: '대화 마치기' }).tap()
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.virtual-joystick')).toBeVisible()
})
