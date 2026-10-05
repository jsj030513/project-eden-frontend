import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { PIXEL_TILE_ATLAS, lookupPixelTile, pixelTileStyle } from '../src/components/village/pixelTileManifest'
import { resolveWorldTile, resolveWorldTiles } from '../src/components/village/worldTileResolver'

for (const [terrainType, family] of [['GRASS', 'grass'], ['ROAD', 'path'], ['SOIL', 'soil'], ['WATER', 'water'], ['ROCK', 'rock-ground']]) {
  test(`${terrainType} selects real ${family} art at the deterministic variant`, () => {
    const tile = resolveWorldTile({ terrainType, tileX: -7, tileY: 3 })
    const visual = lookupPixelTile(tile)
    expect(visual.family).toBe(family)
    expect(visual.variantIndex).toBe(tile.variantIndex)
    expect(visual.layers.at(-1)).toEqual(PIXEL_TILE_ATLAS.families[family].variants[tile.variantIndex])
  })
}

test('road north/east boundary selects exact edges and the outer NE corner', () => {
  const visual = lookupPixelTile(resolveWorldTile({ terrainType: 'ROAD', neighbors: { north: 'GRASS', east: 'GRASS' } }))
  expect(visual.mode).toBe('exact')
  expect(visual.layers.map(({ key }) => key)).toEqual([
    'terrain/path/outer/northEast', 'terrain/path/edge/north', 'terrain/path/edge/east',
    expect.stringMatching(/^terrain\/path\/base\/variant-[0-3]$/),
  ])
})

test('water supports a diagonal inner corner with no cardinal shoreline', () => {
  const visual = lookupPixelTile(resolveWorldTile({ terrainType: 'WATER', neighbors: { north: 'WATER', east: 'WATER', northEast: 'GRASS' } }))
  expect(visual.layers[0].key).toBe('terrain/water/inner/northEast')
  expect(visual.layers).toHaveLength(2)
})

test('isolated road combines all four edges and four outer corners over an opaque base', () => {
  const visual = lookupPixelTile({ family: 'path', variantIndex: 2, edgeMask: 15, cornerMask: 15 })
  expect(visual.mode).toBe('exact')
  expect(visual.layers).toHaveLength(9)
  expect(visual.layers.at(-1).key).toBe('terrain/path/base/variant-2')
})

test('all road/soil/water 8-neighbor combinations have composable atlas coverage', () => {
  for (const family of ['path', 'soil', 'water']) {
    for (let mask = 0; mask < 256; mask += 1) {
      const visual = lookupPixelTile({ family, variantIndex: 3, edgeMask: mask & 15, cornerMask: mask >> 4 })
      expect(visual.mode).toBe('exact')
      expect(visual.layers.every((layer) => layer.rect.width === 16 && layer.rect.height === 16)).toBe(true)
      expect(visual.layers.at(-1).atlas).toBe('base')
    }
  }
})

test('soil grass rims do not invent grass at water and rock boundaries; bridges keep water open', () => {
  const soil = lookupPixelTile(resolveWorldTile({ terrainType: 'SOIL', neighbors: { north: 'GRASS', east: 'WATER', south: 'ROCK' } }))
  expect(soil.edgeMask).toBe(1)
  const water = lookupPixelTile(resolveWorldTile({ terrainType: 'WATER', neighbors: { north: 'BRIDGE', east: 'ROCK' } }))
  expect(water.edgeMask).toBe(2)
})

test('unsupported masks fall back to the same family base variant', () => {
  for (const edgeMask of [-1, 16, 1.5, undefined]) {
    const visual = lookupPixelTile({ family: 'water', variantIndex: 2, edgeMask, cornerMask: 0 })
    expect(visual.mode).toBe('base')
    expect(visual.layers.map(({ key }) => key)).toEqual(['terrain/water/base/variant-2'])
  }
  expect(lookupPixelTile({ family: 'grass', variantIndex: 1, edgeMask: 15, cornerMask: 15 }).mode).toBe('base')
})

