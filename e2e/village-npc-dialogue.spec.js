import { expect, test } from '@playwright/test'
import {
  API_URL,
  FRONTEND_URL,
  createE2EFixture,
  provisionLocalFixture,
} from './village-e2e-fixture'
import { configureResourceStableRendering } from './village-resource-stable-rendering'
import {
  TEMPLATE_NPC_ASSET_TYPES,
  getNpcDialogueScript,
  nextNpcDialogueIndex,
  resolveNpcDialogue,
} from '../src/components/village/npcDialogueScript'

let fixture
const TEMPLATE_NPCS = [
  { assetType: 'DEFAULT_NPC_GUIDE', displayName: '마을 안내자' },
  { assetType: 'DEFAULT_NPC_GARDENER', displayName: '정원 관리인' },
  { assetType: 'DEFAULT_NPC_MEMORY_KEEPER', displayName: '기억 보관인' },
  { assetType: 'DEFAULT_NPC_ANIMAL_CARETAKER', displayName: '동물 돌봄이' },
]
const DIRECTIONS = [
  { dx: 0, dy: 1, key: 'ArrowDown' },
  { dx: 0, dy: -1, key: 'ArrowUp' },
  { dx: 1, dy: 0, key: 'ArrowRight' },
  { dx: -1, dy: 0, key: 'ArrowLeft' },
]
const runtimeIssuesByPage = new WeakMap()

test.beforeAll(async ({ request }, workerInfo) => {
  fixture = createE2EFixture(`village-npc-dialogue-w${workerInfo.workerIndex}`)
  await provisionLocalFixture(request, fixture)
})
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

async function dismissOnboarding(page) {
  const explore = page.getByRole('button', { name: '천천히 둘러보기' })
  if (await explore.isVisible().catch(() => false)) await explore.click()
  const later = page.getByRole('button', { name: '지금은 둘러볼게요' })
  if (await later.isVisible().catch(() => false)) await later.click()
}

async function enterVillage(page) {
  await configureResourceStableRendering(page)
  trackRuntimeIssues(page)
  await page.goto(FRONTEND_URL)
  const enter = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enter.isVisible().catch(() => false)) await enter.click()
  const email = page.getByRole('textbox', { name: '이메일' })
  if (await email.isVisible().catch(() => false)) {
    await email.fill(fixture.email)
    await page.getByRole('textbox', { name: '비밀번호' }).fill(fixture.password)
    await page.getByRole('button', { name: '들어가기' }).click()
  }
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', /^(384|448|512|576|640|704|768|832|896|960|1024|1088|1152|1216|1280)$/)
  await dismissOnboarding(page)
  const token = await page.evaluate(() => sessionStorage.getItem('projectEdenAccessToken'))
  expect(token).toBeTruthy()
  return token
}

async function syncVillage(page) {
  await page.reload()
  const enter = page.getByRole('button', { name: '마을로 들어가기' })
  if (await enter.isVisible().catch(() => false)) await enter.click()
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', /^(384|448|512|576|640|704|768|832|896|960|1024|1088|1152|1216|1280)$/)
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
  while (queue.length) {
    const current = queue.shift()
    if (current.x === target.x && current.y === target.y) return current.path
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.dx, y: current.y + direction.dy }
      const key = coordinateKey(next.x, next.y)
      if (seen.has(key) || !walkable.has(key) || npcTiles.has(key)) continue
      seen.add(key)
      queue.push({ ...next, path: [...current.path, next] })
    }
  }
  throw new Error(`No walkable path to ${target.x},${target.y}`)
}

