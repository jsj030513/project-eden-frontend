import { expect, test } from '@playwright/test'
import { createServer } from 'vite'

// Use the existing Vite/Playwright stack; these API/policy checks need no browser.
let vite
let policy
let classifyImage
let ApiError

test.beforeAll(async () => {
  vite = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  policy = await vite.ssrLoadModule('/src/hooks/useVisionCapture.js')
  ;({ classifyImage } = await vite.ssrLoadModule('/src/api/visionApi.js'))
  ;({ ApiError } = await vite.ssrLoadModule('/src/api/httpClient.js'))
})

test.afterAll(async () => { await vite?.close() })

test('Vision validates presence and the inclusive 10 MiB boundary only', () => {
  expect(policy.validateVisionFile(null)).toContain('먼저 선택')
  expect(policy.validateVisionFile({ size: 10 * 1024 * 1024 })).toBeNull()
  expect(policy.validateVisionFile({ size: 10 * 1024 * 1024 + 1 })).toContain('10MiB')
  // Decoding, empty files, MIME/content mismatch and unsupported formats belong to the backend.
  for (const type of ['', 'image/jpeg', 'image/mpo', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/octet-stream']) {
    expect(policy.validateVisionFile({ size: 0, type })).toBeNull()
  }
  expect(policy.VISION_FILE_ACCEPT).toBe('.jpg,.jpeg,.mpo,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif')
})

for (const [status, code, message] of [
  [401, undefined, '로그인이 만료'],
  [503, 'VISION_DISABLED', '비활성화'],
  [503, 'VISION_CONNECTION_FAILED', '연결하지 못했습니다'],
  [504, 'VISION_TIMEOUT', '시간이 초과'],
  [413, 'VISION_IMAGE_TOO_LARGE', '용량 또는 해상도'],
  [415, 'VISION_IMAGE_UNSUPPORTED', '지원하지 않는 사진 형식'],
  [422, 'VISION_IMAGE_INVALID', '읽을 수 없습니다'],
  [502, 'VISION_INVALID_RESPONSE', '분석하지 못했습니다'],
  [502, 'VISION_UPSTREAM_ERROR', '분석하지 못했습니다'],
  [500, 'FUTURE_BACKEND_CODE', '분석하지 못했습니다'],
]) {
  test(`sanitizes ${code || status} while preserving the supplied backend code`, () => {
    const failure = policy.getVisionFailure(new ApiError('private upstream stack /srv/vision', {
      status,
      type: 'SERVER',
      details: { code, message: 'private upstream stack /srv/vision' },
    }))
    expect(failure).toMatchObject({ status, code: code ?? null })
    expect(failure.message).toContain(message)
    expect(failure.message).not.toMatch(/private|upstream|stack|\/srv/)
  })
}

test('network failures and unrecognized 503 responses do not invent a backend code', () => {
  expect(policy.getVisionFailure(new ApiError('private', { type: 'NETWORK' }))).toMatchObject({
    code: null, type: 'NETWORK', message: expect.stringContaining('연결하지 못했습니다'),
  })
  expect(policy.getVisionFailure(new ApiError('private', { status: 503 }))).toMatchObject({
    code: null, message: expect.stringContaining('사용할 수 없습니다'),
  })
  expect(policy.getVisionFailure(new ApiError('private', { details: { code: 'toString' } })).message)
    .toContain('분석하지 못했습니다')
})

test('V3 client sends image multipart exactly once and preserves the entire ranking response', async () => {
  const originalFetch = globalThis.fetch
  const originalWindow = globalThis.window
  const requests = []
  const result = {
    status: 'ranked',
    ranking: [{ label: 'second', raw_score: -0.123456789 }, { label: 'first', raw_score: 4.567890123 }],
    unknown_decision: 'not_applied',
    metadata: { retained: true },
  }
  const file = new File(['test-image'], 'photo.heic', { type: 'image/heic' })
  const controller = new AbortController()
  try {
    globalThis.window = { sessionStorage: { getItem: () => 'test.access.token' } }
    globalThis.fetch = async (url, options) => {
      requests.push({ url, options })
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
    }
    expect(await classifyImage(file, { signal: controller.signal })).toEqual(result)
    expect(requests).toHaveLength(1)
    expect(new URL(requests[0].url, 'http://test.local').pathname).toBe('/api/vision/classify')
    expect(requests[0].options.method).toBe('POST')
    expect(requests[0].options.signal).toBe(controller.signal)
    expect([...requests[0].options.body.keys()]).toEqual(['image'])
    expect(requests[0].options.body.get('image')).toBe(file)
    expect(requests[0].options.headers.get('Authorization')).toBe('Bearer test.access.token')
    expect(requests[0].options.headers.has('Content-Type')).toBe(false)
  } finally {
    globalThis.fetch = originalFetch
    if (originalWindow === undefined) delete globalThis.window
    else globalThis.window = originalWindow
  }
})
