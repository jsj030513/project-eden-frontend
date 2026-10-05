import { installHubWorld } from './hub-pixel-fixture'

// Synthetic presentation cases only. None extends the real generator audit.
export const P51_CASES = {
  'grass-shore': { land: 'GRASS' },
  'forest-bank': { land: 'FOREST' },
  'flower-bank': { land: 'FLOWER_FIELD' },
  'sand-shore': { land: 'BEACH' },
  'rock-coast': { land: 'ROCK' },
  'cliff-rock-coast': { land: 'CLIFF', west: 'ROCK' },
  'earth-bank': { land: 'ROAD' },
  'soil-bank': { land: 'SOIL' },
  'mixed-grass-sand-corner': { land: 'GRASS', west: 'BEACH' },
  'mixed-sand-rock-corner': { land: 'BEACH', west: 'ROCK' },
  'mixed-grass-rock-corner': { land: 'GRASS', west: 'ROCK' },
  'isolated-water': { land: 'GRASS', size: 1 },
  'pool-2x2': { land: 'GRASS', size: 2 },
  'pool-3x3': { land: 'GRASS', size: 3 },
}

export function buildP51Tiles(name = 'grass-shore') {
  const { land, west = land, size = 5 } = P51_CASES[name]
  const tiles = new Map()
  const set = (x, y, terrainType) => tiles.set(`${x}:${y}`, {
    x, y, terrainType, walkable: !['WATER', 'ROCK', 'CLIFF', 'BUILDING'].includes(terrainType),
  })
  for (let y = -8; y < 24; y++) for (let x = -8; x < 32; x++) set(x, y, 'GRASS')
  for (let y = -3; y <= size - 2; y++) for (let x = -3; x <= size - 2; x++) set(x, y, land)
  // Pools straddle negative coordinates and the -1/0 chunk boundary.
  for (let y = -2; y < size - 2; y++) for (let x = -2; x < size - 2; x++) set(x, y, 'WATER')
  for (let y = -3; y <= size - 2; y++) set(-3, y, west)
  // A shoreline notch produces inner corners as well as the outer pool rim.
  if (size === 5) set(2, -2, land)
  return [...tiles.values()]
}

export async function installP51World(page, name, position = { x: 0, y: 4 }) {
  const fixture = await installHubWorld(page, position)
  fixture.state.terrainTiles = buildP51Tiles(name)
  fixture.state.placedObjects = []
  fixture.state.npcPositions = []
  return fixture
}