async function routePlayer(page, token, target) {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const current = await worldState(page, token)
    if (current.playerPosition.x === target.x && current.playerPosition.y === target.y) return
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

function findNpc(state, assetType) {
  const npc = state.npcPositions.find((candidate) => candidate.assetType === assetType)
  if (!npc) throw new Error(`Missing template NPC ${assetType}`)
  return npc
}

function findApproach(state, npc, needsOutwardStep = false) {
  const walkable = new Set(state.terrainTiles
    .filter((tile) => tile.walkable)
    .map((tile) => coordinateKey(tile.x, tile.y)))
  const direction = DIRECTIONS.find(({ dx, dy }) => {
    const adjacent = coordinateKey(npc.x + dx, npc.y + dy)
    if (!walkable.has(adjacent)) return false
    return !needsOutwardStep || walkable.has(coordinateKey(npc.x + dx * 2, npc.y + dy * 2))
  })
  if (!direction) throw new Error(`No walkable approach for ${npc.assetType}`)
  return {
    direction,
    adjacent: { x: npc.x + direction.dx, y: npc.y + direction.dy },
    outward: { x: npc.x + direction.dx * 2, y: npc.y + direction.dy * 2 },
  }
}

async function placeNextToNpc(page, token, assetType, needsOutwardStep = false) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const state = await worldState(page, token)
    const npc = findNpc(state, assetType)
    const approach = findApproach(state, npc, needsOutwardStep)
    try {
      await routePlayer(page, token, approach.adjacent)
    } catch {
      continue
    }
    await syncVillage(page)
    const prompt = page.locator(
      `.village-interaction-prompt[data-interaction-type="TALK"][data-target-asset-type="${assetType}"]`,
    )
    if (await prompt.count() === 1) return { npc, ...approach }
  }
  throw new Error(`No server-authoritative TALK position found for ${assetType}`)
}

async function openNpcDialogue(page, npc, useTouch = false) {
  const prompt = page.locator(
    `.village-interaction-prompt[data-interaction-type="TALK"][data-target-asset-type="${npc.assetType}"]`,
  )
  await expect(prompt).toHaveCount(1)
  const button = prompt.getByRole('button', { name: `${npc.displayName} · 대화하기` })
  if (useTouch) await button.tap()
  else await button.click()
  const panel = page.getByRole('region', { name: `${npc.displayName}와의 대화` })
  await expect(panel).toBeVisible()
  await expect(page.locator('.npc-dialogue-panel')).toHaveCount(1)
  return panel
}

async function openScheduledNpcDialogue(page, token, assetType, needsOutwardStep = false) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const placement = await placeNextToNpc(page, token, assetType, needsOutwardStep)
    const panel = await openNpcDialogue(page, placement.npc)
    await page.waitForTimeout(250)
    if (!(await panel.textContent()).includes('NPC_OUT_OF_RANGE')) return { panel, ...placement }

    await panel.getByRole('button', { name: `${placement.npc.displayName} 대화 닫기` }).click()
    const issues = runtimeIssuesByPage.get(page) ?? []
    runtimeIssuesByPage.set(page, issues.filter((issue) => (
      issue !== 'error: Failed to load resource: the server responded with a status of 400 ()'
    )))
  }
  throw new Error(`NPC schedule did not stabilize for ${assetType}`)
}

