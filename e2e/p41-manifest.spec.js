import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'
import { PIXEL_TILE_ATLAS as atlas, lookupPixelTile, pixelTileStyle } from '../src/components/village/pixelTileManifest'
import { CARDINAL_NEIGHBORS, DIAGONAL_NEIGHBORS, resolveWorldTile, resolveWorldTiles } from '../src/components/village/worldTileResolver'
import { buildP41Tiles } from './p41-terrain-fixture'
import { buildAuditedWorld } from './hub-pixel-fixture'

const resolved = resolveWorldTiles(buildP41Tiles())
const at = (x, y) => resolved.find((tile) => tile.x === x && tile.y === y)
const keys = (visual) => visual.layers.slice(0, -1).map((layer) => layer.key)
const art = (type, neighbors) => lookupPixelTile(resolveWorldTile({ terrainType: type, neighbors }))

function scanlines(name) {
  const png = readFileSync(new URL(`../public${atlas.atlases[name].url}`, import.meta.url))
  const chunks = []
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  return inflateSync(Buffer.concat(chunks))
}

test('P4-1 appends atlas rows while preserving every P2 rectangle and pixel', () => {
  expect(atlas.atlases.base).toMatchObject({ width: 64, height: 176 })
  expect(atlas.atlases.transitions).toMatchObject({ width: 64, height: 352 })
  for (const [row, name] of ['grass', 'path', 'soil', 'water', 'rock-ground'].entries()) {
    atlas.families[name].variants.forEach((layer, column) => expect(layer.rect).toEqual({ x: column * 16, y: row * 16, width: 16, height: 16 }))
  }
  for (const [row, name] of ['path', 'soil', 'water'].entries()) {
    for (const [kind, prefix] of ['edge', 'outer', 'inner'].entries()) {
      const directions = prefix === 'edge' ? CARDINAL_NEIGHBORS : DIAGONAL_NEIGHBORS
      directions.forEach(({ name: direction }, column) => expect(atlas.families[name].transitions[`${prefix}/${direction}`].rect).toEqual({ x: column * 16, y: (row * 3 + kind) * 16, width: 16, height: 16 }))
    }
  }
  // Hashes are the original P2 decoded scanlines, not newly generated fixtures.
  for (const [name, height, hash] of [
    ['base', 80, '92e5c12bd6bbb0129d82c23d288b2c751f62de7792a20b22bc8f67f71056226a'],
    ['transitions', 144, '3dc1ecb69a0bba23e9e1556f85393128a05ff4d541775073efc38c0b10ed2449'],
  ]) expect(createHash('sha256').update(scanlines(name).subarray(0, (64 * 4 + 1) * height)).digest('hex')).toBe(hash)
  expect(createHash('sha256').update(scanlines('base').subarray(0, (64 * 4 + 1) * 128)).digest('hex')).toBe('a42006946d8f0f1d307e37495a319ceacffd50702c2cfc79d52d4c6d56737b0a')
})

for (const [type, family, count, transitions] of [
  ['FLOWER_FIELD', 'flower-ground', 4, 0], ['FOREST', 'forest-ground', 4, 12], ['BRIDGE', 'bridge', 2, 4],
]) {
  test(`${type} selects its ${count} variants deterministically and preserves gameplay fields`, () => {
    expect(atlas.families[family].variants).toHaveLength(count)
    expect(Object.keys(atlas.families[family].transitions)).toHaveLength(transitions)
    const tiles = resolved.filter((tile) => tile.terrainType === type)
    const visuals = tiles.map((tile) => lookupPixelTile(tile))
    expect(new Set(visuals.map((visual) => visual.variantIndex)).size).toBe(count)
    for (const tile of tiles) {
      const visual = lookupPixelTile(tile)
      expect(visual.variantIndex).toBe(tile.variantIndex % count)
      expect(visual.layers.at(-1)).toEqual(atlas.families[family].variants[tile.variantIndex % count])
      expect(tile.walkable).toBe(true)
      expect(lookupPixelTile(tile, { transitionsAvailable: false }).layers).toHaveLength(1)
      expect(lookupPixelTile(tile, { baseAvailable: false })).toBeNull()
    }
    const reversed = resolveWorldTiles([...buildP41Tiles()].reverse())
    for (const tile of tiles) expect(lookupPixelTile(reversed.find((candidate) => candidate.x === tile.x && candidate.y === tile.y))).toEqual(lookupPixelTile(tile))
  })
}

