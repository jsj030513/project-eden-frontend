import { pixelToTile } from './worldViewport'
import {
  decrementDiagnostic,
  incrementDiagnostic,
  recordHydrationDiagnostic,
} from './phase3cDiagnostics'

export const WORLD_CHUNK_SIZE = 8
export const MAX_CACHED_WORLD_CHUNKS = 25

export function tileToChunk(tile) {
  return Math.floor(tile / WORLD_CHUNK_SIZE)
}

export function tileToChunkLocal(tile) {
  return ((tile % WORLD_CHUNK_SIZE) + WORLD_CHUNK_SIZE) % WORLD_CHUNK_SIZE
}

export function chunkKey(chunkX, chunkY) {
  return `${chunkX}:${chunkY}`
}

export function objectChunkKey(object) {
  return chunkKey(tileToChunk(pixelToTile(object.x)), tileToChunk(pixelToTile(object.y)))
}

export class WorldChunkCache {
  constructor(limit = MAX_CACHED_WORLD_CHUNKS) {
    this.limit = limit
    this.worldId = null
    this.entries = new Map()
    this.inFlight = new Map()
    this.latestSequence = new Map()
    this.pinned = new Set()
    this.sequence = 0
    this.epoch = 0
    this.staleDiscarded = 0
  }

  reset(worldId = null) {
    this.epoch += 1
    this.worldId = worldId
    this.entries.clear()
    this.inFlight.clear()
    this.latestSequence.clear()
    this.pinned.clear()
    this.staleDiscarded = 0
    recordHydrationDiagnostic('CACHE_RESET', { worldId, cacheEpoch: this.epoch })
  }

  pinOnly(key) {
    this.pinned.clear()
    if (key) this.pinned.add(key)
  }

  hasGenerated(key) {
    return this.entries.get(key)?.loadState === 'generated'
  }

  seedFromWorldState(worldState) {
    const bounds = worldState?.mapBounds
    if (!bounds) return
    // A cache instance belongs to exactly one authenticated world. App-level
    // logout/login can reuse the React tree, so discard entries from the prior
    // world before seeding the newly authenticated state. Otherwise the first
    // chunk response triggers reset() after the seed and briefly synthesizes
    // an empty terrain array.
    const nextWorldId = worldState.worldId ?? null
    if (nextWorldId != null && this.worldId != null
      && String(this.worldId) !== String(nextWorldId)) {
      this.reset(nextWorldId)
    } else if (this.worldId == null && nextWorldId != null) {
      this.worldId = nextWorldId
    }
    recordHydrationDiagnostic('CACHE_SEED_FROM_STATE', {
      worldId: this.worldId,
      cacheEpoch: this.epoch,
      stateTerrainCount: worldState.terrainTiles?.length ?? 0,
      stateObjectCount: worldState.placedObjects?.length ?? 0,
    })
    const seeded = new Map()
    const ensureSeed = (chunkX, chunkY) => {
      const key = chunkKey(chunkX, chunkY)
      if (seeded.has(key)) return seeded.get(key)
      const existing = this.entries.get(key)
      const entry = existing || {
        chunkX,
        chunkY,
        regionType: chunkX >= 0 && chunkX <= 2 && chunkY >= 0 && chunkY <= 1 ? 'HUB' : null,
        templateKey: null,
        generationVersion: worldState.generationVersion,
        discoveredAt: chunkX >= 0 && chunkX <= 2 && chunkY >= 0 && chunkY <= 1 ? 'state-fallback' : null,
        version: 'state-fallback',
        terrain: [],
        decorations: [],
        placedObjects: [],
        npcs: [],
        status: 'GENERATED',
        loadState: 'generated',
        requestSequence: 0,
        requestedAt: Date.now(),
        lastAccessedAt: Date.now(),
      }
      if (!existing) this.entries.set(key, entry)
      seeded.set(key, entry)
      return entry
    }
    for (const tile of worldState.terrainTiles || []) {
      const entry = ensureSeed(tileToChunk(tile.x), tileToChunk(tile.y))
      if (!entry.terrain.some((candidate) => candidate.x === tile.x && candidate.y === tile.y)) {
        entry.terrain.push(tile)
      }
    }
    for (const object of worldState.placedObjects || []) {
      const [chunkX, chunkY] = objectChunkKey(object).split(':').map(Number)
      const entry = ensureSeed(chunkX, chunkY)
      if (!entry.placedObjects.some((candidate) => String(candidate.id) === String(object.id))) {
        entry.placedObjects.push(object)
      }
    }
    for (const npc of worldState.npcPositions || []) {
      const entry = ensureSeed(tileToChunk(npc.x), tileToChunk(npc.y))
      entry.npcs ||= []
      if (!entry.npcs.some((candidate) => String(candidate.objectId ?? candidate.id) === String(npc.objectId ?? npc.id))) {
        entry.npcs.push(npc)
      }
    }
    this.evict(null)
  }

