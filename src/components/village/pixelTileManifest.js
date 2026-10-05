import atlas from './pixelTileAtlas.json' with { type: 'json' }
import { CARDINAL_NEIGHBORS, DIAGONAL_NEIGHBORS, PIXEL_SOURCE_TILE_SIZE } from './worldTileResolver'
import { WORLD_TILE_SIZE } from './worldViewport'

export const PIXEL_TILE_ATLAS = atlas
const SCALE = WORLD_TILE_SIZE / PIXEL_SOURCE_TILE_SIZE
const GROUND = new Set(['grass', 'flower-ground', 'forest-ground'])
const CORNER_SIDES = [3, 6, 12, 9] // NE, SE, SW, NW: adjacent cardinal bits.
const validMask = (value) => Number.isInteger(value) && value >= 0 && value <= 15

function coastMaterial(family) {
  if (GROUND.has(family)) return 'grass-bank'
  if (family === 'sand') return 'sand-bank'
  if (family === 'rock-ground' || family === 'cliff') return 'rock-bank'
  if (!family || ['water', 'bridge', 'unknown'].includes(family)) return 'none'
  // ROAD/SOIL and existing known land (e.g. a building footprint) retain the
  // neutral earth bank. This is presentation metadata, never terrain state.
  return 'earth-bank'
}

function waterTransitions(tile, family, edges, corners) {
  const materialAt = (name) => tile.neighborFamilies
    ? coastMaterial(tile.neighborFamilies[name]) : 'earth-bank'
  const selections = []
  for (const [index, { name, bit }] of DIAGONAL_NEIGHBORS.entries()) {
    // A bridge diagonal never acquires a water-owned corner.
    if (tile.neighborFamilies?.[name] === 'bridge') continue
    const sides = edges & CORNER_SIDES[index]
    if (sides === CORNER_SIDES[index]) {
      const first = materialAt(CARDINAL_NEIGHBORS[index].name)
      const second = materialAt(CARDINAL_NEIGHBORS[(index + 1) % 4].name)
      // Exactly one outer corner above both edges: shared material when equal,
      // otherwise the existing neutral earth corner covers their intersection.
      selections.push([`outer/${name}`, first === second ? first : 'earth-bank'])
    } else if (sides === 0 && (corners & bit)) {
      selections.push([`inner/${name}`, materialAt(name)])
    }
  }
  for (const { name, bit } of CARDINAL_NEIGHBORS) {
    if (edges & bit) selections.push([`edge/${name}`, materialAt(name)])
  }
  return selections.map(([key, material]) =>
    family.coastTransitions?.[material]?.[key] ?? family.transitions[key])
}

function transitionMask(tile, directions, mask) {
  // Bridge edges require known water, not merely a different family. Missing
  // neighbors cannot prove a bank/rail, so a partial chunk stays open.
  if (!tile.neighborFamilies) return tile.family === 'bridge' ? 0 : mask
  return directions.reduce((result, { name, bit }) => {
    const family = tile.neighborFamilies[name]
    // Road/soil receive grass rims only at compatible ground. Water receives
    // a material bank at known land, leaving bridge connections open.
    const compatible = tile.family === 'water'
      ? family && !['water', 'bridge', 'unknown'].includes(family)
      : tile.family === 'bridge' ? family === 'water'
      : tile.family === 'forest-ground' ? family === 'grass' || family === 'flower-ground'
      : GROUND.has(family)
    return compatible && (mask & bit) ? result | bit : result
  }, 0)
}

/** Presentation lookup only. Missing masks/art degrade to base, then legacy CSS. */
export function lookupPixelTile(tile, { baseAvailable = true, transitionsAvailable = true } = {}) {
  const family = Object.hasOwn(atlas.families, tile?.family) ? atlas.families[tile.family] : null
  if (!family || !baseAvailable) return null
  const variant = Number.isInteger(tile.variantIndex) && tile.variantIndex >= 0
    ? tile.variantIndex % family.variants.length : 0
  const base = family.variants[variant]
  if (!base) return null
  const result = { family: tile.family, variantIndex: variant, key: base.key, mode: 'base', layers: [base] }
  if (!transitionsAvailable || !validMask(tile.edgeMask) || !validMask(tile.cornerMask)) return result

  const edges = transitionMask(tile, CARDINAL_NEIGHBORS, tile.edgeMask)
  // Bridge decks need cardinal sides only, including at a crossing. Requiring
  // the ground corner set would incorrectly discard valid bridge edges.
  const corners = tile.family === 'bridge' ? 0 : transitionMask(tile, DIAGONAL_NEIGHBORS, tile.cornerMask)
  const keys = []
  for (const [index, { name, bit }] of (tile.family === 'bridge' ? [] : DIAGONAL_NEIGHBORS).entries()) {
    const sides = edges & CORNER_SIDES[index]
    if (sides === CORNER_SIDES[index]) keys.push(`outer/${name}`)
    else if (sides === 0 && (corners & bit)) keys.push(`inner/${name}`)
  }
  for (const { name, bit } of CARDINAL_NEIGHBORS) if (edges & bit) keys.push(`edge/${name}`)
  // Grass/rock/flower intentionally have base variants only. A future atlas
  // with incomplete transition coverage follows this same all-or-base path.
  const layers = tile.family === 'water'
    ? waterTransitions(tile, family, edges, corners)
    : keys.map((key) => family.transitions[key])
  // Missing material art first uses the compatible existing water bank. If
  // that is absent too, retain the opaque water base (never transition-only).
  if (layers.some((layer) => !layer)) return result
  const coastKey = tile.family === 'water' && layers.length
    ? `/coast-${layers.map((layer) => layer.key.replace('terrain/water/', '')).join('+')}` : ''
  return {
    ...result,
    mode: 'exact', edgeMask: edges, cornerMask: corners,
    key: `terrain/${tile.family}/edges-${edges.toString(16).padStart(2, '0')}/corners-${corners.toString(16).padStart(2, '0')}/variant-${variant}${coastKey}`,
    layers: [...layers, base],
  }
}

export function pixelTileStyle(visual) {
  return {
    width: WORLD_TILE_SIZE, height: WORLD_TILE_SIZE,
    backgroundImage: visual.layers.map((layer) => `url("${atlas.atlases[layer.atlas].url}")`).join(', '),
    backgroundPosition: visual.layers.map(({ rect }) => `${-rect.x * SCALE}px ${-rect.y * SCALE}px`).join(', '),
    backgroundSize: visual.layers.map((layer) => {
      const sheet = atlas.atlases[layer.atlas]
      return `${sheet.width * SCALE}px ${sheet.height * SCALE}px`
    }).join(', '),
  }
}
