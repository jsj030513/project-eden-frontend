import { WORLD_TILE_SIZE } from './worldViewport'

export const HUB_BRIDGE = Object.freeze({
  minX: 17,
  maxX: 22,
  y: 13,
  entryX: 16,
  exitX: 23,
})

export const COMMUNITY_HOUSE = Object.freeze({
  minX: 13,
  maxX: 15,
  minY: 3,
  maxY: 5,
  anchorX: 14,
  anchorY: 6,
  approachX: 14,
  approachY: 7,
})

export function bridgeVisualStyle() {
  return {
    left: `${HUB_BRIDGE.minX * WORLD_TILE_SIZE}px`,
    top: `${HUB_BRIDGE.y * WORLD_TILE_SIZE}px`,
    width: `${(HUB_BRIDGE.maxX - HUB_BRIDGE.minX + 1) * WORLD_TILE_SIZE}px`,
    height: `${WORLD_TILE_SIZE}px`,
  }
}

export function communityHouseVisualStyle() {
  const logicalWidth = (COMMUNITY_HOUSE.maxX - COMMUNITY_HOUSE.minX + 1) * WORLD_TILE_SIZE
  const logicalHeight = (COMMUNITY_HOUSE.maxY - COMMUNITY_HOUSE.minY + 1) * WORLD_TILE_SIZE
  const visualScale = 0.72
  const width = Math.round(logicalWidth * visualScale)
  const height = Math.round(logicalHeight * visualScale)
  return {
    '--community-house-width': `${width}px`,
    '--community-house-height': `${height}px`,
    '--community-house-offset-x': `${Math.round(width / 2)}px`,
  }
}
