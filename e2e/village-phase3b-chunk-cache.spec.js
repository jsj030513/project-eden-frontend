import { expect, test } from '@playwright/test'
import {
  WorldChunkCache,
  chunkKey,
  objectChunkKey,
  tileToChunk,
  tileToChunkLocal,
} from '../src/components/village/worldChunkCache.js'

function chunk(chunkX, chunkY, version, objectId = null) {
  return {
    chunkX,
    chunkY,
    version,
    terrain: [{ x: chunkX * 8, y: chunkY * 8, terrainType: 'GRASS', walkable: true }],
    placedObjects: objectId == null ? [] : [{
      id: objectId,
      x: chunkX * 8 * 48,
      y: chunkY * 8 * 48,
      assetType: 'MEMORY_SPARK',
    }],
  }
}

test('uses the shared floor chunk coordinate contract including negative readiness', () => {
  expect(tileToChunk(0)).toBe(0)
  expect(tileToChunkLocal(0)).toBe(0)
  expect(tileToChunk(7)).toBe(0)
  expect(tileToChunkLocal(7)).toBe(7)
  expect(tileToChunk(8)).toBe(1)
  expect(tileToChunkLocal(8)).toBe(0)
  expect(tileToChunk(-1)).toBe(-1)
  expect(tileToChunkLocal(-1)).toBe(7)
  expect(objectChunkKey({ x: 8 * 48, y: 0 })).toBe('1:0')
})

test('deduplicates an identical in-flight range request', async () => {
  const cache = new WorldChunkCache()
  let calls = 0
  let release
  const loader = () => {
    calls += 1
    return new Promise((resolve) => { release = resolve })
  }
  const first = cache.fetchRange({ centerChunkX: 1, centerChunkY: 1, radius: 1, loader })
  const second = cache.fetchRange({ centerChunkX: 1, centerChunkY: 1, radius: 1, loader })
  expect(calls).toBe(1)
  release({ world: { worldId: 1 }, chunks: [chunk(1, 1, 'v1')] })
  expect(await first).toEqual(await second)
  expect(cache.inFlight.size).toBe(0)
})

test('rejects an older response and preserves the newest chunk version', async () => {
  const cache = new WorldChunkCache()
  let releaseOld
  const old = cache.fetchRange({
    centerChunkX: 1,
    centerChunkY: 1,
    radius: 1,
    loader: () => new Promise((resolve) => { releaseOld = resolve }),
  })
  await cache.fetchRange({
    centerChunkX: 1,
    centerChunkY: 1,
    radius: 0,
    loader: async () => ({ world: { worldId: 1 }, chunks: [chunk(1, 1, 'v2', 22)] }),
  })
  releaseOld({ world: { worldId: 1 }, chunks: [chunk(1, 1, 'v1', 11)] })
  await old
  expect(cache.entries.get('1:1').version).toBe('v2')
  expect(cache.entries.get('1:1').placedObjects[0].id).toBe(22)
  expect(cache.staleDiscarded).toBe(1)
})

test('merges terrain and objects by canonical identity without duplicates', async () => {
  const cache = new WorldChunkCache()
  await cache.fetchRange({
    centerChunkX: 0,
    centerChunkY: 0,
    radius: 1,
    loader: async () => ({
      world: { worldId: 1 },
      player: { x: 7, y: 7 },
      availableInteractions: [],
      chunks: [chunk(0, 0, 'a', 7), chunk(1, 0, 'b', 7)],
    }),
  })
  const state = cache.synthesize({ mapBounds: {} }, {
    world: { worldId: 1, minTileX: 0, maxTileX: 23, minTileY: 0, maxTileY: 15 },
    player: { x: 7, y: 7 },
    availableInteractions: [],
  })
  expect(state.terrainTiles).toHaveLength(2)
  expect(state.placedObjects).toHaveLength(1)
})