async function completeDialogue(page, npc, useTouch = false) {
  const panel = page.getByRole('region', { name: `${npc.displayName}와의 대화` })
  for (let step = 0; step < 5 && await panel.count(); step += 1) {
    const action = panel.locator('.npc-dialogue-panel__actions button:not(.npc-dialogue-panel__quiet)').first()
    await expect(action).toBeVisible()
    if (useTouch) await action.tap()
    else await action.click()
  }
  await expect(panel).toHaveCount(0)
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

test('resolves complete, clamped, non-crashing scripts for all template NPC assets', async () => {
  expect(TEMPLATE_NPC_ASSET_TYPES).toEqual(TEMPLATE_NPCS.map((npc) => npc.assetType))
  for (const npc of TEMPLATE_NPCS) {
    const script = getNpcDialogueScript(npc.assetType)
    expect(script.displayName).toBe(npc.displayName)
    expect(script.lines.length).toBeGreaterThanOrEqual(2)
    expect(script.lines.every((line) => typeof line === 'string' && line.trim().length > 0)).toBe(true)
    const first = resolveNpcDialogue({ targetAssetType: npc.assetType, displayName: npc.displayName }, -3)
    expect(first).toMatchObject({ lineIndex: 0, primaryActionLabel: '다음', isLastLine: false })
    const last = resolveNpcDialogue({ targetAssetType: npc.assetType }, 999)
    expect(last.lineIndex).toBe(script.lines.length - 1)
    expect(last).toMatchObject({ primaryActionLabel: '대화 마치기', isLastLine: true })
    expect(nextNpcDialogueIndex({ targetAssetType: npc.assetType }, 999)).toBe(script.lines.length - 1)
  }
  expect(resolveNpcDialogue({ targetAssetType: 'FUTURE_NPC', displayName: ' ' })).toMatchObject({
    displayName: '마을 주민',
    targetAssetType: 'FUTURE_NPC',
    lineIndex: 0,
    primaryActionLabel: '다음',
  })
})

test('runs all four template NPC sessions through the authoritative dialogue API', async ({ page }) => {
  const token = await enterVillage(page)
  const requests = []
  page.on('request', (request) => {
    if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') {
      requests.push({ method: request.method(), url: request.url() })
    }
  })

  for (const expected of TEMPLATE_NPCS) {
    const { panel, npc } = await openScheduledNpcDialogue(page, token, expected.assetType)
    expect(npc).toMatchObject(expected)
    await expect(panel).toBeVisible()
    await completeDialogue(page, npc)
    await expect(page.getByRole('button', { name: '모아와 대화하기' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: '모아와의 대화' })).toHaveCount(0)
    await expect(page.locator('.npc-wrapper')).toHaveCount(0)
  }

  const dialogueRequests = requests.filter(({ url }) => url.includes('/api/worlds/me/npcs/') && url.includes('/dialogues/'))
  const forbiddenMutations = requests.filter(({ method, url }) => method === 'POST' && (
    url.includes('/api/photos')
      || url.includes('/api/seeds')
      || url.includes('/world-changes')
  ))
  expect(dialogueRequests.length).toBeGreaterThanOrEqual(12)
  expect(forbiddenMutations).toEqual([])
})

test('Escape and NPC switching reset every dialogue to the first line', async ({ page }) => {
  const token = await enterVillage(page)
  let opened = await openScheduledNpcDialogue(page, token, 'DEFAULT_NPC_GUIDE')
  let { npc: guide, panel } = opened
  await panel.getByRole('button', { name: '마을 이야기를 들을래요' }).click()
  await expect(panel).toContainText('당신의 기억이 길과 풍경을 조금씩 바꾸고 있어요.')
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)

  opened = await openScheduledNpcDialogue(page, token, 'DEFAULT_NPC_GUIDE')
  ;({ npc: guide, panel } = opened)
  await expect(panel).toContainText('어서 와요. 오늘 마을을 어떻게 둘러보고 싶나요?')
  await panel.getByRole('button', { name: `${guide.displayName} 대화 닫기` }).click()

  opened = await openScheduledNpcDialogue(page, token, 'DEFAULT_NPC_GARDENER')
  const { npc: gardener } = opened
  panel = opened.panel
  await expect(panel).toContainText('정원에는 오늘도 작은 변화가 자라고 있어요.')
  await panel.getByRole('button', { name: `${gardener.displayName} 대화 닫기` }).click()
})

test('locks player movement during dialogue and starts from the first node after close', async ({ page }) => {
  const token = await enterVillage(page)
  const { npc, direction, outward, panel } = await openScheduledNpcDialogue(
    page, token, 'DEFAULT_NPC_GUIDE', true,
  )
  await panel.getByRole('button', { name: '마을 이야기를 들을래요' }).click()

  const approved = (await worldState(page, token)).playerPosition
  await page.keyboard.press(direction.key, { delay: 30 })
  await expect.poll(async () => (await worldState(page, token)).playerPosition).toEqual(approved)
  await panel.getByRole('button', { name: `${npc.displayName} 대화 닫기` }).click()
  await routePlayer(page, token, outward)
  await expect(panel).toHaveCount(0)
  await expect(page.locator('.village-interaction-prompt[data-interaction-type="TALK"]')).toHaveCount(0)

  const reopenedSession = await openScheduledNpcDialogue(page, token, 'DEFAULT_NPC_GUIDE')
  const reopened = reopenedSession.panel
  await expect(reopened).toContainText('어서 와요. 오늘 마을을 어떻게 둘러보고 싶나요?')
  await reopened.getByRole('button', { name: `${reopenedSession.npc.displayName} 대화 닫기` }).click()
})

