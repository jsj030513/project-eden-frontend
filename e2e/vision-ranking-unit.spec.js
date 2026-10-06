import { expect, test } from '@playwright/test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

let vite
let VisionRanking
let CapturePage

test.beforeAll(async () => {
  vite = await createServer({ server: { middlewareMode: true, ws: false }, appType: 'custom' })
  ;({ default: VisionRanking } = await vite.ssrLoadModule('/src/components/vision/VisionRanking.jsx'))
  ;({ default: CapturePage } = await vite.ssrLoadModule('/src/pages/CapturePage.jsx'))
})
test.afterAll(async () => { await vite?.close() })

const item = (rank, name) => ({ rank, display_name: name, concept_id: `private-id-${rank}`,
  broad_category: null, hierarchy: [], raw_score: rank === 1 ? -12.3456789 : 98.7654321,
  score_kind: 'raw_image_text_logit' })
const response = (ranking) => ({ schema_version: '1.1', status: 'ranked', predictions: [],
  unknown_decision: 'not_applied', ranking })
const render = (result) => renderToStaticMarkup(createElement(VisionRanking, { result }))

for (const count of [1, 5]) {
  test(`renders ${count} candidates with empty predictions and no UNKNOWN decision`, () => {
    const result = response(Array.from({ length: count }, (_, index) => item(index + 1, `candidate-${index + 1}`)))
    const html = render(result)
    expect(html.match(/<li /g)).toHaveLength(count)
    expect(html.match(/가장 가까운 후보/g)).toHaveLength(1)
    expect(html.match(/다른 후보/g) ?? []).toHaveLength(count - 1)
    expect(html).toContain('확정된 식별 결과가 아닙니다.')
    expect(html).not.toMatch(/raw_score|raw_image_text_logit|private-id|12\.3456789|98\.7654321|confidence|probability|정답|정확도|신뢰도|확률|%/)
  })
}

test('preserves supplied order and rank values without mutating the response', () => {
  const ranking = Object.freeze([Object.freeze(item(4, 'first-supplied')), Object.freeze(item(2, 'second-supplied'))])
  const result = Object.freeze(response(ranking))
  const before = JSON.stringify(result)
  const html = render(result)
  expect(html.indexOf('first-supplied')).toBeLessThan(html.indexOf('second-supplied'))
  expect(html).toContain('value="4"')
  expect(html).toContain('value="2"')
  expect(JSON.stringify(result)).toBe(before)
})

for (const [name, result] of [
  ['null', null], ['wrong status', { status: 'error', ranking: [item(1, 'hidden')] }],
  ['missing ranking', { status: 'ranked' }], ['empty ranking', response([])],
  ['non-array', response({})], ['null item', response([null])],
  ['invalid name', response([{ ...item(1, 'unused'), display_name: {} }])],
  ['missing rank', response([{ display_name: 'unused' }])],
]) {
  test(`shows a safe state for ${name}`, () => {
    const html = render(result)
    expect(html).toContain('분석 결과를 표시할 수 없습니다.')
    expect(html).toContain('role="alert"')
    expect(html).not.toContain('<li')
  })
}

test('renders optional category as escaped text without interpreting hierarchy', () => {
  const html = render(response([{ ...item(1, '<script>example</script>'), broad_category: 'animal', hierarchy: ['private-parent'] }]))
  expect(html).toContain('분류: animal')
  expect(html).toContain('&lt;script&gt;example&lt;/script&gt;')
  expect(html).not.toContain('<script>')
  expect(html).not.toContain('private-parent')
})

test('memory retains its capture UI and never renders the ranking component', () => {
  const html = renderToStaticMarkup(createElement(CapturePage, { captureState: { status: 'idle' } }))
  expect(html).toContain("TODAY&#x27;S MOMENT")
  expect(html).toContain('accept="image/*"')
  expect(html).not.toContain('vision-ranking')
  expect(html).not.toContain('사진 분석 후보')
})