test('keeps the latest full-state player and interaction authority during synthesis', async () => {
  const cache = new WorldChunkCache()
  await cache.fetchRange({
    centerChunkX: 0,
    centerChunkY: 0,
    radius: 0,
    loader: async () => ({
      world: { worldId: 1 },
      player: { x: 1, y: 1 },
      availableInteractions: [{ type: 'STALE' }],
      chunks: [chunk(0, 0, 'a')],
    }),
  })
  const state = cache.synthesize({
    playerPosition: { x: 2, y: 1 },
    availableInteractions: [{ type: 'TALK' }],
  }, {})
  expect(state.playerPosition).toEqual({ x: 2, y: 1 })
  expect(state.availableInteractions).toEqual([{ type: 'TALK' }])
})

test('seeds the finite hub state into six cache chunks before range refresh', () => {
  const cache = new WorldChunkCache()
  cache.seedFromWorldState({
    mapBounds: { minX: 0, maxX: 23, minY: 0, maxY: 15 },
    terrainTiles: [
      { x: 0, y: 0, terrainType: 'GRASS' },
      { x: 8, y: 0, terrainType: 'GRASS' },
      { x: 16, y: 0, terrainType: 'GRASS' },
      { x: 0, y: 8, terrainType: 'GRASS' },
      { x: 8, y: 8, terrainType: 'GRASS' },
      { x: 23, y: 15, terrainType: 'GRASS' },
    ],
    placedObjects: [
      { id: 3, x: 8 * 48, y: 8 * 48, assetType: 'MEMORY_SPARK' },
    ],
  })
  expect(cache.entries.size).toBe(6)
  expect(cache.entries.get('0:0').terrain).toHaveLength(1)
  expect(cache.entries.get('1:1').placedObjects[0].id).toBe(3)
  expect(cache.entries.get('2:1').terrain).toHaveLength(1)
})

test('bounds LRU while protecting the current and pinned target chunks', async () => {
  const cache = new WorldChunkCache(2)
  cache.pinOnly(chunkKey(0, 0))
  await cache.fetchRange({
    centerChunkX: 2,
    centerChunkY: 0,
    radius: 2,
    loader: async () => ({
      world: { worldId: 1 },
      chunks: [chunk(0, 0, 'a'), chunk(1, 0, 'b'), chunk(2, 0, 'c')],
    }),
  })
  expect(cache.entries.size).toBe(2)
  expect(cache.entries.has('0:0')).toBeTruthy()
  expect(cache.entries.has('2:0')).toBeTruthy()
})

test('resets all cached and pinned state when canonical state changes the authenticated world', async () => {
  const cache = new WorldChunkCache()
  await cache.fetchRange({
    centerChunkX: 0,
    centerChunkY: 0,
    radius: 0,
    loader: async () => ({ world: { worldId: 1 }, chunks: [chunk(0, 0, 'a')] }),
  })
  cache.pinOnly('0:0')
  cache.seedFromWorldState({
    worldId: 2,
    mapBounds: { minX: 0, maxX: 23, minY: 0, maxY: 15 },
    terrainTiles: [{ x: 0, y: 0, terrainType: 'GRASS', walkable: true }],
  })
  await cache.fetchRange({
    centerChunkX: 0,
    centerChunkY: 0,
    radius: 1,
    loader: async () => ({ world: { worldId: 2 }, chunks: [chunk(0, 0, 'b')] }),
  })
  expect(cache.worldId).toBe(2)
  expect(cache.entries.size).toBe(9)
  expect(cache.entries.get('0:0').version).toBe('b')
  expect(cache.pinned.size).toBe(0)
})

