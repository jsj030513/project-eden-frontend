import { expect, test } from '@playwright/test'
import { configureResourceStableRendering } from './village-resource-stable-rendering'

// Match backend API pathnames only; Vite's /src/api/ modules must load normally.
// All API traffic is intercepted: this suite never needs or mutates a backend.
const MAX_SIZE = 10 * 1024 * 1024
const ACCEPT = '.jpg,.jpeg,.mpo,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const RESULT = {
  status: 'ranked',
  schema_version: '1.1',
  predictions: [],
  ranking: [
    { rank: 1, concept_id: 'internal-a', display_name: 'keep-first', broad_category: 'animal', hierarchy: [], raw_score: -0.123456789, score_kind: 'raw_image_text_logit' },
    { rank: 2, concept_id: 'internal-b', display_name: 'keep-second', broad_category: null, hierarchy: [], raw_score: 3.987654321, score_kind: 'raw_image_text_logit' },
  ],
  unknown_decision: 'not_applied',
  meta: { preserved: true },
}
const WORLD = {
  worldId: 1,
  mapBounds: { minX: 0, minY: 0, maxX: 23, maxY: 15 },
  playerPosition: { x: 11, y: 10 },
  terrainTiles: Array.from({ length: 384 }, (_, index) => ({ x: index % 24, y: Math.floor(index / 24), terrainType: 'GRASS', walkable: true })),
  placedObjects: [{ id: 7, assetType: 'FARM_PLOT_EMPTY', worldCategory: 'FARM', x: 480, y: 480 }],
  npcPositions: [],
  availableInteractions: [
    { type: 'INSPECT', x: 10, y: 10, available: true },
    { type: 'INTERACT', targetId: 7, targetAssetType: 'FARM_PLOT_EMPTY', category: 'FARM', displayName: '비어 있는 밭', x: 10, y: 10, available: true },
  ],
}

async function enterVillage(page) {
  const requests = []
  await configureResourceStableRendering(page)
  await page.addInitScript(() => {
    sessionStorage.setItem('projectEdenAccessToken', 'test.access.token')
    sessionStorage.setItem('projectEdenTutorialCompleted', 'true')
    const create = URL.createObjectURL.bind(URL)
    const revoke = URL.revokeObjectURL.bind(URL)
    window.objectUrls = { created: [], revoked: [] }
    URL.createObjectURL = (file) => {
      const url = create(file)
      window.objectUrls.created.push(url)
      return url
    }
    URL.revokeObjectURL = (url) => { window.objectUrls.revoked.push(url); revoke(url) }
  })
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    requests.push({ method: request.method(), path })
    const responses = {
      '/api/characters/me': { id: 1 },
      '/api/worlds/me': { id: 1 },
      '/api/houses/me': { id: 1 },
      '/api/inventories/me': { id: 1 },
      '/api/village/me': { id: 1 },
      '/api/village/interpretation': {},
      '/api/village/changes': [],
      '/api/village/history': [],
      '/api/npcs/me': [],
      '/api/worlds/me/state': WORLD,
      '/api/worlds/me/chunks': { world: { worldId: 1, minTileX: 0, minTileY: 0, maxTileX: 23, maxTileY: 15 }, chunks: [] },
      '/api/worlds/me/interactions/7/progress': [],
      '/api/photos': { photoId: 42 },
      '/api/photos/42/recognize': { recognizedObject: 'UNKNOWN', recognized: false },
      '/api/worlds/me/plant-memory': { plantingApplied: false, recognition: { recognizedObject: 'UNKNOWN' } },
    }
    return route.fulfill({
      status: Object.hasOwn(responses, path) ? 200 : 500,
      json: responses[path] ?? { message: `Unexpected test request: ${path}` },
    })
  })
  await page.goto('/')
  await page.getByRole('button', { name: '마을로 들어가기' }).click()
  await expect(page.locator('.village-page .persistent-terrain')).toHaveAttribute('data-total-count', '384')
  return requests
}

