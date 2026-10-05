import { WORLD_TILE_SIZE } from './worldViewport'

/**
 * Presentation-only terrain resolution. Terrain type and walkability remain
 * authoritative in world state; this module selects stable visual metadata.
 *
 * Source art is authored at 16px and designed for a 3x (48px) logical tile.
 * Current camera zooms (1.1 desktop, 0.84/0.94 mobile) and RAF-interpolated
 * player positions can land between device pixels, so strict pixel-perfect
 * camera output remains a later camera-policy task.
 */
export const PIXEL_SOURCE_TILE_SIZE = 16
export const PIXEL_SCALE = WORLD_TILE_SIZE / PIXEL_SOURCE_TILE_SIZE
export const WORLD_TILE_RESOLVER_VERSION = 1

const TERRAIN_FAMILIES = Object.freeze({
  GRASS: 'grass',
  ROAD: 'path',
  SOIL: 'soil',
  FLOWER_FIELD: 'flower-ground',
  FOREST: 'forest-ground',
  WATER: 'water',
  BRIDGE: 'bridge',
  BEACH: 'sand',
  BUILDING: 'building-footprint',
  ROCK: 'rock-ground',
  CLIFF: 'cliff',
})

// Cardinal bits use N/E/S/W order; diagonal bits use NE/SE/SW/NW order.
export const CARDINAL_NEIGHBORS = Object.freeze([
  Object.freeze({ name: 'north', dx: 0, dy: -1, bit: 1 }),
  Object.freeze({ name: 'east', dx: 1, dy: 0, bit: 2 }),
  Object.freeze({ name: 'south', dx: 0, dy: 1, bit: 4 }),
  Object.freeze({ name: 'west', dx: -1, dy: 0, bit: 8 }),
])

export const DIAGONAL_NEIGHBORS = Object.freeze([
  Object.freeze({ name: 'northEast', dx: 1, dy: -1, bit: 1 }),
  Object.freeze({ name: 'southEast', dx: 1, dy: 1, bit: 2 }),
  Object.freeze({ name: 'southWest', dx: -1, dy: 1, bit: 4 }),
  Object.freeze({ name: 'northWest', dx: -1, dy: -1, bit: 8 }),
])

const ALL_NEIGHBORS = Object.freeze([...CARDINAL_NEIGHBORS, ...DIAGONAL_NEIGHBORS])
const VARIANTS_PER_FAMILY = 4

function normalizeTerrainType(value) {
  const terrainType = typeof value === 'string' ? value : value?.terrainType
  return typeof terrainType === 'string' ? terrainType.trim().toUpperCase() : ''
}

function normalizeSeason(season) {
  if (typeof season !== 'string') return null
  const value = season.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  return value || null
}

function normalizeVersion(version) {
  return Number.isInteger(version) && version >= 0 ? version : WORLD_TILE_RESOLVER_VERSION
}

function coordinate(value) {
  return Number.isInteger(value) ? value : 0
}

function hashVariant({ family, tileX, tileY, resolverVersion, season, variationSalt }) {
  const seed = `${resolverVersion}|${family}|${tileX}|${tileY}|${season ?? ''}|${variationSalt}`
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) % VARIANTS_PER_FAMILY
}

function familyFor(terrainType) {
  return TERRAIN_FAMILIES[terrainType] || 'unknown'
}

function mediumFor(family) {
  return family === 'water' ? 'water' : 'land'
}

function normalizeNeighbor(value) {
  const terrainType = normalizeTerrainType(value)
  return terrainType ? familyFor(terrainType) : null
}

function maskFor(directions, neighborFamilies, currentFamily, predicate) {
  return directions.reduce((mask, neighbor) => {
    const adjacentFamily = neighborFamilies[neighbor.name]
    return adjacentFamily && predicate(currentFamily, adjacentFamily)
      ? mask | neighbor.bit
      : mask
  }, 0)
}

function hexMask(mask) {
  return mask.toString(16).padStart(2, '0')
}