test('coordinates dialogue with contextual and Capture panels without restoring stale state', async ({ page }) => {
  const token = await enterVillage(page)
  const guide = (await placeNextToNpc(page, token, 'DEFAULT_NPC_GUIDE')).npc
  let dialogue = await openNpcDialogue(page, guide)
  await dialogue.getByRole('button', { name: '마을 이야기를 들을래요' }).click()
  await page.getByRole('button', { name: '오늘의 순간 남기기' }).click()
  await expect(dialogue).toHaveCount(0)
  await expect(page.getByLabel('따뜻한 숲과 노을을 담는 카메라 화면')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.village-stage')).toBeVisible()
  await expect(page.locator('.npc-dialogue-panel,.contextual-interaction-panel,.tile-inspect-panel')).toHaveCount(0)

  await routePlayer(page, token, { x: 4, y: 9 })
  await syncVillage(page)
  const farmPrompt = page.locator(
    '.village-interaction-prompt[data-interaction-category="FARM"][data-target-asset-type="FARM_PLOT_EMPTY"]',
  )
  await farmPrompt.getByRole('button', { name: '비어 있는 밭 · 살펴보기' }).click()
  const contextual = page.getByRole('region', { name: '비어 있는 밭 살펴보기' })
  await expect(contextual).toBeVisible()

  const repositionedGuide = (await placeNextToNpc(page, token, 'DEFAULT_NPC_GUIDE')).npc
  await expect(contextual).toHaveCount(0)
  dialogue = await openNpcDialogue(page, repositionedGuide)
  await expect(page.locator('.contextual-interaction-panel,.tile-inspect-panel')).toHaveCount(0)
  await dialogue.getByRole('button', { name: `${repositionedGuide.displayName} 대화 닫기` }).click()
})

test('does not restore a dialogue after reload and still exposes authoritative TALK', async ({ page }) => {
  const token = await enterVillage(page)
  const guide = (await placeNextToNpc(page, token, 'DEFAULT_NPC_GUIDE')).npc
  const panel = await openNpcDialogue(page, guide)
  await panel.getByRole('button', { name: '마을 이야기를 들을래요' }).click()
  await syncVillage(page)
  await expect(page.locator('.npc-dialogue-panel')).toHaveCount(0)
  await expect(page.locator(
    `.village-interaction-prompt[data-interaction-type="TALK"][data-target-asset-type="${guide.assetType}"]`,
  )).toHaveCount(1)
})

for (const viewport of [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
]) {
  test(`keeps a complete template dialogue touch-safe at ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    })
    const page = await context.newPage()
    try {
      const token = await enterVillage(page)
      const guide = (await placeNextToNpc(page, token, 'DEFAULT_NPC_GUIDE')).npc
      const panel = await openNpcDialogue(page, guide, true)
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

      const panelBox = await panel.boundingBox()
      const actionBarBox = await page.locator('.village-action-bar').boundingBox()
      const joystickPadOpacity = await page.locator('.virtual-joystick__pad').evaluate(
        (element) => Number.parseFloat(window.getComputedStyle(element).opacity),
      )
      expect(withinViewport(panelBox, viewport)).toBe(true)
      expect(joystickPadOpacity).toBe(0)
      expect(overlaps(panelBox, actionBarBox)).toBe(false)
      await completeDialogue(page, guide, true)

      const overflow = await page.evaluate(() => ({
        horizontal: document.documentElement.scrollWidth > window.innerWidth,
        vertical: document.documentElement.scrollHeight > window.innerHeight,
      }))
      expect(overflow).toEqual({ horizontal: false, vertical: false })
      expect(runtimeIssuesByPage.get(page) ?? []).toEqual([])
    } finally {
      await context.close()
    }
  })
}
