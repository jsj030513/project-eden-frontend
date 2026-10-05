import { expect, test } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { inflateSync } from 'node:zlib'
import { PIXEL_TILE_ATLAS as atlas, lookupPixelTile } from '../src/components/village/pixelTileManifest'
import { CARDINAL_NEIGHBORS, DIAGONAL_NEIGHBORS, resolveWorldTile, resolveWorldTiles } from '../src/components/village/worldTileResolver'
import { buildAuditedWorld } from './hub-pixel-fixture'

function decoded(name) {
  const png = readFileSync(new URL(`../public${atlas.atlases[name].url}`, import.meta.url))
  const chunks = []
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset)
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(png.subarray(offset + 8, offset + 8 + length))
    offset += length + 12
  }
  return { png, pixels: inflateSync(Buffer.concat(chunks)) }
}

test('P4-2 base rows and all pre-P5 transition pixels remain unchanged', () => {
  expect(atlas.atlases.base).toEqual({ url: '/art/pixel/terrain/terrain-atlas.png', width: 64, height: 176 })
  expect(atlas.atlases.transitions).toEqual({ url: '/art/pixel/terrain/transition-atlas.png', width: 64, height: 352 })
  const { pixels } = decoded('base')
  expect(createHash('sha256').update(pixels.subarray(0, 257 * 128)).digest('hex')).toBe('a42006946d8f0f1d307e37495a319ceacffd50702c2cfc79d52d4c6d56737b0a')
  // P5 appends rows; hash the original decoded 208 rows, not the resized PNG.
  expect(createHash('sha256').update(decoded('transitions').pixels.subarray(0, 257 * 208)).digest('hex')).toBe('c7199f0e30c19d3d66e139390159f8e01ea335ad0feb2ad510e91ad72ff371d0')
  for (const [name, row, count] of [['building-footprint', 8, 2], ['sand', 9, 4], ['cliff', 10, 2]]) {
    expect(atlas.families[name].variants).toHaveLength(count)
    expect(atlas.families[name].transitions).toEqual({})
    atlas.families[name].variants.forEach((layer, column) => expect(layer.rect).toEqual({ x: column * 16, y: row * 16, width: 16, height: 16 }))
    for (const layer of atlas.families[name].variants) {
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        expect(pixels[(layer.rect.y + y) * 257 + 1 + (layer.rect.x + x) * 4 + 3]).toBe(255)
      }
    }
  }
})

test('all known terrain enum families are pixel supported with per-family variant counts', () => {
  const supported = {
    grass: 4, path: 4, soil: 4, water: 4, 'rock-ground': 4,
    'flower-ground': 4, 'forest-ground': 4, bridge: 2,
    'building-footprint': 2, sand: 4, cliff: 2,
  }
  expect(Object.fromEntries(Object.entries(atlas.families).map(([name, family]) => [name, family.variants.length]))).toEqual(supported)
  for (const [terrainType, family] of [
    ['BUILDING', 'building-footprint'], ['BEACH', 'sand'], ['CLIFF', 'cliff'],
  ]) {
    for (const tile of resolveWorldTiles([{ x: -3, y: -2, terrainType, walkable: terrainType === 'BEACH' }])) {
      const visual = lookupPixelTile(tile)
      expect(visual.family).toBe(family)
      expect(visual.layers).toHaveLength(1)
      expect(tile.walkable).toBe(terrainType === 'BEACH')
    }
  }
})

test('BEACH and CLIFF stay base-only at grass, water, and rock boundaries', () => {
  for (const neighbor of ['GRASS', 'WATER', 'ROCK']) {
    const beach = lookupPixelTile(resolveWorldTile({ terrainType: 'BEACH', neighbors: { north: neighbor, east: neighbor, southEast: neighbor } }))
    const cliff = lookupPixelTile(resolveWorldTile({ terrainType: 'CLIFF', neighbors: { north: neighbor, east: neighbor, southEast: neighbor } }))
    expect(beach.layers).toHaveLength(1)
    expect(beach.layers[0].key).toMatch(/^terrain\/sand\/base/)
    expect(cliff.layers).toHaveLength(1)
    expect(cliff.layers[0].key).toMatch(/^terrain\/cliff\/base/)
  }
  // P5 keeps WATER ownership while selecting the synthetic sand material.
  const water = lookupPixelTile(resolveWorldTile({ terrainType: 'WATER', neighbors: { east: 'BEACH' } }))
  expect(water.edgeMask).toBe(2)
  expect(water.layers[0].key).toBe('terrain/water/sand-bank/edge/east')
})

test('real building foundation covers the full nonwalkable 3x3 footprint below the separate house object', () => {
  const world = buildAuditedWorld()
  const resolved = resolveWorldTiles(world.terrainTiles)
  const buildings = resolved.filter((tile) => tile.terrainType === 'BUILDING')
  expect(buildings).toHaveLength(9)
  expect(buildings.every((tile) => tile.walkable === false && lookupPixelTile(tile).family === 'building-footprint')).toBe(true)
  expect(world.placedObjects.find((object) => object.assetType === 'COMMUNITY_HOUSE')).toMatchObject({ x: 672, y: 288 })
})

test('CLIFF base lookup stays direction independent and does not create edge or corner layers', () => {
  const expected = atlas.families.cliff.variants[1]
  const neighborSets = [
    {}, Object.fromEntries(CARDINAL_NEIGHBORS.map(({ name }) => [name, 'GRASS'])),
    Object.fromEntries(DIAGONAL_NEIGHBORS.map(({ name }) => [name, 'ROCK'])),
  ]
  for (const neighbors of neighborSets) {
    const visual = lookupPixelTile(resolveWorldTile({ terrainType: 'CLIFF', tileX: -9, tileY: 4, neighbors, variationSalt: 'cliff-contract' }))
    expect(visual.layers).toEqual([expected])
  }
})
