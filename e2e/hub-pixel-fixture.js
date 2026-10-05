import audit from './fixtures/hub-template-v3.json' with { type: 'json' }
import { configureResourceStableRendering } from './village-resource-stable-rendering.js'

export const HUB_AUDIT = audit
const TYPES = { G: 'GRASS', R: 'ROAD', S: 'SOIL', W: 'WATER', B: 'BRIDGE', H: 'BUILDING', F: 'FOREST', E: 'FLOWER_FIELD', X: 'ROCK' }
const walkable = (type) => ['GRASS', 'ROAD', 'SOIL', 'FLOWER_FIELD', 'FOREST', 'BRIDGE', 'BEACH'].includes(type)
const tile = (x, y, code) => ({ x, y, terrainType: TYPES[code], walkable: walkable(TYPES[code]) })

export function buildAuditedWorld(playerPosition = { x: 11, y: 8 }) {
  const terrainTiles = audit.rows.flatMap((row, y) => [...row].map((code, x) => tile(x, y, code)))
  for (const region of audit.regions) {
    if (region.regionType === 'HUB') continue
    const pattern = audit.outerTemplates[region.regionType]
    terrainTiles.push(...pattern.rows.flatMap((row, y) => [...row].map((code, x) => tile(region.chunkX * 8 + x, region.chunkY * 8 + y, code))))
  }
  const placedObjects = audit.placedObjects.map((object) => ({ ...object }))
  const npcPositions = placedObjects.filter((object) => object.assetType.startsWith('DEFAULT_NPC_')).map((object) => ({
    id: object.id, objectId: object.id, npcKey: object.templateKey, assetType: object.assetType,
    x: object.x / 48, y: object.y / 48, pixelX: object.x, pixelY: object.y, stateVersion: 1,
  }))
  return { worldId: 1, generationVersion: 3, mapBounds: audit.worldBounds, playerPosition, terrainTiles, placedObjects, npcPositions, availableInteractions: [] }
}

export async function installHubWorld(page, position) {
  const state = buildAuditedWorld(position)
  const moves = []
  const unexpected = []
  const interactions = () => {
    const { x, y } = state.playerPosition
    state.availableInteractions = [[0, -1], [0, 1], [-1, 0], [1, 0]].map(([dx, dy]) => ({ type: 'INSPECT', x: x + dx, y: y + dy, available: true }))
  }
  interactions()
  await configureResourceStableRendering(page)
  await page.addInitScript(() => {
    sessionStorage.setItem('projectEdenAccessToken', 'test.access.token')
    sessionStorage.setItem('projectEdenTutorialCompleted', 'true')
  })
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    if (path === '/api/worlds/me/move') {
      const { targetX, targetY } = request.postDataJSON()
      const target = state.terrainTiles.find((value) => value.x === targetX && value.y === targetY)
      const accepted = target?.walkable === true
      if (accepted) state.playerPosition = { x: targetX, y: targetY }
      interactions()
      moves.push({ targetX, targetY, accepted })
      return route.fulfill({ json: { accepted, currentX: state.playerPosition.x, currentY: state.playerPosition.y, terrainType: target?.terrainType } })
    }
    if (path === '/api/worlds/me/chunks') {
      const chunks = audit.regions.map((region) => ({
        ...region, status: 'GENERATED', generationVersion: 3, version: 'audit-v3',
        terrain: state.terrainTiles.filter((value) => Math.floor(value.x / 8) === region.chunkX && Math.floor(value.y / 8) === region.chunkY),
        placedObjects: state.placedObjects.filter((value) => Math.floor(value.x / 384) === region.chunkX && Math.floor(value.y / 384) === region.chunkY),
        decorations: audit.outerTemplates[region.regionType]?.decorations ?? [],
      }))
      return route.fulfill({ json: { world: { worldId: 1, generationVersion: 3, minTileX: -8, maxTileX: 31, minTileY: -8, maxTileY: 23 }, chunks } })
    }
    const responses = {
      '/api/characters/me': { id: 1 }, '/api/worlds/me': { id: 1 },
      '/api/houses/me': { id: 1 }, '/api/inventories/me': { id: 1 },
      '/api/village/me': { id: 1 }, '/api/village/interpretation': {},
      '/api/village/changes': [], '/api/village/history': [], '/api/npcs/me': [],
      '/api/worlds/me/state': state,
    }
    if (Object.hasOwn(responses, path)) return route.fulfill({ json: responses[path] })
    unexpected.push(`${request.method()} ${path}`)
    return route.fulfill({ status: 500, json: { message: 'Unexpected P3 fixture request' } })
  })
  return { state, moves, unexpected }
}