test('flower ground shares grass background with sparse flat flower marks', () => {
  expect(atlas.palette['flower-ground'][0]).toBe(atlas.palette.grass[0])
  const visual = art('FLOWER_FIELD', { north: 'GRASS', east: 'GRASS', northEast: 'GRASS' })
  expect(visual.layers).toHaveLength(1)
  const pixels = scanlines('base')
  const baseColor = [0x78, 0x94, 0x56]
  for (const { rect } of atlas.families['flower-ground'].variants) {
    let ground = 0
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const offset = (rect.y + y) * 257 + 1 + (rect.x + x) * 4
      if (baseColor.every((value, i) => pixels[offset + i] === value)) ground++
    }
    expect(ground).toBeGreaterThan(230)
  }
})

test('forest cardinal and both corner types border grass/flowers only', () => {
  expect(keys(art('FOREST', { north: 'GRASS', east: 'FLOWER_FIELD' }))).toEqual([
    'terrain/forest-ground/outer/northEast', 'terrain/forest-ground/edge/north', 'terrain/forest-ground/edge/east',
  ])
  expect(keys(art('FOREST', { north: 'FOREST', east: 'FOREST', northEast: 'FLOWER_FIELD' }))).toEqual(['terrain/forest-ground/inner/northEast'])
  expect(keys(art('FOREST', { north: 'ROAD', east: 'WATER', south: 'ROCK', west: 'BRIDGE' }))).toEqual([])
})

test('all 256 forest boundary combinations keep exact composable ground transitions', () => {
  for (let mask = 0; mask < 256; mask++) {
    const neighbors = Object.fromEntries([...CARDINAL_NEIGHBORS, ...DIAGONAL_NEIGHBORS].map(({ name, bit }, index) => [name, (mask & (index < 4 ? bit : bit << 4)) ? (index % 2 ? 'FLOWER_FIELD' : 'GRASS') : 'FOREST']))
    const visual = art('FOREST', neighbors)
    expect(visual).toMatchObject({ mode: 'exact', edgeMask: mask & 15, cornerMask: mask >> 4 })
    expect(visual.layers.at(-1).atlas).toBe('base')
  }
})

test('forest negative chunk seam uses global neighbors without inventing an edge', () => {
  const left = at(-1, 3)
  const right = at(0, 3)
  expect(Math.floor(left.x / 8)).not.toBe(Math.floor(right.x / 8))
  expect(left.neighborFamilies.east).toBe('forest-ground')
  expect(right.neighborFamilies.west).toBe('forest-ground')
  expect(lookupPixelTile(left).edgeMask & 2).toBe(0)
  expect(lookupPixelTile(right).edgeMask & 8).toBe(0)
  expect(pixelTileStyle(lookupPixelTile(left)).width).toBe(48)
})

for (const [name, x, y, mask] of [['horizontal', 8, 12, 5], ['vertical', 19, 3, 10], ['cross', -4, 13, 0], ['road entry', 5, 12, 5]]) {
  test(`bridge ${name} keeps only water-facing sides`, () => {
    const visual = lookupPixelTile(at(x, y))
    expect(visual).toMatchObject({ family: 'bridge', mode: 'exact', edgeMask: mask, cornerMask: 0 })
    expect(keys(visual)).toEqual(CARDINAL_NEIGHBORS.filter(({ bit }) => bit & mask).map(({ name }) => `terrain/bridge/edge/${name}`))
    expect(visual.layers.at(-1).atlas).toBe('base')
  })
}