test('failed transitions use base; failed base and unknown terrain use legacy CSS', () => {
  const tile = resolveWorldTile({ terrainType: 'WATER', neighbors: { north: 'GRASS' } })
  expect(lookupPixelTile(tile, { transitionsAvailable: false }).layers).toHaveLength(1)
  expect(lookupPixelTile(tile, { baseAvailable: false })).toBeNull()
  for (const terrainType of ['FUTURE']) {
    expect(lookupPixelTile(resolveWorldTile({ terrainType }))).toBeNull()
  }
})

test('tile reorder/reload keeps the actual atlas rectangles and styles deterministic', () => {
  const tiles = ['GRASS', 'ROAD', 'SOIL', 'WATER', 'ROCK'].map((terrainType, index) => ({ x: index - 3, y: -5, terrainType }))
  const styles = (source) => resolveWorldTiles(source).map((tile) => ({ x: tile.x, visual: lookupPixelTile(tile), style: pixelTileStyle(lookupPixelTile(tile)) })).sort((a, b) => a.x - b.x)
  expect(styles(tiles)).toEqual(styles([...tiles].reverse()))
})

test('source rectangles and CSS positions scale by exactly three without fractional dimensions', () => {
  expect(PIXEL_TILE_ATLAS.sourceTileSize).toBe(16)
  expect(PIXEL_TILE_ATLAS.displayTileSize).toBe(48)
  for (const family of Object.values(PIXEL_TILE_ATLAS.families)) {
    for (const layer of [...family.variants, ...Object.values(family.transitions)]) {
      const sheet = PIXEL_TILE_ATLAS.atlases[layer.atlas]
      expect(layer.rect.x + 16).toBeLessThanOrEqual(sheet.width)
      expect(layer.rect.y + 16).toBeLessThanOrEqual(sheet.height)
      const style = pixelTileStyle({ layers: [layer] })
      expect(style.width).toBe(48)
      expect(style.backgroundPosition).toBe(`${-layer.rect.x * 3}px ${-layer.rect.y * 3}px`)
      expect(style.backgroundSize).toBe(`${sheet.width * 3}px ${sheet.height * 3}px`)
    }
  }
})

test('PNG dimensions match the manifest and every family base is opaque with its declared distinct variants', () => {
  for (const [name, sheet] of Object.entries(PIXEL_TILE_ATLAS.atlases)) {
    const png = readFileSync(new URL(`../public${sheet.url}`, import.meta.url))
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(png.readUInt32BE(16)).toBe(sheet.width)
    expect(png.readUInt32BE(20)).toBe(sheet.height)
    const chunks = []
    for (let offset = 8; offset < png.length;) {
      const length = png.readUInt32BE(offset)
      if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length))
      offset += length + 12
    }
    const pixels = inflateSync(Buffer.concat(chunks))
    const stride = sheet.width * 4 + 1
    if (name === 'base') {
      for (let y = 0; y < sheet.height; y += 1) {
        expect(pixels[y * stride]).toBe(0)
        for (let x = 0; x < sheet.width; x += 1) expect(pixels[y * stride + 1 + x * 4 + 3]).toBe(255)
      }
      for (const [name, family] of Object.entries(PIXEL_TILE_ATLAS.families)) {
        const expectedCount = ['bridge', 'building-footprint', 'cliff'].includes(name) ? 2 : 4
        expect(family.variants).toHaveLength(expectedCount)
        const signatures = family.variants.map(({ rect }) => Buffer.concat(Array.from({ length: 16 }, (_, y) => pixels.subarray((rect.y + y) * stride + 1 + rect.x * 4, (rect.y + y) * stride + 1 + (rect.x + 16) * 4))).toString('hex'))
        expect(new Set(signatures).size).toBe(expectedCount)
      }
    }
  }
})