  async fetchRange({ centerChunkX, centerChunkY, radius, loader }) {
    const requestKey = `${centerChunkX}:${centerChunkY}:${radius}`
    if (this.inFlight.has(requestKey)) return this.inFlight.get(requestKey)
    const sequence = ++this.sequence
    const requestEpoch = this.epoch
    const requestWorldId = this.worldId
    const requestedKeys = []
    for (let chunkY = centerChunkY - radius; chunkY <= centerChunkY + radius; chunkY += 1) {
      for (let chunkX = centerChunkX - radius; chunkX <= centerChunkX + radius; chunkX += 1) {
        const key = chunkKey(chunkX, chunkY)
        requestedKeys.push(key)
        if (!this.entries.has(key)) {
          this.entries.set(key, {
            chunkX,
            chunkY,
            terrain: [],
            decorations: [],
            placedObjects: [],
            npcs: [],
            status: 'UNGENERATED',
            loadState: 'loading',
            requestSequence: sequence,
            requestedAt: Date.now(),
            lastAccessedAt: Date.now(),
          })
        }
      }
    }
    recordHydrationDiagnostic('CHUNK_REQUEST_START', {
      worldId: requestWorldId,
      cacheEpoch: requestEpoch,
      requestSequence: sequence,
      centerChunkX,
      centerChunkY,
      radius,
    })
    let request
    request = Promise.resolve(loader()).then((payload) => {
      const nextWorldId = payload?.world?.worldId ?? null
      recordHydrationDiagnostic('CHUNK_RESPONSE', {
        worldId: nextWorldId,
        cacheEpoch: this.epoch,
        requestEpoch,
        requestSequence: sequence,
        chunkCount: payload?.chunks?.length ?? 0,
        terrainCount: (payload?.chunks || []).reduce((total, chunk) => total + (chunk.terrain?.length ?? 0), 0),
      })
      if (requestEpoch !== this.epoch) {
        this.staleDiscarded += 1
        recordHydrationDiagnostic('CHUNK_REJECTED_STALE', {
          worldId: nextWorldId,
          cacheWorldId: this.worldId,
          cacheEpoch: this.epoch,
          requestEpoch,
          requestSequence: sequence,
          reason: 'CACHE_EPOCH_CHANGED',
        })
        return payload
      }
      if (this.worldId != null && nextWorldId != null && String(this.worldId) !== String(nextWorldId)) {
        this.staleDiscarded += 1
        recordHydrationDiagnostic('CHUNK_REJECTED_STALE', {
          worldId: nextWorldId,
          cacheWorldId: this.worldId,
          cacheEpoch: this.epoch,
          requestSequence: sequence,
          reason: 'WORLD_ID_MISMATCH',
        })
        return payload
      }
      if (this.worldId == null) {
        this.worldId = nextWorldId
      }
      for (const chunk of payload?.chunks || []) {
        const key = chunkKey(chunk.chunkX, chunk.chunkY)
        const latest = this.latestSequence.get(key) || 0
        if (sequence < latest) {
          this.staleDiscarded += 1
          continue
        }
        const current = this.entries.get(key)
        for (const npc of chunk.npcs || []) {
          const npcId = String(npc.objectId ?? npc.id)
          for (const entry of this.entries.values()) {
            entry.npcs = (entry.npcs || []).filter((candidate) => {
              if (String(candidate.objectId ?? candidate.id) !== npcId) return true
              return Number(candidate.stateVersion ?? 0) > Number(npc.stateVersion ?? 0)
            })
          }
        }
        if (!current || current.version !== chunk.version || sequence >= current.requestSequence) {
          this.entries.set(key, {
            ...chunk,
            discoveredAt: current?.discoveredAt || chunk.discoveredAt || null,
            loadState: 'generated',
            requestSequence: sequence,
            requestedAt: Date.now(),
            lastAccessedAt: Date.now(),
          })
        } else {
          current.lastAccessedAt = Date.now()
        }
        this.latestSequence.set(key, sequence)
      }
      this.evict(chunkKey(centerChunkX, centerChunkY))
      recordHydrationDiagnostic('CHUNK_ACCEPTED', {
        worldId: this.worldId,
        cacheEpoch: this.epoch,
        requestSequence: sequence,
        cacheChunkCount: this.entries.size,
        cacheTerrainCount: this.terrainCount(),
      })
      return payload
    }).catch((error) => {
      for (const key of requestedKeys) {
        const entry = this.entries.get(key)
        if (!entry || entry.requestSequence > sequence || entry.loadState === 'generated') continue
        this.entries.set(key, {
          ...entry,
          status: 'FAILED',
          loadState: 'failed',
          requestSequence: sequence,
          lastAccessedAt: Date.now(),
        })
      }
      throw error
    }).finally(() => {
      if (this.inFlight.get(requestKey) === request) this.inFlight.delete(requestKey)
      decrementDiagnostic('activeChunkRequests')
    })
    this.inFlight.set(requestKey, request)
    incrementDiagnostic('activeChunkRequests', 'maxActiveChunkRequests')
    return request
  }