async function openVision(page) {
  const requests = await enterVillage(page)
  await page.getByRole('button', { name: '좌표 10, 10 살펴보기', exact: true }).click()
  const inspect = page.getByRole('complementary', { name: '타일 살펴보기' })
  await expect(inspect.getByRole('button', { name: '사진으로 기억 심기', exact: true })).toBeVisible()
  await inspect.getByRole('button', { name: '사진 분석', exact: true }).click()
  await expect(page.locator('[data-capture-mode="vision"]')).toBeVisible()
  return requests
}

async function selectFile(page, { name = 'sample.png', mimeType = 'image/png', buffer = PNG } = {}) {
  await page.getByLabel('분석할 사진 선택', { exact: true }).setInputFiles({ name, mimeType, buffer })
}

test('Capture hook stores the entire response unchanged and clears it for a new selection', async ({ page }) => {
  const modulePaths = ['/src/api/httpClient.js', '/src/api/visionApi.js']
  const moduleResponses = new Map()
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname
    if (modulePaths.includes(path)) moduleResponses.set(path, response)
  })
  const requests = await enterVillage(page)
  for (const path of modulePaths) {
    expect(moduleResponses.get(path)?.status()).toBe(200)
    expect(moduleResponses.get(path)?.headers()['content-type']).toContain('javascript')
    expect(requests.some((request) => request.path === path)).toBe(false)
  }
  let calls = 0
  await page.route((url) => url.pathname === '/api/vision/classify', (route) => {
    calls += 1
    return route.fulfill({ json: RESULT })
  })
  // Mount a test-only consumer of the same hook, without adding production debug state.
  await page.evaluate(async () => {
    // Reuse the app's versioned React modules and their Vite CommonJS default exports.
    const dependencyUrl = (name) => performance.getEntriesByType('resource')
      .find((entry) => new URL(entry.name).pathname === `/node_modules/.vite/deps/${name}.js`).name
    const [{ default: { createElement } }, { default: { createRoot } }, { useVisionCapture }] = await Promise.all([
      import(dependencyUrl('react')),
      import(dependencyUrl('react-dom_client')),
      import('/src/hooks/useVisionCapture.js'),
    ])
    const container = document.createElement('div')
    document.body.appendChild(container)
    function Probe() {
      const vision = useVisionCapture()
      window.visionProbe = vision
      return createElement('output', { 'data-testid': 'vision-result' }, JSON.stringify(vision.visionResult))
    }
    createRoot(container).render(createElement(Probe))
  })
  await expect(page.getByTestId('vision-result')).toHaveText('null')
  await page.evaluate(async () => {
    const file = new File(['image'], 'sample.heic', { type: 'image/heic' })
    await Promise.all([window.visionProbe.analyzeImage(file), window.visionProbe.analyzeImage(file)])
  })
  await expect(page.getByTestId('vision-result')).toHaveText(JSON.stringify(RESULT))
  expect(calls).toBe(1)
  await page.evaluate(() => window.visionProbe.resetVision(new File(['next'], 'next.png')))
  await expect(page.getByTestId('vision-result')).toHaveText('null')
  // Even a transport ignoring abort must not let an older response overwrite a new one.
  await page.evaluate(() => {
    window.savedFetch = window.fetch
    window.deferredVision = []
    window.fetch = () => new Promise((resolve) => window.deferredVision.push(resolve))
    window.oldAnalysis = window.visionProbe.analyzeImage(new File(['old'], 'old.png'))
  })
  await page.evaluate(() => {
    window.visionProbe.resetVision()
    window.newAnalysis = window.visionProbe.analyzeImage(new File(['new'], 'new.png'))
  })
  await page.evaluate(async (result) => {
    window.deferredVision[1](new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } }))
    await window.newAnalysis
    window.deferredVision[0](new Response(JSON.stringify({ ...result, ranking: [] }), { headers: { 'Content-Type': 'application/json' } }))
    await window.oldAnalysis
    window.fetch = window.savedFetch
  }, RESULT)
  await expect(page.getByTestId('vision-result')).toHaveText(JSON.stringify(RESULT))
})

