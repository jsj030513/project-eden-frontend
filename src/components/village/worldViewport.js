export const WORLD_TILE_SIZE = 48
export const WORLD_CAMERA_SCALE = 1.1
export const MOBILE_PORTRAIT_CAMERA_SCALE = 0.84
export const MOBILE_LANDSCAPE_CAMERA_SCALE = 0.94
export const DEFAULT_WORLD_BOUNDS = Object.freeze({
  minX: 0,
  maxX: 23,
  minY: 0,
  maxY: 15,
})

export const RENDER_TILE_BUFFER = 1
export const RENDER_OBJECT_BUFFER = 3

export function normalizeWorldBounds(bounds) {
  if (
    Number.isInteger(bounds?.minX)
    && Number.isInteger(bounds?.maxX)
    && Number.isInteger(bounds?.minY)
    && Number.isInteger(bounds?.maxY)
    && bounds.minX <= bounds.maxX
    && bounds.minY <= bounds.maxY
  ) return bounds
  return DEFAULT_WORLD_BOUNDS
}

export function tileToPixel(tile) {
  return tile * WORLD_TILE_SIZE
}

export function pixelToTile(pixel) {
  return Math.floor(pixel / WORLD_TILE_SIZE)
}

export function worldPixelSize(bounds) {
  const safe = normalizeWorldBounds(bounds)
  return {
    width: (safe.maxX - safe.minX + 1) * WORLD_TILE_SIZE,
    height: (safe.maxY - safe.minY + 1) * WORLD_TILE_SIZE,
  }
}

export function worldOriginPixels(bounds) {
  const safe = normalizeWorldBounds(bounds)
  return {
    x: -safe.minX * WORLD_TILE_SIZE,
    y: -safe.minY * WORLD_TILE_SIZE,
  }
}

export function cameraScaleForViewport(viewportWidth, viewportHeight) {
  if (!Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) {
    return WORLD_CAMERA_SCALE
  }
  if (viewportWidth >= 900 && viewportHeight >= 700) return WORLD_CAMERA_SCALE
  return viewportHeight >= viewportWidth
    ? MOBILE_PORTRAIT_CAMERA_SCALE
    : MOBILE_LANDSCAPE_CAMERA_SCALE
}

export function cameraVariables(position, bounds, scale = WORLD_CAMERA_SCALE) {
  const size = worldPixelSize(bounds)
  const origin = worldOriginPixels(bounds)
  return {
    '--character-x': position.x,
    '--character-y': position.y,
    '--camera-character-x': `${(position.x + origin.x) * scale}px`,
    '--camera-character-y': `${(position.y + origin.y) * scale}px`,
    '--camera-world-width': `${size.width * scale}px`,
    '--camera-world-height': `${size.height * scale}px`,
    '--camera-zoom': scale,
    '--world-width': `${size.width}px`,
    '--world-height': `${size.height}px`,
    '--world-origin-x': `${origin.x}px`,
    '--world-origin-y': `${origin.y}px`,
  }
}

export function calculateRenderBounds({
  playerPixelX,
  playerPixelY,
  viewportWidth,
  viewportHeight,
  worldBounds,
  buffer = RENDER_TILE_BUFFER,
  cameraScale = WORLD_CAMERA_SCALE,
}) {
  const bounds = normalizeWorldBounds(worldBounds)
  const playerTileX = pixelToTile(playerPixelX)
  const playerTileY = pixelToTile(playerPixelY)
  const halfTilesX = Math.ceil(viewportWidth / cameraScale / WORLD_TILE_SIZE / 2)
  const halfTilesY = Math.ceil(viewportHeight / cameraScale / WORLD_TILE_SIZE / 2)
  return {
    minX: Math.max(bounds.minX, playerTileX - halfTilesX - buffer),
    maxX: Math.min(bounds.maxX, playerTileX + halfTilesX + buffer),
    minY: Math.max(bounds.minY, playerTileY - halfTilesY - buffer),
    maxY: Math.min(bounds.maxY, playerTileY + halfTilesY + buffer),
  }
}

export function tileIsVisible(x, y, bounds, padding = 0) {
  return x >= bounds.minX - padding
    && x <= bounds.maxX + padding
    && y >= bounds.minY - padding
    && y <= bounds.maxY + padding
}

export function objectIsVisible(object, bounds, padding = RENDER_OBJECT_BUFFER) {
  return tileIsVisible(pixelToTile(object?.x), pixelToTile(object?.y), bounds, padding)
}

export function filterVisibleObjects(objects, bounds, pinnedTargetId = null) {
  return objects.filter((object) => (
    (pinnedTargetId != null && String(object.id) === String(pinnedTargetId))
    || objectIsVisible(object, bounds, RENDER_OBJECT_BUFFER)
  ))
}

export function filterVisibleInteractions(interactions, bounds, pinnedTargetId = null, selected = null) {
  return interactions.filter((interaction) => (
    (pinnedTargetId != null && String(interaction.targetId) === String(pinnedTargetId))
    || (selected
      && interaction.x === selected.x
      && interaction.y === selected.y
      && interaction.type === selected.type)
    || tileIsVisible(interaction.x, interaction.y, bounds, 1)
  ))
}

export function rectIsVisible(rect, bounds, padding = RENDER_OBJECT_BUFFER) {
  const minX = pixelToTile(rect.x)
  const minY = pixelToTile(rect.y)
  const maxX = pixelToTile(rect.x + rect.width)
  const maxY = pixelToTile(rect.y + rect.height)
  return maxX >= bounds.minX - padding
    && minX <= bounds.maxX + padding
    && maxY >= bounds.minY - padding
    && minY <= bounds.maxY + padding
}
