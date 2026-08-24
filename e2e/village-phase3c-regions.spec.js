import { expect, test } from '@playwright/test'
import { WorldChunkCache } from '../src/components/village/worldChunkCache.js'
import {
  cameraVariables,
  worldOriginPixels,
  worldPixelSize,
} from '../src/components/village/worldViewport.js'

const EXPANDED = { minX: -8, maxX: 31, minY: -8, maxY: 23 }

test('maps negative global coordinates into the expanded camera layer', () => {
  expect(worldPixelSize(EXPANDED)).toEqual({ width: 1920, height: 1536 })
  expect(worldOriginPixels(EXPANDED)).toEqual({ x: 384, y: 384 })
  expect(cameraVariables({ x: -384, y: -384 }, EXPANDED)).toMatchObject({
    '--camera-character-x': '0px',
    '--camera-character-y': '0px',
    '--world-origin-x': '384px',
    '--world-origin-y': '384px',
  })
})

test('does not mark expanded ungenerated chunks as loaded from hub state', () => {
  const cache = new WorldChunkCache()
  cache.seedFromWorldState({
    mapBounds: EXPANDED,
    terrainTiles: [{ x: 0, y: 0, terrainType: 'GRASS', walkable: true }],
    placedObjects: [],
  })
  expect(cache.entries.size).toBe(1)
  expect(cache.hasGenerated('-1:0')).toBeFalsy()
  expect(cache.hasGenerated('0:0')).toBeTruthy()
})

test('merges discovery monotonically and preserves generated region metadata', async () => {
  const cache = new WorldChunkCache()
  await cache.fetchRange({
    centerChunkX: -1,
    centerChunkY: 0,
    radius: 0,
    loader: async () => ({
      world: { worldId: 7 },
      chunks: [{
        chunkX: -1,
        chunkY: 0,
        regionType: 'MEADOW',
        status: 'GENERATED',
        discoveredAt: '2026-07-28T12:00:00',
        version: 'new',
        terrain: [{ x: -8, y: 0, terrainType: 'ROAD', walkable: true }],
        decorations: [{ type: 'FLOWER', localX: 2, localY: 2 }],
        placedObjects: [],
      }],
    }),
  })
  const discovered = cache.entries.get('-1:0')
  expect(discovered.regionType).toBe('MEADOW')
  expect(discovered.discoveredAt).toBe('2026-07-28T12:00:00')
  expect(discovered.decorations).toHaveLength(1)
})