test('bridge handles every water-side mask without requiring corner art or closing land entries', () => {
  for (let mask = 0; mask < 16; mask++) {
    const neighbors = Object.fromEntries(CARDINAL_NEIGHBORS.map(({ name, bit }) => [name, mask & bit ? 'WATER' : 'BRIDGE']))
    for (const { name } of DIAGONAL_NEIGHBORS) neighbors[name] = 'WATER'
    expect(art('BRIDGE', neighbors)).toMatchObject({ mode: 'exact', edgeMask: mask, cornerMask: 0 })
  }
  expect(keys(art('BRIDGE', { north: 'GRASS', east: 'ROAD', south: 'BRIDGE', west: 'FUTURE' }))).toEqual([])
  expect(keys(lookupPixelTile({ family: 'bridge', variantIndex: 3, edgeMask: 15, cornerMask: 15 }))).toEqual([])
})

test('water excludes bridges in every cardinal and diagonal direction', () => {
  for (const { name } of [...CARDINAL_NEIGHBORS, ...DIAGONAL_NEIGHBORS]) {
    const water = art('WATER', { [name]: 'BRIDGE' })
    expect(water).toMatchObject({ edgeMask: 0, cornerMask: 0 })
    expect(keys(water)).toEqual([])
  }
  for (const tile of resolved.filter((tile) => tile.family === 'water')) {
    const visual = lookupPixelTile(tile)
    for (const { name, bit } of CARDINAL_NEIGHBORS) if (tile.neighborFamilies[name] === 'bridge') expect(visual.edgeMask & bit).toBe(0)
    for (const { name, bit } of DIAGONAL_NEIGHBORS) if (tile.neighborFamilies[name] === 'bridge') expect(visual.cornerMask & bit).toBe(0)
  }
})

test('missing forest corner and invalid masks retain opaque family bases', () => {
  const transitions = atlas.families['forest-ground'].transitions
  const saved = transitions['inner/northEast']
  try {
    delete transitions['inner/northEast']
    const visual = art('FOREST', { northEast: 'GRASS' })
    expect(visual).toMatchObject({ family: 'forest-ground', mode: 'base' })
    expect(visual.layers).toHaveLength(1)
  } finally { transitions['inner/northEast'] = saved }
  for (const family of ['flower-ground', 'forest-ground', 'bridge']) {
    expect(lookupPixelTile({ family, variantIndex: 3, edgeMask: 16, cornerMask: 0 }).mode).toBe('base')
  }
})

test('new overlays contain transparent pixels and decks/floors are fully opaque', () => {
  for (const family of ['flower-ground', 'forest-ground', 'bridge']) {
    for (const layer of [...atlas.families[family].variants, ...Object.values(atlas.families[family].transitions)]) {
      const pixels = scanlines(layer.atlas)
      const alpha = []
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) alpha.push(pixels[(layer.rect.y + y) * 257 + 1 + (layer.rect.x + x) * 4 + 3])
      expect([...new Set(alpha)].sort()).toEqual(layer.atlas === 'base' ? [255] : [0, 255])
    }
  }
})

test('real P3 fixture gains exactly 334 tiles without changing terrain or walkability', () => {
  const world = buildAuditedWorld()
  const result = resolveWorldTiles(world.terrainTiles)
  for (const [type, count] of [['FLOWER_FIELD', 20], ['FOREST', 264], ['BRIDGE', 50]]) {
    const tiles = result.filter((tile) => tile.terrainType === type)
    expect(tiles).toHaveLength(count)
    expect(tiles.every((tile) => tile.walkable && lookupPixelTile(tile))).toBe(true)
  }
  expect(result.map(({ x, y, terrainType, walkable }) => ({ x, y, terrainType, walkable }))).toEqual(world.terrainTiles)
})