function cssClassName(terrainType, family, edgeMask, cornerMask, variantIndex) {
  const legacyType = (terrainType || 'unknown').toLowerCase().replace(/[^a-z0-9_-]/g, '-')
  return [
    `terrain-${legacyType}`,
    'world-tile',
    `world-tile--${family}`,
    `world-tile--edges-${hexMask(edgeMask)}`,
    `world-tile--corners-${hexMask(cornerMask)}`,
    `world-tile--variant-${variantIndex}`,
  ].join(' ')
}

/** Resolve one terrain tile without reading or changing game-logic state. */
export function resolveWorldTile({
  terrainType: inputTerrainType,
  tileX,
  tileY,
  neighbors = {},
  season,
  resolverVersion = WORLD_TILE_RESOLVER_VERSION,
  variationSalt = 'base',
} = {}) {
  const terrainType = normalizeTerrainType(inputTerrainType) || 'UNKNOWN'
  const family = familyFor(terrainType)
  const x = coordinate(tileX)
  const y = coordinate(tileY)
  const version = normalizeVersion(resolverVersion)
  const normalizedSeason = normalizeSeason(season)
  const salt = String(variationSalt)
  const neighborFamilies = Object.fromEntries(ALL_NEIGHBORS.map(({ name }) => [
    name,
    normalizeNeighbor(neighbors?.[name]),
  ]))

  const edgeMask = maskFor(CARDINAL_NEIGHBORS, neighborFamilies, family,
    (current, adjacent) => current !== adjacent)
  const cornerMask = maskFor(DIAGONAL_NEIGHBORS, neighborFamilies, family,
    (current, adjacent) => current !== adjacent)
  const transitionMasks = Object.freeze({
    landWater: maskFor(CARDINAL_NEIGHBORS, neighborFamilies, family,
      (current, adjacent) => mediumFor(current) !== mediumFor(adjacent)),
    pathGround: maskFor(CARDINAL_NEIGHBORS, neighborFamilies, family,
      (current, adjacent) => (current === 'path' || adjacent === 'path') && current !== adjacent),
  })
  const variantIndex = hashVariant({
    family,
    tileX: x,
    tileY: y,
    resolverVersion: version,
    season: normalizedSeason,
    variationSalt: salt,
  })
  const seasonKey = normalizedSeason ? `season/${normalizedSeason}/` : ''
  const assetKey = `terrain/${seasonKey}${family}/edges-${hexMask(edgeMask)}/corners-${hexMask(cornerMask)}/variant-${variantIndex}`

  return Object.freeze({
    terrainType,
    family,
    baseKey: family,
    tileX: x,
    tileY: y,
    resolverVersion: version,
    season: normalizedSeason,
    neighborFamilies: Object.freeze(neighborFamilies),
    edgeMask,
    cornerMask,
    neighborMask: edgeMask | (cornerMask << 4),
    transitionMasks,
    variantIndex,
    assetKey,
    className: cssClassName(terrainType, family, edgeMask, cornerMask, variantIndex),
  })
}

/** Resolve a tile array using global coordinates; input order does not matter. */
export function resolveWorldTiles(tiles = [], options = {}) {
  const byCoordinate = new Map()
  for (const tile of tiles) {
    if (!Number.isInteger(tile?.x) || !Number.isInteger(tile?.y)) continue
    byCoordinate.set(`${tile.x}:${tile.y}`, tile)
  }

  return tiles.filter((tile) => Number.isInteger(tile?.x) && Number.isInteger(tile?.y))
    .map((tile) => {
      const neighbors = Object.fromEntries(ALL_NEIGHBORS.map(({ name, dx, dy }) => {
        const adjacent = byCoordinate.get(`${tile.x + dx}:${tile.y + dy}`)
        return [name, adjacent?.terrainType]
      }))
      return {
        ...tile,
        ...resolveWorldTile({
          terrainType: tile.terrainType,
          tileX: tile.x,
          tileY: tile.y,
          neighbors,
          ...options,
        }),
      }
    })
}
