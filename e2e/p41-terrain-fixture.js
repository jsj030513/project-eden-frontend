import { installHubWorld } from './hub-pixel-fixture'

// Presentation fixture only. The P3 fixture and authoritative generator stay
// untouched; reuse its API routing and chunk grid with deliberately small cases.
export function buildP41Tiles() {
  const tiles = new Map()
  const set = (x, y, terrainType) => tiles.set(`${x}:${y}`, {
    x, y, terrainType, walkable: !['WATER', 'ROCK', 'BUILDING', 'CLIFF'].includes(terrainType),
  })
  const fill = (x, y, width, height, type) => {
    for (let dy = 0; dy < height; dy += 1) for (let dx = 0; dx < width; dx += 1) set(x + dx, y + dy, type)
  }
  fill(-8, -8, 40, 32, 'GRASS')
  fill(-6, -5, 5, 5, 'FLOWER_FIELD')
  fill(-4, 1, 2, 5, 'FLOWER_FIELD')
  fill(-2, 0, 6, 7, 'FOREST') // Crosses the -1/0 chunk boundary.
  set(1, 1, 'GRASS') // Inner corners without cardinal boundaries.

  fill(5, 10, 7, 5, 'WATER')
  fill(3, 12, 11, 1, 'ROAD')
  fill(5, 12, 7, 1, 'BRIDGE')
  fill(17, 0, 5, 7, 'WATER')
  fill(19, -2, 1, 11, 'ROAD')
  fill(19, 0, 1, 7, 'BRIDGE')
  fill(-7, 10, 7, 7, 'WATER')
  fill(-8, 13, 9, 1, 'ROAD')
  fill(-4, 9, 1, 9, 'ROAD')
  fill(-7, 13, 7, 1, 'BRIDGE')
  fill(-4, 10, 1, 7, 'BRIDGE')

  // Short movement lanes terminate at rock, so a held key cannot overshoot.
  for (const [y, type] of [[-4, 'FLOWER_FIELD'], [-2, 'FOREST'], [0, 'BRIDGE'], [2, 'WATER'], [4, 'ROCK']]) {
    set(12, y, type)
    set(13, y, 'ROCK')
  }
  return [...tiles.values()]
}

export async function installP41World(page, position = { x: 0, y: 3 }) {
  const fixture = await installHubWorld(page, position)
  fixture.state.terrainTiles = buildP41Tiles()
  fixture.state.placedObjects = [
    { id: 901, assetType: 'FLOWER_CLUSTER', worldCategory: 'NATURE', x: -5 * 48, y: -3 * 48 },
    { id: 902, assetType: 'TREE_GROVE', worldCategory: 'NATURE', x: 0, y: 3 * 48 },
  ]
  fixture.state.npcPositions = []
  return fixture
}