test('switches world identity before seeding and never synthesizes empty authoritative terrain', async () => {
  const cache = new WorldChunkCache()
  await cache.fetchRange({
    centerChunkX: 0,
    centerChunkY: 0,
    radius: 0,
    loader: async () => ({ world: { worldId: 1 }, chunks: [chunk(0, 0, 'old')] }),
  })

  const authoritative = {
    worldId: 2,
    mapBounds: { minX: 0, maxX: 23, minY: 0, maxY: 15 },
    terrainTiles: [{ x: 0, y: 0, terrainType: 'GRASS', walkable: true }],
    placedObjects: [],
    npcPositions: [],
  }
  cache.seedFromWorldState(authoritative)

  expect(cache.worldId).toBe(2)
  expect(cache.entries.get('0:0').version).toBe('state-fallback')
  expect(cache.synthesize(authoritative, {}).terrainTiles).toEqual(authoritative.terrainTiles)

  cache.reset(2)
  expect(cache.synthesize(authoritative, {}).terrainTiles).toEqual(authoritative.terrainTiles)
})

test('adopts an authenticated world after the undefined bootstrap identity', () => {
  const cache = new WorldChunkCache()
  cache.seedFromWorldState({
    worldId: 'world-a',
    mapBounds: { minX: 0, maxX: 23, minY: 0, maxY: 15 },
    terrainTiles: [{ x: 0, y: 0, terrainType: 'GRASS', walkable: true }],
  })
  expect(cache.worldId).toBe('world-a')
  expect(cache.terrainCount()).toBe(1)
})

test('keeps canonical terrain when the same world is seeded again after reload', () => {
  const cache = new WorldChunkCache()
  const state = {
    worldId: 'world-a',
    mapBounds: { minX: 0, maxX: 23, minY: 0, maxY: 15 },
    terrainTiles: [
      { x: 0, y: 0, terrainType: 'GRASS', walkable: true },
      { x: 1, y: 0, terrainType: 'ROAD', walkable: true },
    ],
  }
  cache.seedFromWorldState(state)
  const epoch = cache.epoch
  cache.seedFromWorldState(state)
  expect(cache.epoch).toBe(epoch)
  expect(cache.synthesize(state, {}).terrainTiles).toEqual(state.terrainTiles)
})

test('does not let a late old-world chunk response reset the current world', async () => {
  const cache = new WorldChunkCache()
  cache.seedFromWorldState({
    worldId: 'world-a',
    mapBounds: { minX: 0, maxX: 23, minY: 0, maxY: 15 },
    terrainTiles: [{ x: 0, y: 0, terrainType: 'GRASS', walkable: true }],
  })
  let releaseWorldA
  const oldRequest = cache.fetchRange({
    centerChunkX: 0,
    centerChunkY: 0,
    radius: 0,
    loader: () => new Promise((resolve) => { releaseWorldA = resolve }),
  })
  const worldB = {
    worldId: 'world-b',
    mapBounds: { minX: 0, maxX: 23, minY: 0, maxY: 15 },
    terrainTiles: [{ x: 8, y: 0, terrainType: 'ROAD', walkable: true }],
  }
  cache.seedFromWorldState(worldB)
  releaseWorldA({ world: { worldId: 'world-a' }, chunks: [chunk(0, 0, 'late-a')] })
  await oldRequest
  expect(cache.worldId).toBe('world-b')
  expect(cache.terrainCount()).toBe(1)
  expect(cache.synthesize(worldB, {}).terrainTiles).toEqual(worldB.terrainTiles)
})

test('rejects a mismatched chunk response without clearing the canonical state', async () => {
  const cache = new WorldChunkCache()
  const state = {
    worldId: 'world-a',
    mapBounds: { minX: 0, maxX: 23, minY: 0, maxY: 15 },
    terrainTiles: [{ x: 0, y: 0, terrainType: 'GRASS', walkable: true }],
  }
  cache.seedFromWorldState(state)
  await cache.fetchRange({
    centerChunkX: 0,
    centerChunkY: 0,
    radius: 0,
    loader: async () => ({ world: { worldId: 'world-b' }, chunks: [chunk(0, 0, 'wrong-world')] }),
  })
  expect(cache.worldId).toBe('world-a')
  expect(cache.synthesize(state, {}).terrainTiles).toEqual(state.terrainTiles)
  expect(cache.staleDiscarded).toBe(1)
})
