import { expect, test } from '@playwright/test'
import {
  FRONTEND_URL,
  createE2EFixture,
  provisionLocalFixture,
} from './village-e2e-fixture'
import { configureResourceStableRendering } from './village-resource-stable-rendering'

const TERRAIN_COUNT = /^(384|448|512|576|640|704|768|832|896|960|1024|1088|1152|1216|1280)$/
const fixtures = {
  single: createE2EFixture('hydration-single'),
  pageA: createE2EFixture('hydration-page-a'),
  pageB: createE2EFixture('hydration-page-b'),
  mobile375: createE2EFixture('hydration-mobile-375'),
  mobile390: createE2EFixture('hydration-mobile-390'),
  mobile430: createE2EFixture('hydration-mobile-430'),
}

test.beforeAll(async ({ request }) => {
  for (const fixture of Object.values(fixtures)) await provisionLocalFixture(request, fixture)
})

async function enterWithCredentials(page, fixture) {
  await configureResourceStableRendering(page)
  await page.goto(FRONTEND_URL)
  await page.getByRole('button', { name: '마을로 들어가기' }).click()
  await page.getByRole('textbox', { name: '이메일' }).fill(fixture.email)
  await page.getByRole('textbox', { name: '비밀번호' }).fill(fixture.password)
  await page.getByRole('button', { name: '들어가기' }).click()
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', TERRAIN_COUNT)
}

async function reloadVillage(page, reloadNumber) {
  const startedAt = Date.now()
  const stateResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'GET'
      && new URL(response.url()).pathname === '/api/worlds/me/state'
  ))
  const chunkResponsePromise = page.waitForResponse((response) => (
    response.request().method() === 'GET'
      && new URL(response.url()).pathname === '/api/worlds/me/chunks'
  ))
  await page.reload()
  await page.getByRole('button', { name: '마을로 들어가기' }).click()
  const stateResponse = await stateResponsePromise
  const stateAt = Date.now()
  const state = await stateResponse.json()
  expect(stateResponse.status()).toBe(200)
  expect(state.terrainTiles.length).toBeGreaterThanOrEqual(384)
  const chunkResponse = await chunkResponsePromise
  const chunkAt = Date.now()
  const chunks = await chunkResponse.json()
  expect(chunkResponse.status()).toBe(200)
  expect(String(chunks.world.worldId)).toBe(String(state.worldId))
  expect(chunks.chunks.flatMap((chunk) => chunk.terrain || []).length).toBeGreaterThan(0)
  const terrain = page.locator('.village-page .persistent-terrain')
  await expect(terrain).toHaveAttribute('data-total-count', TERRAIN_COUNT)
  const domAt = Date.now()
  const diagnostics = await page.evaluate(() => ({
    terrain: document.querySelector('.village-page .persistent-terrain')?.dataset.totalCount ?? null,
    timeline: window.__edenPhase3cDiagnostics?.hydrationTimeline?.slice(-30) ?? [],
  }))
  expect(Number(diagnostics.terrain)).toBeGreaterThan(0)
  expect(diagnostics.timeline.filter((event) => event.event === 'PERSISTENT_TERRAIN_ZERO')).toEqual([])
  return {
    reloadNumber,
    worldId: String(state.worldId),
    stateLatency: stateAt - startedAt,
    chunkLatency: chunkAt - startedAt,
    domLatency: domAt - startedAt,
  }
}

test('keeps one page canonical through twenty reloads', async ({ page }) => {
  await enterWithCredentials(page, fixtures.single)
  const evidence = []
  for (let reloadNumber = 1; reloadNumber <= 20; reloadNumber += 1) {
    evidence.push(await reloadVillage(page, reloadNumber))
  }
  expect(new Set(evidence.map(({ worldId }) => worldId)).size).toBe(1)
  console.info(`HYDRATION_ONE_PAGE ${JSON.stringify(evidence)}`)
})

test('isolates two worlds through twenty combined concurrent reloads', async ({ browser }) => {
  const contextA = await browser.newContext()
  const contextB = await browser.newContext()
  try {
    const pageA = await contextA.newPage()
    const pageB = await contextB.newPage()
    await Promise.all([
      enterWithCredentials(pageA, fixtures.pageA),
      enterWithCredentials(pageB, fixtures.pageB),
    ])
    const evidenceA = []
    const evidenceB = []
    for (let reloadNumber = 1; reloadNumber <= 10; reloadNumber += 1) {
      const [resultA, resultB] = await Promise.all([
        reloadVillage(pageA, reloadNumber),
        reloadVillage(pageB, reloadNumber),
      ])
      evidenceA.push(resultA)
      evidenceB.push(resultB)
    }
    expect(new Set(evidenceA.map(({ worldId }) => worldId)).size).toBe(1)
    expect(new Set(evidenceB.map(({ worldId }) => worldId)).size).toBe(1)
    expect(evidenceA[0].worldId).not.toBe(evidenceB[0].worldId)
    console.info(`HYDRATION_TWO_PAGE ${JSON.stringify({ pageA: evidenceA, pageB: evidenceB })}`)
  } finally {
    await contextA.close()
    await contextB.close()
  }
})

for (const [width, height, fixture] of [
  [375, 667, fixtures.mobile375],
  [390, 844, fixtures.mobile390],
  [430, 932, fixtures.mobile430],
]) {
  test(`keeps ${width}x${height} mobile terrain through ten reloads`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    })
    try {
      const page = await context.newPage()
      await enterWithCredentials(page, fixture)
      const evidence = []
      for (let reloadNumber = 1; reloadNumber <= 10; reloadNumber += 1) {
        evidence.push(await reloadVillage(page, reloadNumber))
      }
      expect(new Set(evidence.map(({ worldId }) => worldId)).size).toBe(1)
      console.info(`HYDRATION_MOBILE_${width} ${JSON.stringify(evidence)}`)
    } finally {
      await context.close()
    }
  })
}
