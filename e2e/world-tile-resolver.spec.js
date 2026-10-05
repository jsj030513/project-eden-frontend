import { expect, test } from '@playwright/test'
import {
  PIXEL_SCALE,
  PIXEL_SOURCE_TILE_SIZE,
  WORLD_TILE_RESOLVER_VERSION,
  resolveWorldTile,
  resolveWorldTiles,
} from '../src/components/village/worldTileResolver.js'
import { WORLD_TILE_SIZE } from '../src/components/village/worldViewport.js'

const familyCases = [
  ['GRASS', 'grass'], ['ROAD', 'path'], ['SOIL', 'soil'],
  ['FLOWER_FIELD', 'flower-ground'], ['FOREST', 'forest-ground'],
  ['WATER', 'water'], ['BRIDGE', 'bridge'], ['BEACH', 'sand'],
  ['BUILDING', 'building-footprint'], ['ROCK', 'rock-ground'], ['CLIFF', 'cliff'],
]

test('uses a 16px source tile at a 3x logical display scale without changing world coordinates', () => {
  expect(PIXEL_SOURCE_TILE_SIZE).toBe(16)
  expect(WORLD_TILE_SIZE).toBe(48)
  expect(PIXEL_SCALE).toBe(3)
})

for (const [terrainType, family] of familyCases) {
  test(`${terrainType} maps to the ${family} presentation family and preserves its legacy class`, () => {
    const tile = resolveWorldTile({ terrainType, tileX: 2, tileY: 3 })
    expect(tile.family).toBe(family)
    expect(tile.baseKey).toBe(family)
    expect(tile.className).toContain(`terrain-${terrainType.toLowerCase()}`)
    expect(tile.className).toContain(`world-tile--${family}`)
  })
}

test('returns stable cardinal and diagonal family-boundary masks', () => {
  const tile = resolveWorldTile({
    terrainType: 'GRASS', tileX: 0, tileY: 0,
    neighbors: {
      north: 'WATER', northEast: 'WATER', east: 'ROAD', southEast: 'ROAD',
      south: 'GRASS', southWest: 'GRASS', west: 'GRASS', northWest: 'WATER',
    },
  })
  expect(tile.neighborFamilies).toMatchObject({ north: 'water', east: 'path', south: 'grass', northWest: 'water' })
  expect(tile.edgeMask).toBe(3) // N + E
  expect(tile.cornerMask).toBe(11) // NE + SE + NW
  expect(tile.neighborMask).toBe((11 << 4) | 3)
})

test('exposes a water-to-land transition mask for water next to land', () => {
  const tile = resolveWorldTile({
    terrainType: 'WATER', tileX: 4, tileY: 5,
    neighbors: { north: 'WATER', east: 'GRASS', south: 'WATER', west: 'BEACH' },
  })
  expect(tile.transitionMasks.landWater).toBe(10) // E + W
  expect(tile.transitionMasks.pathGround).toBe(0)
})

test('exposes path-to-ground transitions on both sides of a road boundary', () => {
  const path = resolveWorldTile({ terrainType: 'ROAD', tileX: 0, tileY: 0, neighbors: { east: 'GRASS' } })
  const ground = resolveWorldTile({ terrainType: 'GRASS', tileX: 1, tileY: 0, neighbors: { west: 'ROAD' } })
  expect(path.transitionMasks.pathGround).toBe(2)
  expect(ground.transitionMasks.pathGround).toBe(8)
})

test('negative world coordinates resolve deterministically', () => {
  const input = { terrainType: 'FOREST', tileX: -9, tileY: -17, neighbors: { east: 'GRASS' } }
  expect(resolveWorldTile(input)).toEqual(resolveWorldTile(input))
  expect(resolveWorldTile(input).tileX).toBe(-9)
  expect(resolveWorldTile(input).tileY).toBe(-17)
})

test('deterministic variants and atlas keys remain stable for the same tile', () => {
  const input = { terrainType: 'GRASS', tileX: -2, tileY: 7, variationSalt: 'hub' }
  const first = resolveWorldTile(input)
  const second = resolveWorldTile(input)
  expect(first.variantIndex).toBeGreaterThanOrEqual(0)
  expect(first.variantIndex).toBeLessThan(4)
  expect(first.variantIndex).toBe(second.variantIndex)
  expect(first.assetKey).toBe(second.assetKey)
  expect(first.resolverVersion).toBe(WORLD_TILE_RESOLVER_VERSION)
})

test('tile appearance is independent of input and chunk cache order', () => {
  const tiles = [
    { x: -1, y: 0, terrainType: 'GRASS' },
    { x: 0, y: 0, terrainType: 'ROAD' },
    { x: 1, y: 0, terrainType: 'GRASS' },
    { x: 0, y: 1, terrainType: 'WATER' },
    { x: 1, y: 1, terrainType: 'BEACH' },
  ]
  const summarize = (source) => resolveWorldTiles(source)
    .map(({ x, y, family, edgeMask, cornerMask, variantIndex, assetKey }) => (
      [x, y, family, edgeMask, cornerMask, variantIndex, assetKey]
    ))
    .sort((left, right) => left[1] - right[1] || left[0] - right[0])

  expect(summarize(tiles)).toEqual(summarize([...tiles].reverse()))
})

test('unknown terrain uses a safe family and class fallback', () => {
  const tile = resolveWorldTile({ terrainType: 'UNRELEASED_TERRAIN', tileX: 0, tileY: 0 })
  expect(tile.family).toBe('unknown')
  expect(tile.baseKey).toBe('unknown')
  expect(tile.className).toContain('terrain-unreleased_terrain')
  expect(tile.assetKey).toContain('terrain/unknown/')
})

test('season and resolver version select explicit, deterministic future atlas keys', () => {
  const spring = resolveWorldTile({ terrainType: 'GRASS', tileX: 1, tileY: 2, season: 'SPRING' })
  const winter = resolveWorldTile({ terrainType: 'GRASS', tileX: 1, tileY: 2, season: 'winter' })
  const newer = resolveWorldTile({ terrainType: 'GRASS', tileX: 1, tileY: 2, resolverVersion: 2 })
  expect(spring.assetKey).toContain('season/spring/')
  expect(winter.assetKey).toContain('season/winter/')
  expect(newer.resolverVersion).toBe(2)
})