test('INSPECT keeps both entries and restores selection on Vision return and Escape', async ({ page }) => {
  const requests = await openVision(page)
  await expect(page.getByLabel('분석할 사진 선택', { exact: true })).toHaveAttribute('accept', ACCEPT)
  await expect(page.getByLabel('분석할 사진 촬영')).toHaveAttribute('capture', 'environment')
  for (const exit of ['button', 'Escape']) {
    if (exit === 'button') await page.getByRole('button', { name: '마을로 돌아가기' }).click()
    else await page.keyboard.press('Escape')
    await expect(page.getByRole('complementary', { name: '타일 살펴보기' })).toBeVisible()
    await expect(page.getByRole('button', { name: '좌표 10, 10 살펴보기', exact: true })).toHaveAttribute('aria-pressed', 'true')
    if (exit === 'button') await page.getByRole('button', { name: '사진 분석', exact: true }).click()
  }
  expect(requests.filter(({ method }) => method === 'POST')).toEqual([])
  expect(requests.filter(({ path }) => path === '/api/worlds/me/state')).toHaveLength(1)
})

test('requires a file, rejects 10 MiB + 1, allows exactly 10 MiB and blocks duplicate submits', async ({ page }) => {
  const requests = await openVision(page)
  const pending = []
  await page.route((url) => url.pathname === '/api/vision/classify', (route) => { pending.push(route) })
  await page.getByRole('button', { name: '분석하기', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('먼저 선택')
  await selectFile(page, { buffer: Buffer.alloc(MAX_SIZE + 1) })
  await expect(page.getByRole('alert')).toContainText('10MiB')
  await page.getByRole('button', { name: '다시 분석하기' }).click()
  expect(pending).toHaveLength(0)
  await selectFile(page, { buffer: Buffer.alloc(MAX_SIZE) })
  await expect(page.getByRole('alert')).toHaveCount(0)
  await page.getByRole('button', { name: '분석하기', exact: true }).dblclick()
  await expect(page.getByRole('button', { name: '분석 중…' })).toBeDisabled()
  await expect(page.getByLabel('분석할 사진 선택', { exact: true })).toBeDisabled()
  await expect.poll(() => pending.length).toBe(1)
  const request = pending[0].request()
  expect(request.method()).toBe('POST')
  expect(request.headers()['content-type']).toContain('multipart/form-data; boundary=')
  expect(request.postDataBuffer().subarray(0, 300).toString()).toContain('name="image"')
  await pending[0].fulfill({ json: RESULT })
  await expect(page.getByRole('status')).toContainText('분석 응답을 받았습니다.')
  await expect(page.locator('[data-capture-mode="vision"]')).toHaveAttribute('data-capture-status', 'success')
  await expect(page.getByRole('button', { name: '다른 사진 분석', exact: true })).toBeEnabled()
  const ranking = page.getByRole('region', { name: '사진 분석 후보' })
  await expect(ranking.getByRole('listitem')).toHaveCount(2)
  await expect(ranking.getByRole('listitem').first()).toContainText('가장 가까운 후보')
  await expect(ranking.getByRole('heading', { level: 3 })).toHaveText(['keep-first', 'keep-second'])
  await expect(ranking).not.toContainText('-0.123456789')
  await expect(ranking).toContainText('확정된 식별 결과가 아닙니다.')
  await page.getByRole('button', { name: '다른 사진 분석' }).click()
  await expect(ranking).toHaveCount(0)
  await expect(page.locator('.capture-preview')).toHaveCount(0)
  await expect(page.locator('[data-capture-mode="vision"]')).toHaveAttribute('data-capture-status', 'idle')
  expect(await page.evaluate(() => window.objectUrls.revoked)).toEqual(await page.evaluate(() => window.objectUrls.created))
  expect(pending).toHaveLength(1)
  expect(requests.filter(({ method }) => method === 'POST')).toEqual([])
})

test('releases object URLs on replacement and unmount; unpreviewable files still upload', async ({ page }) => {
  await openVision(page)
  const names = []
  await page.route((url) => url.pathname === '/api/vision/classify', (route) => {
    names.push(route.request().postDataBuffer().toString())
    return route.fulfill({ json: RESULT })
  })
  await selectFile(page)
  await expect(page.getByAltText('분석할 사진')).toBeVisible()
  for (const extension of ['heic', 'heif', 'mpo']) {
    await selectFile(page, { name: `sample.${extension}`, mimeType: '', buffer: Buffer.from('browser-cannot-decode') })
    await expect(page.getByText('미리보기를 지원하지 않는 형식일 수 있습니다')).toBeVisible()
    await expect(page.locator('figcaption')).toContainText(`sample.${extension}`)
    await expect(page.locator('figcaption')).toContainText('bytes')
    await page.getByRole('button', { name: '분석하기', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('분석 응답을 받았습니다.')
    await expect(page.getByRole('region', { name: '사진 분석 후보' })).toBeVisible()
    await page.getByRole('button', { name: '다른 사진 분석' }).click()
  }
  expect(names).toHaveLength(3)
  await page.getByRole('button', { name: '마을로 돌아가기' }).click()
  expect(await page.evaluate(() => window.objectUrls.revoked)).toEqual(await page.evaluate(() => window.objectUrls.created))
})

for (const [status, code, message] of [
  [401, undefined, '로그인이 만료'],
  [503, 'VISION_DISABLED', '비활성화'],
  [503, 'VISION_CONNECTION_FAILED', '연결하지 못했습니다'],
  [504, 'VISION_TIMEOUT', '시간이 초과'],
  [502, 'VISION_UPSTREAM_ERROR', '분석하지 못했습니다'],
]) {
  test(`shows safe ${code || status} failure and supports recovery`, async ({ page }) => {
    await openVision(page)
    let count = 0
    await page.route((url) => url.pathname === '/api/vision/classify', (route) => {
      count += 1
      return count === 1
        ? route.fulfill({ status, json: { code, message: 'private stack /srv/vision' } })
        : route.fulfill({ json: RESULT })
    })
    await selectFile(page)
    await page.getByRole('button', { name: '분석하기', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page.getByRole('alert')).not.toContainText('/srv/vision')
    if (status === 401) {
      await page.getByRole('button', { name: '다시 로그인하기' }).click()
      await expect(page.getByRole('textbox', { name: '이메일' })).toBeVisible()
    } else {
      await page.getByRole('button', { name: '다시 분석하기' }).click()
      await expect(page.getByRole('status')).toContainText('분석 응답을 받았습니다.')
      expect(count).toBe(2)
    }
  })
}

test('rejects a malformed successful response', async ({ page }) => {
  await openVision(page)
  await page.route((url) => url.pathname === '/api/vision/classify', (route) => route.fulfill({ json: { status: 'ranked' } }))
  await selectFile(page)
  await page.getByRole('button', { name: '분석하기', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('분석 결과를 표시할 수 없습니다.')
  await expect(page.getByRole('status')).not.toContainText('분석 응답을 받았습니다.')
})

for (const count of [0, 1, 5]) {
  test(`renders ${count} returned candidates safely and returns to INSPECT`, async ({ page }) => {
    await openVision(page)
    let calls = 0
    const result = { ...RESULT, ranking: Array.from({ length: count }, (_, index) => ({
      ...RESULT.ranking[0], rank: index + 1, concept_id: `private-${index}`,
      display_name: `candidate-${index + 1}-${'long-name-'.repeat(12)}`,
    })) }
    await page.route((url) => url.pathname === '/api/vision/classify', (route) => {
      calls += 1
      return route.fulfill({ json: result })
    })
    await page.setViewportSize({ width: 375, height: 667 })
    await selectFile(page)
    await page.getByRole('button', { name: '분석하기', exact: true }).click()
    if (count) {
      const ranking = page.getByRole('region', { name: '사진 분석 후보' })
      await expect(ranking.getByRole('listitem')).toHaveCount(count)
      await expect(ranking).not.toContainText('private-')
      await expect(ranking).not.toContainText('raw_image_text_logit')
    } else {
      await expect(page.getByRole('alert')).toHaveText('분석 결과를 표시할 수 없습니다.')
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    await page.getByRole('button', { name: '마을로 돌아가기' }).click()
    await expect(page.getByRole('complementary', { name: '타일 살펴보기' })).toBeVisible()
    await page.getByRole('button', { name: '사진 분석', exact: true }).click()
    await expect(page.locator('.vision-ranking')).toHaveCount(0)
    await expect(page.locator('.capture-preview')).toHaveCount(0)
    expect(calls).toBe(1)
  })
}

test('return during a pending request revokes the preview and reopens an empty Vision session', async ({ page }) => {
  await openVision(page)
  const pending = []
  await page.route((url) => url.pathname === '/api/vision/classify', (route) => { pending.push(route) })
  await selectFile(page)
  await page.getByRole('button', { name: '분석하기', exact: true }).click()
  await expect.poll(() => pending.length).toBe(1)
  await page.getByRole('button', { name: '마을로 돌아가기' }).click()
  await page.getByRole('button', { name: '사진 분석', exact: true }).click()
  await pending[0].fulfill({ json: RESULT }).catch(() => {})
  await expect(page.locator('[data-capture-mode="vision"]')).toHaveAttribute('data-capture-status', 'idle')
  await expect(page.locator('.capture-preview')).toHaveCount(0)
  expect(await page.evaluate(() => window.objectUrls.revoked)).toEqual(await page.evaluate(() => window.objectUrls.created))
})

test('memory retains its accept policy and upload/recognition retry without calling Vision', async ({ page }) => {
  const requests = await openVision(page)
  await page.getByRole('button', { name: '마을로 돌아가기' }).click()
  await page.getByRole('button', { name: '사진으로 기억 심기', exact: true }).click()
  await expect(page.locator('[data-capture-mode="GENERAL_MEMORY"]')).toBeVisible()
  const input = page.locator('input[type="file"]').last()
  await expect(input).toHaveAttribute('accept', 'image/*')
  await input.setInputFiles({ name: 'memory.png', mimeType: 'image/png', buffer: Buffer.alloc(MAX_SIZE + 1) })
  await page.getByRole('button', { name: '기억 남기기' }).click()
  await expect(page.getByRole('button', { name: '같은 사진 다시 살펴보기' })).toBeVisible()
  await page.getByRole('button', { name: '같은 사진 다시 살펴보기' }).click()
  await expect.poll(() => requests.filter(({ path }) => path === '/api/photos/42/recognize').length).toBe(2)
  expect(requests.filter(({ method }) => method === 'POST').map(({ path }) => path))
    .toEqual(['/api/photos', '/api/photos/42/recognize', '/api/photos/42/recognize'])
})

test('targeted memory still submits only the photo and plant-memory request', async ({ page }) => {
  const requests = await enterVillage(page)
  await page.getByRole('button', { name: '비어 있는 밭 · 살펴보기', exact: true }).click()
  await page.getByRole('region', { name: '비어 있는 밭 살펴보기' }).getByRole('button', { name: '사진으로 기억 심기' }).click()
  await expect(page.locator('[data-capture-mode="TARGETED_PLANTING"]')).toHaveAttribute('data-target-id', '7')
  await page.locator('input[type="file"]').last().setInputFiles({ name: 'memory.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: '기억 남기기' }).click()
  await expect(page.locator('.village-stage')).toBeVisible()
  expect(requests.filter(({ method }) => method === 'POST').map(({ path }) => path))
    .toEqual(['/api/worlds/me/interactions/7/progress', '/api/photos', '/api/worlds/me/plant-memory'])
})

for (const viewport of [{ width: 375, height: 667 }, { width: 667, height: 375 }]) {
  test(`Vision controls and fallback fit at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openVision(page)
    await selectFile(page, { name: `${'long-filename-'.repeat(20)}.heic`, mimeType: '', buffer: Buffer.from('no-preview') })
    await expect(page.getByText('미리보기를 지원하지 않는 형식일 수 있습니다')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
    const back = page.getByRole('button', { name: '마을로 돌아가기' })
    await back.scrollIntoViewIfNeeded()
    await expect(back).toBeInViewport()
    await back.click()
    await expect(page.getByRole('complementary', { name: '타일 살펴보기' })).toBeVisible()
  })
}