  terrainCount() {
    const coordinates = new Set()
    for (const chunk of this.entries.values()) {
      for (const tile of chunk.terrain || []) coordinates.add(`${tile.x}:${tile.y}`)
    }
    return coordinates.size
  }

  evict(currentKey) {
    if (this.entries.size <= this.limit) return
    const candidates = [...this.entries.entries()]
      .filter(([key]) => key !== currentKey && !this.pinned.has(key))
      .sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt)
    while (this.entries.size > this.limit && candidates.length) {
      this.entries.delete(candidates.shift()[0])
    }
  }

  synthesize(baseState, response) {
    const terrain = new Map()
    const objects = new Map()
    const npcs = new Map()
    for (const chunk of this.entries.values()) {
      chunk.lastAccessedAt = Date.now()
      for (const tile of chunk.terrain || []) terrain.set(`${tile.x}:${tile.y}`, tile)
      for (const object of chunk.placedObjects || []) objects.set(String(object.id), object)
      for (const npc of chunk.npcs || []) {
        const id = String(npc.objectId ?? npc.id)
        const current = npcs.get(id)
        if (!current || Number(npc.stateVersion ?? 0) >= Number(current.stateVersion ?? 0)) {
          npcs.set(id, npc)
        }
      }
    }
    const snapshot = {
      ...baseState,
      mapBounds: response?.world ? {
        minX: response.world.minTileX,
        maxX: response.world.maxTileX,
        minY: response.world.minTileY,
        maxY: response.world.maxTileY,
      } : baseState?.mapBounds,
      tileSize: response?.world?.tileSize ?? baseState?.tileSize,
      generationVersion: response?.world?.generationVersion ?? baseState?.generationVersion,
      playerPosition: baseState?.playerPosition ?? response?.player,
      availableInteractions: baseState?.availableInteractions ?? response?.availableInteractions ?? [],
      // Never replace an authoritative /state payload with an empty cache
      // projection. This is a correctness fallback for a failed or stale
      // preload, not readiness polling.
      terrainTiles: (terrain.size ? [...terrain.values()] : (baseState?.terrainTiles || []))
        .sort((a, b) => a.y - b.y || a.x - b.x),
      placedObjects: (objects.size ? [...objects.values()] : (baseState?.placedObjects || []))
        .sort((a, b) => Number(a.id) - Number(b.id)),
      npcPositions: (npcs.size ? [...npcs.values()] : (baseState?.npcPositions || []))
        .sort((a, b) => Number(a.objectId ?? a.id) - Number(b.objectId ?? b.id)),
      worldChunks: [...this.entries.values()]
        .filter((entry) => entry.loadState === 'generated')
        .sort((a, b) => a.chunkY - b.chunkY || a.chunkX - b.chunkX),
      chunkCacheSize: this.entries.size,
    }
    recordHydrationDiagnostic('CACHE_MERGE', {
      worldId: this.worldId,
      cacheEpoch: this.epoch,
      cacheChunkCount: this.entries.size,
      cacheTerrainCount: terrain.size,
      renderTerrainCount: snapshot.terrainTiles.length,
    })
    return snapshot
  }
}
