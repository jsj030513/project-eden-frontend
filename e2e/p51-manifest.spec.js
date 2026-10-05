import { expect, test } from '@playwright/test'
import { readFileSync, writeFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { PIXEL_TILE_ATLAS as atlas, lookupPixelTile, pixelTileStyle } from '../src/components/village/pixelTileManifest'
import { CARDINAL_NEIGHBORS as cardinal, DIAGONAL_NEIGHBORS as diagonal, resolveWorldTile, resolveWorldTiles } from '../src/components/village/worldTileResolver'
import { buildAuditedWorld } from './hub-pixel-fixture'
import { buildP41Tiles } from './p41-terrain-fixture'
import { buildP51Tiles, P51_CASES } from './p51-terrain-fixture'

const water = (neighbors, extra = {}) => lookupPixelTile(resolveWorldTile({ terrainType: 'WATER', neighbors, ...extra }))
const overlays = (visual) => visual.layers.slice(0, -1)
const keys = (visual) => overlays(visual).map((layer) => layer.key)
const bankKey = (material, kind, direction) => `terrain/water/${material === 'earth-bank' ? '' : `${material}/`}${kind}/${direction}`
const contracts = [
  ['GRASS', 'grass-bank'], ['FLOWER_FIELD', 'grass-bank'], ['FOREST', 'grass-bank'],
  ['ROAD', 'earth-bank'], ['SOIL', 'earth-bank'], ['BEACH', 'sand-bank'],
  ['ROCK', 'rock-bank'], ['CLIFF', 'rock-bank'],
]

function decode(name) {
  const png = readFileSync(new URL(`../public${atlas.atlases[name].url}`, import.meta.url))
  const parts = []
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') parts.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  return inflateSync(Buffer.concat(parts))
}
const sheets = { base: decode('base'), transitions: decode('transitions') }
function pixel(layer, x, y) {
  const stride = atlas.atlases[layer.atlas].width * 4 + 1
  const offset = (layer.rect.y + y) * stride + 1 + (layer.rect.x + x) * 4
  return [...sheets[layer.atlas].subarray(offset, offset + 4)]
}
function composite(visual, x, y) {
  return visual.layers.map((layer) => pixel(layer, x, y)).find((color) => color[3] === 255)
}

test('P5-1 has exactly 36 appended slots, 12 reused earth slots and four reused bridge slots', () => {
  expect(atlas.atlases.transitions).toMatchObject({ width: 64, height: 352 })
  expect(atlas.atlases.base).toMatchObject({ width: 64, height: 176 })
  expect(atlas.families.water.variants).toHaveLength(4)
  expect(Object.keys(atlas.families.water.transitions)).toHaveLength(12)
  expect(Object.keys(atlas.families.bridge.transitions)).toHaveLength(4)
  const coastSets = atlas.families.water.coastTransitions
  expect(Object.keys(coastSets)).toEqual(['grass-bank', 'sand-bank', 'rock-bank'])
  const old = Object.values(atlas.families).flatMap((family) => Object.values(family.transitions))
  expect(old).toHaveLength(52)
  for (const [family, row] of [['path', 0], ['soil', 3], ['water', 6], ['forest-ground', 9], ['bridge', 12]]) {
    for (const [key, layer] of Object.entries(atlas.families[family].transitions)) {
      const [kind, name] = key.split('/')
      const column = (kind === 'edge' ? cardinal : diagonal).findIndex((direction) => direction.name === name)
      expect(layer.rect).toEqual({ x: column * 16, y: (row + ['edge', 'outer', 'inner'].indexOf(kind)) * 16, width: 16, height: 16 })
    }
  }
  const basePng = readFileSync(new URL(`../public${atlas.atlases.base.url}`, import.meta.url))
  expect(createHash('sha256').update(basePng).digest('hex')).toBe('4acf9a8bf7f619824d291ac9355419c3ad3ba75ec182808c1be795df48949a56')
  const appended = Object.values(coastSets).flatMap(Object.values)
  expect(appended).toHaveLength(36)
  expect(new Set([...old, ...appended].map(({ rect }) => `${rect.x}:${rect.y}`)).size).toBe(88)
  appended.forEach((layer, index) => {
    expect(layer.rect).toEqual({ x: index % 4 * 16, y: 208 + Math.floor(index / 4) * 16, width: 16, height: 16 })
    expect(pixelTileStyle({ layers: [layer] }).backgroundSize).toBe('192px 1056px')
  })
  expect(createHash('sha256').update(sheets.transitions.subarray(0, 257 * 208)).digest('hex')).toBe('c7199f0e30c19d3d66e139390159f8e01ea335ad0feb2ad510e91ad72ff371d0')
})

for (const [terrainType, material] of contracts) {
  test(`${terrainType} selects all four cardinal, outer and inner ${material} transitions`, () => {
    for (let direction = 0; direction < 4; direction++) {
      const first = cardinal[direction].name
      const second = cardinal[(direction + 1) % 4].name
      const corner = diagonal[direction].name
      expect(keys(water({ [first]: terrainType }))).toEqual([bankKey(material, 'edge', first)])
      expect(keys(water({ [first]: terrainType, [second]: terrainType }))).toEqual([
        bankKey(material, 'outer', corner), bankKey(material, 'edge', first), bankKey(material, 'edge', second),
      ].sort((a, b) => {
        // CSS edges use the global N/E/S/W order, also for the NW corner.
        const order = ['outer/', 'edge/north', 'edge/east', 'edge/south', 'edge/west']
        return order.findIndex((part) => a.includes(part)) - order.findIndex((part) => b.includes(part))
      }))
      expect(keys(water({ [first]: 'WATER', [second]: 'WATER', [corner]: terrainType }))).toEqual([bankKey(material, 'inner', corner)])
    }
  })
  test(`${terrainType} supports all 256 immediate-neighbor masks deterministically`, () => {
    for (let mask = 0; mask < 256; mask++) {
      const entries = [...cardinal, ...diagonal].map(({ name, bit }, index) => [name, mask & (index < 4 ? bit : bit << 4) ? terrainType : 'WATER'])
      const visual = water(Object.fromEntries(entries))
      expect(visual).toMatchObject({ family: 'water', mode: 'exact', edgeMask: mask & 15, cornerMask: mask >> 4 })
      expect(water(Object.fromEntries([...entries].reverse()))).toEqual(visual)
      expect(visual.layers.at(-1).atlas).toBe('base')
      expect(overlays(visual).every(({ key }) => material === 'earth-bank'
        ? /^terrain\/water\/(edge|inner|outer)\//.test(key) : key.includes(`/${material}/`))).toBe(true)
    }
  })
}

test('grass/flower/forest and rock/cliff reuse identical shoreline art', () => {
  for (const group of [['GRASS', 'FLOWER_FIELD', 'FOREST'], ['ROCK', 'CLIFF'], ['ROAD', 'SOIL']]) {
    const visuals = group.map((type) => water({ north: type, east: type, southWest: type }))
    for (const visual of visuals) expect(visual).toEqual(visuals[0])
  }
  expect(keys(water({ north: 'GRASS', east: 'FOREST' }))[0]).toBe(bankKey('grass-bank', 'outer', 'northEast'))
  expect(keys(water({ north: 'ROCK', east: 'CLIFF' }))[0]).toBe(bankKey('rock-bank', 'outer', 'northEast'))
})

for (const [firstType, secondType, firstMaterial, secondMaterial] of [
  ['GRASS', 'BEACH', 'grass-bank', 'sand-bank'],
  ['BEACH', 'ROCK', 'sand-bank', 'rock-bank'],
  ['GRASS', 'ROCK', 'grass-bank', 'rock-bank'],
]) {
  test(`${firstType}/${secondType} uses one neutral corner over both edge intersections in every rotation`, () => {
    for (let direction = 0; direction < 4; direction++) {
      const first = cardinal[direction].name
      const second = cardinal[(direction + 1) % 4].name
      const corner = diagonal[direction].name
      for (const diagonalType of [firstType, secondType, 'WATER']) {
        const entries = [[first, firstType], [second, secondType], [corner, diagonalType]]
        const visual = water(Object.fromEntries(entries))
        const layers = overlays(visual)
        expect(layers).toHaveLength(3)
        expect(layers[0]).toEqual(atlas.families.water.transitions[`outer/${corner}`])
        expect(keys(visual)).toContain(bankKey(firstMaterial, 'edge', first))
        expect(keys(visual)).toContain(bankKey(secondMaterial, 'edge', second))
        expect(keys(visual).some((key) => key.includes('/inner/'))).toBe(false)
        expect(water(Object.fromEntries([...entries].reverse()))).toEqual(visual)
        // The full 3x3 intersection is covered by one neutral cap; no mixed
        // edge pixels can bleed through or expose a transparent seam.
        for (let y = 0; y < 3; y++) for (let x = 13; x < 16; x++) {
          let px = x, py = y
          for (let turn = 0; turn < direction; turn++) [px, py] = [15 - py, px]
          expect(pixel(layers[0], px, py)[3]).toBe(255)
          expect(composite(visual, px, py)).toEqual(pixel(layers[0], px, py))
        }
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) expect(composite(visual, x, y)?.[3]).toBe(255)
      }
    }
  })
}

test('all 256 four-material cardinal arrangements emit one safe corner per quadrant', () => {
  const types = ['GRASS', 'ROAD', 'BEACH', 'ROCK']
  const materials = ['grass-bank', 'earth-bank', 'sand-bank', 'rock-bank']
  for (let code = 0; code < 256; code++) {
    const indices = [0, 1, 2, 3].map((index) => (code >> (index * 2)) & 3)
    const neighbors = Object.fromEntries(cardinal.map(({ name }, index) => [name, types[indices[index]]]))
    const visual = water(neighbors)
    expect(overlays(visual)).toHaveLength(8)
    diagonal.forEach(({ name }, index) => {
      const next = (index + 1) % 4
      expect(visual.layers[index].key).toBe(bankKey(indices[index] === indices[next] ? materials[indices[index]] : 'earth-bank', 'outer', name))
    })
  }
})

test('one cardinal bank suppresses a competing diagonal corner while separated inner corners coexist', () => {
  for (let i = 0; i < 4; i++) {
    for (const [land, diagonalLand, material] of [['GRASS', 'BEACH', 'grass-bank'], ['BEACH', 'ROCK', 'sand-bank'], ['ROCK', 'GRASS', 'rock-bank']]) {
      expect(keys(water({ [cardinal[i].name]: land, [diagonal[i].name]: diagonalLand }))).toEqual([bankKey(material, 'edge', cardinal[i].name)])
    }
  }
  const visual = water({ northEast: 'GRASS', southEast: 'BEACH', southWest: 'ROCK', northWest: 'ROAD' })
  expect(keys(visual)).toEqual([
    bankKey('grass-bank', 'inner', 'northEast'), bankKey('sand-bank', 'inner', 'southEast'),
    bankKey('rock-bank', 'inner', 'southWest'), bankKey('earth-bank', 'inner', 'northWest'),
  ])
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    expect(overlays(visual).filter((layer) => pixel(layer, x, y)[3] > 0).length).toBeLessThanOrEqual(1)
    expect(composite(visual, x, y)?.[3]).toBe(255)
  }
})

test('BRIDGE cardinal/diagonal exclusion and all existing deck directions survive', () => {
  for (const { name } of [...cardinal, ...diagonal]) {
    expect(water({ [name]: 'BRIDGE' })).toMatchObject({ edgeMask: 0, cornerMask: 0 })
    expect(keys(water({ [name]: 'BRIDGE' }))).toEqual([])
  }
  for (let i = 0; i < 4; i++) {
    const visual = water({ [cardinal[i].name]: 'GRASS', [cardinal[(i + 1) % 4].name]: 'BEACH', [diagonal[i].name]: 'BRIDGE' })
    expect(keys(visual).filter((key) => /\/(outer|inner)\//.test(key))).toEqual([])
  }
  const resolved = resolveWorldTiles(buildP41Tiles())
  for (const [name, x, y, mask] of [['horizontal', 8, 12, 5], ['vertical', 19, 3, 10], ['cross', -4, 13, 0], ['road entry', 5, 12, 5]]) {
    const tile = resolved.find((tile) => tile.x === x && tile.y === y)
    expect(tile.walkable, name).toBe(true)
    expect(lookupPixelTile(tile)).toMatchObject({ edgeMask: mask, cornerMask: 0 })
    expect(keys(lookupPixelTile(tile))).toEqual(cardinal.filter(({ bit }) => mask & bit).map(({ name }) => `terrain/bridge/edge/${name}`))
  }
  for (const tile of resolved.filter((tile) => tile.family === 'water')) {
    const visual = lookupPixelTile(tile)
    for (const { name, bit } of cardinal) if (tile.neighborFamilies[name] === 'bridge') expect(visual.edgeMask & bit).toBe(0)
    for (const { name, bit } of diagonal) if (tile.neighborFamilies[name] === 'bridge') expect(visual.cornerMask & bit).toBe(0)
  }
})

test('missing material slot falls back per slot to earth, then water base, then CSS', () => {
  for (const [type, material] of [['GRASS', 'grass-bank'], ['BEACH', 'sand-bank'], ['ROCK', 'rock-bank']]) {
    const transitions = atlas.families.water.coastTransitions[material]
    for (const key of Object.keys(transitions)) {
      const [kind, name] = key.split('/')
      const index = (kind === 'edge' ? cardinal : diagonal).findIndex((direction) => direction.name === name)
      const neighbors = kind === 'outer' ? { [cardinal[index].name]: type, [cardinal[(index + 1) % 4].name]: type } : { [name]: type }
      const saved = transitions[key]
      const neutral = atlas.families.water.transitions[key]
      try {
        delete transitions[key]
        expect(overlays(water(neighbors))).toContainEqual(neutral)
        expect(water(neighbors).mode).toBe('exact')
        delete atlas.families.water.transitions[key]
        expect(water(neighbors).mode).toBe('base')
        expect(water(neighbors).layers).toHaveLength(1)
        const tile = resolveWorldTile({ terrainType: 'WATER', neighbors })
        expect(lookupPixelTile(tile, { baseAvailable: false })).toBeNull()
      } finally {
        transitions[key] = saved
        atlas.families.water.transitions[key] = neutral
      }
    }
  }
})

test('new rims use only Eden olive, sand, warm gray and teal with binary alpha and symmetric geometry', () => {
  const hex = (color) => `#${color.slice(0, 3).map((value) => value.toString(16).padStart(2, '0')).join('')}`
  for (const [material, ground] of [['grass-bank', 'grass'], ['sand-bank', 'sand'], ['rock-bank', 'rock-ground']]) {
    const entries = atlas.families.water.coastTransitions[material]
    const allowed = [atlas.palette[ground][0], atlas.palette[ground][1], atlas.palette.water[2]]
    for (const layer of Object.values(entries)) {
      const alpha = new Set()
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const color = pixel(layer, x, y)
        alpha.add(color[3])
        if (color[3]) expect(allowed).toContain(hex(color))
      }
      expect([...alpha].sort()).toEqual([0, 255])
      expect(pixel(layer, 8, 8)[3]).toBe(0) // Rim only; no wall/boulder/interior cue.
    }
    for (const kind of ['edge', 'outer', 'inner']) {
      const directions = kind === 'edge' ? cardinal : diagonal
      for (let i = 0; i < 4; i++) {
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          let px = x, py = y
          for (let turn = 0; turn < i; turn++) [px, py] = [15 - py, px]
          expect(pixel(entries[`${kind}/${directions[i].name}`], px, py)).toEqual(pixel(entries[`${kind}/${directions[0].name}`], x, y))
        }
      }
    }
  }
})

for (const name of Object.keys(P51_CASES)) {
  test(`synthetic ${name}: deterministic global/chunk order and unchanged terrain/walkability`, () => {
    const tiles = buildP51Tiles(name)
    const before = structuredClone(tiles)
    const resolved = resolveWorldTiles(tiles)
    const reordered = new Map(resolveWorldTiles([...tiles].reverse()).map((tile) => [`${tile.x}:${tile.y}`, lookupPixelTile(tile)]))
    for (const tile of resolved) {
      expect(lookupPixelTile(tile)).toEqual(reordered.get(`${tile.x}:${tile.y}`))
      if (tile.family === 'water') expect(tile.walkable).toBe(false)
      if (['sand', 'cliff', 'rock-ground'].includes(tile.family)) expect(lookupPixelTile(tile).layers).toHaveLength(1)
    }
    expect(tiles).toEqual(before)
    expect(resolved.map(({ x, y, terrainType, walkable }) => ({ x, y, terrainType, walkable }))).toEqual(before)
  })
}

test('offscreen 1-ring neighbors preserve shorelines across -1/0 chunks; 2-ring does not affect lookup', () => {
  const all = buildP51Tiles('mixed-grass-sand-corner')
  for (const [x, y] of [[-1, -2], [0, -2], [-2, -1], [-2, 0]]) {
    const visualAt = (tiles) => lookupPixelTile(resolveWorldTiles(tiles).find((tile) => tile.x === x && tile.y === y))
    const ring = all.filter((tile) => Math.abs(tile.x - x) <= 1 && Math.abs(tile.y - y) <= 1)
    expect(visualAt(ring)).toEqual(visualAt(all))
    const changedBeyondRing = all.map((tile) => Math.max(Math.abs(tile.x - x), Math.abs(tile.y - y)) > 1 ? { ...tile, terrainType: 'CLIFF' } : tile)
    expect(visualAt(changedBeyondRing)).toEqual(visualAt(all))
  }
})

test('isolated, 2x2 and 3x3 water retain opaque bases without interior classification', () => {
  for (const [name, count] of [['isolated-water', 1], ['pool-2x2', 4], ['pool-3x3', 9]]) {
    const tiles = resolveWorldTiles(buildP51Tiles(name)).filter((tile) => tile.family === 'water')
    expect(tiles).toHaveLength(count)
    for (const tile of tiles) expect(lookupPixelTile(tile).layers.at(-1)).toEqual(atlas.families.water.variants[tile.variantIndex])
    if (count === 1) expect(overlays(lookupPixelTile(tiles[0]))).toHaveLength(8)
    if (count === 9) expect(lookupPixelTile(tiles.find((tile) => tile.x === -1 && tile.y === -1)).layers).toHaveLength(1)
  }
})

test('real fixture coverage counts actual materials separately from synthetic categories', () => {
  const source = buildAuditedWorld().terrainTiles
  const unique = [...new Map(source.map((tile) => [`${tile.x}:${tile.y}`, tile])).values()]
  const waterTiles = resolveWorldTiles(unique).filter((tile) => tile.family === 'water')
  expect(waterTiles).toHaveLength(104)
  const coverage = { totalWater: waterTiles.length, applied: { 'grass-bank': 0, 'earth-bank': 0, 'sand-bank': 0, 'rock-bank': 0, none: 0 }, adjacentFamilies: {}, mixedNeutralCornerTiles: 0, bridgeAdjacentTiles: 0, syntheticOnly: ['BEACH', 'CLIFF', 'FLOWER_FIELD', 'SOIL'], note: 'Applied counts overlap for mixed tiles; earth includes neutral mixed corners. Adjacency alone does not guarantee a rendered bank.' }
  const realMaterials = { grass: 'grass-bank', 'forest-ground': 'grass-bank', path: 'earth-bank', 'rock-ground': 'rock-bank' }
  for (const tile of waterTiles) {
    const visual = lookupPixelTile(tile)
    const materials = new Set(keys(visual).map((key) => key.includes('/grass-bank/') ? 'grass-bank' : key.includes('/sand-bank/') ? 'sand-bank' : key.includes('/rock-bank/') ? 'rock-bank' : 'earth-bank'))
    if (!materials.size) coverage.applied.none++
    for (const material of materials) coverage.applied[material]++
    const adjacent = new Set(Object.values(tile.neighborFamilies).filter((family) => family && family !== 'water'))
    for (const family of adjacent) coverage.adjacentFamilies[family] = (coverage.adjacentFamilies[family] || 0) + 1
    if (adjacent.has('bridge')) coverage.bridgeAdjacentTiles++
    if (diagonal.some(({ name }, index) => {
      const first = realMaterials[tile.neighborFamilies[cardinal[index].name]]
      const second = realMaterials[tile.neighborFamilies[cardinal[(index + 1) % 4].name]]
      return first && second && first !== second && keys(visual).includes(`terrain/water/outer/${name}`)
    })) coverage.mixedNeutralCornerTiles++
  }
  expect(Object.keys(coverage.adjacentFamilies).sort()).toEqual(['bridge', 'forest-ground', 'grass', 'path', 'rock-ground'])
  expect(coverage.applied['sand-bank']).toBe(0)
  expect(coverage.applied['grass-bank']).toBeGreaterThan(0)
  expect(coverage.applied['rock-bank']).toBeGreaterThan(0)
  expect(coverage.applied['earth-bank']).toBeGreaterThan(0)
  writeFileSync('/tmp/eden-p51-real-coverage.json', `${JSON.stringify(coverage, null, 2)}\n`)
})
