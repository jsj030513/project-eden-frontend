// Original Project Eden art. No downloaded images, art packages or runtime deps.
// Run: node scripts/generate-pixel-terrain.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const root = new URL('../', import.meta.url)
const size = 16
const columns = 4
const palette = {
  grass: ['#789456', '#6d884e', '#89a461', '#a0b572'],
  path: ['#baa078', '#a18a66', '#cbb18a', '#dcc399'],
  soil: ['#896344', '#755439', '#9e7851', '#b28a60'],
  water: ['#588e90', '#4b7f84', '#6b9f9d', '#85b3aa'],
  'rock-ground': ['#938c7a', '#7c786c', '#aaa18a', '#bcb29b'],
  'flower-ground': ['#789456', '#6d884e', '#89a461', '#d59a9d', '#e1bd76'],
  'forest-ground': ['#63764c', '#506142', '#789456', '#9a895e', '#8b9a65'],
  bridge: ['#a27d52', '#735738', '#bea073', '#d2b782', '#665a49'],
  'building-footprint': ['#a18a66', '#80735d', '#baa078', '#cbb18a'],
  sand: ['#c8b07b', '#ae9665', '#ddc693', '#ead8ad'],
  cliff: ['#938c7a', '#7c786c', '#aaa18a', '#bcb29b', '#645f53'],
}
const families = Object.keys(palette)
// Append rows only: the first five base and nine transition rows are P2 art.
const transitionFamilies = ['path', 'soil', 'water', 'forest-ground']
const variantCounts = { bridge: 2, 'building-footprint': 2, cliff: 2 }
const cardinals = ['north', 'east', 'south', 'west']
const corners = ['northEast', 'southEast', 'southWest', 'northWest']
const rgba = (hex) => [...hex.slice(1).match(/../g).map((part) => parseInt(part, 16)), 255]
const colors = Object.fromEntries(families.map((family) => [family, palette[family].map(rgba)]))

function canvas(width, height) {
  return { width, height, pixels: Buffer.alloc(width * height * 4) }
}

function dot(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return
  image.pixels.set(color, (y * image.width + x) * 4)
}

function rect(image, x, y, width, height, color) {
  for (let dy = 0; dy < height; dy += 1) {
    for (let dx = 0; dx < width; dx += 1) dot(image, x + dx, y + dy, color)
  }
}

function baseTile(family, variant) {
  const tile = canvas(size, size)
  const [base, dark, light, highlight] = colors[family]
  rect(tile, 0, 0, size, size, base)
  // Motifs are hand-authored; only their offsets vary. Border pixels stay quiet.
  const offset = variant * 3
  if (family === 'grass') {
    for (const [x, y] of [[2, 3], [10, 8], [5, 12]]) {
      const px = 1 + ((x + offset) % 13)
      const py = 1 + ((y + variant) % 13)
      dot(tile, px, py, dark)
      dot(tile, px + 1, py, light)
      dot(tile, px + 1, py - 1, light)
    }
    dot(tile, 3 + variant * 2, 7, highlight)
  } else if (family === 'path') {
    for (const [x, y] of [[2, 4], [9, 11], [6, 7]]) {
      const px = 1 + ((x + offset) % 12)
      rect(tile, px, y, 2, 1, light)
      dot(tile, px + 2, y + 1, dark)
    }
    dot(tile, 5 + variant, 2, highlight)
  } else if (family === 'soil') {
    for (const y of [3, 8, 13]) {
      rect(tile, 0, y, size, 1, dark)
      rect(tile, 0, y - 1, size, 1, light)
      dot(tile, 2 + ((variant * 3 + y) % 12), y - 1, highlight)
    }
  } else if (family === 'water') {
    for (const [x, y, length] of [[2, 4, 4], [8, 10, 5]]) {
      const px = 1 + ((x + variant * 2) % 8)
      rect(tile, px, y + variant % 2, length, 1, light)
      dot(tile, px - 1, y + 1 + variant % 2, dark)
    }
    rect(tile, 3 + variant, 14, 3, 1, highlight)
  } else if (family === 'flower-ground') {
    // Tiny ground marks, not stems/crops or a FLOWER_CLUSTER object sprite.
    for (const [x, y] of [[2, 3], [9, 10]]) {
      const px = 2 + ((x + offset) % 11)
      const py = y + variant % 2
      dot(tile, px, py + 1, dark)
      dot(tile, px + 1, py + 1, light)
      dot(tile, px, py, highlight)
      dot(tile, px + 1, py, colors[family][4])
    }
    dot(tile, 3 + variant * 2, 7, light)
  } else if (family === 'forest-ground') {
    // Flat moss and leaf litter. Trees and bushes belong to the object layer.
    for (const [x, y] of [[2, 3], [8, 10]]) {
      const px = 2 + ((x + offset) % 10)
      rect(tile, px, y, 3, 1, light)
      dot(tile, px + 1, y - 1, colors[family][4])
      dot(tile, px + 2, y + 1, dark)
    }
    rect(tile, 3 + variant * 2, 7, 2, 1, highlight)
    dot(tile, 11 - variant, 13, dark)
  } else if (family === 'bridge') {
    // Broad deck boards work in either travel direction; only water-facing
    // overlays define sides. The deck is opaque, including its joints.
    for (const y of [7, 15]) rect(tile, 0, y, size, 1, dark)
    rect(tile, 4 + variant * 7, 0, 1, 7, dark)
    rect(tile, 11 - variant * 6, 8, 1, 7, dark)
    rect(tile, 2 + variant, 3, 4, 1, light)
    rect(tile, 8 - variant * 3, 11, 5, 1, light)
    dot(tile, 12 - variant * 6, 4, highlight)
  } else if (family === 'building-footprint') {
    // Quiet occupied-ground foundation; no wall, roof, door, or house silhouette.
    for (const [x, y, width, height] of [[2, 3, 4, 2], [9, 10, 4, 2], [5, 12, 3, 1]]) {
      const px = 1 + ((x + variant * 3) % 11)
      const py = 1 + ((y + variant) % 12)
      rect(tile, px, py, width, height, dark)
      rect(tile, px + 1, py, Math.max(1, width - 2), 1, light)
    }
    dot(tile, 4 + variant * 6, 6, highlight)
  } else if (family === 'sand') {
    // Sparse grains and tiny pebbles, with no shoreline or water cue.
    for (const [x, y] of [[2, 3], [10, 5], [6, 11], [13, 13]]) {
      const px = 1 + ((x + variant * 3) % 14)
      const py = 1 + ((y + variant * 2) % 14)
      dot(tile, px, py, dark)
      if ((x + y + variant) % 2 === 0) dot(tile, px + 1, py, light)
    }
    dot(tile, 4 + variant * 2, 8, highlight)
  } else if (family === 'cliff') {
    // Direction-neutral worn rock ground; cracks carry no ledge orientation.
    for (const [x, y] of [[2, 3], [9, 9]]) {
      const px = 1 + ((x + variant * 2) % 11)
      const py = 1 + ((y + variant) % 11)
      rect(tile, px, py, 3, 2, light)
      dot(tile, px + 1, py + 1, dark)
      dot(tile, px + 2, py + 2, dark)
    }
    dot(tile, 4 + variant * 5, 12, colors[family][4])
  } else {
    // Low, worn gravel patches: terrain texture, never an interactive boulder.
    for (const [x, y] of [[2, 3], [9, 9]]) {
      const px = x + variant % 2
      rect(tile, px, y, 4, 2, light)
      rect(tile, px + 1, y + 2, 4, 1, dark)
      rect(tile, px + 1, y, 2, 1, highlight)
    }
    dot(tile, 4 + variant, 12, dark)
  }
  return tile
}

function rotate(tile, turns) {
  const result = canvas(size, size)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let px = x
      let py = y
      for (let turn = 0; turn < turns; turn += 1) [px, py] = [size - 1 - py, px]
      dot(result, px, py, tile.pixels.subarray((y * size + x) * 4, (y * size + x) * 4 + 4))
    }
  }
  return result
}

function transitionTile(family, kind, direction) {
  const tile = canvas(size, size)
  if (family === 'bridge') {
    // Low edge, never a tall rail that would imply an object/collision.
    rect(tile, 0, 0, size, 1, colors.bridge[1])
    rect(tile, 0, 1, size, 1, colors.bridge[3])
    rect(tile, 0, 2, size, 1, colors.bridge[2])
    for (const x of [3, 11]) dot(tile, x, 1, colors.bridge[4])
    return rotate(tile, direction)
  }
  const outside = family === 'water' ? colors.path[1] : colors.grass[0]
  const rim = family === 'water' ? colors.path[0]
    : family === 'forest-ground' ? colors[family][4] : colors[family][1]
  const inside = colors[family][family === 'forest-ground' ? 0 : 2]
  if (kind === 'edge') {
    for (let x = 0; x < size; x += 1) {
      dot(tile, x, 0, outside)
      dot(tile, x, 1, rim)
      if (x % 5 !== 0) dot(tile, x, 2, inside)
    }
    return rotate(tile, direction)
  }
  // Author the NE corner, then rotate clockwise. Outer rounds a protruding
  // terrain corner; inner indents around a diagonal patch of neighboring land.
  for (let y = 0; y < 5; y += 1) {
    for (let distanceX = 0; distanceX < 5; distanceX += 1) {
      const distance = kind === 'outer' ? distanceX + y : Math.max(distanceX, y)
      const threshold = kind === 'outer' ? 4 : 1
      if (distance <= threshold) dot(tile, size - 1 - distanceX, y, outside)
      else if (distance === threshold + 1) dot(tile, size - 1 - distanceX, y, rim)
      else if (distance === threshold + 2) dot(tile, size - 1 - distanceX, y, inside)
    }
  }
  return rotate(tile, direction)
}

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, checksum])
}

function png(image) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(image.width, 0)
  header.writeUInt32BE(image.height, 4)
  header[8] = 8
  header[9] = 6 // RGBA, 8-bit, no interpolation or resampling.
  const scanlines = []
  for (let y = 0; y < image.height; y += 1) {
    scanlines.push(Buffer.from([0]), image.pixels.subarray(y * image.width * 4, (y + 1) * image.width * 4))
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(scanlines))), chunk('IEND', Buffer.alloc(0)),
  ])
}

function put(sheet, tile, column, row) {
  for (let y = 0; y < size; y += 1) {
    tile.pixels.copy(sheet.pixels, ((row * size + y) * sheet.width + column * size) * 4, y * size * 4, (y + 1) * size * 4)
  }
  return { x: column * size, y: row * size, width: size, height: size }
}

const base = canvas(columns * size, families.length * size)
const transitions = canvas(columns * size, (transitionFamilies.length * 3 + 1) * size)
const manifest = {
  version: 1, sourceTileSize: size, displayTileSize: 48, palette,
  atlases: {
    base: { url: '/art/pixel/terrain/terrain-atlas.png', width: base.width, height: base.height },
    transitions: { url: '/art/pixel/terrain/transition-atlas.png', width: transitions.width, height: transitions.height },
  },
  families: {},
}

for (const [row, family] of families.entries()) {
  const entry = { variants: [], transitions: {} }
  const count = variantCounts[family] ?? 4
  for (let variant = 0; variant < count; variant += 1) {
    entry.variants.push({ key: `terrain/${family}/base/variant-${variant}`, atlas: 'base', rect: put(base, baseTile(family, variant), variant, row) })
  }
  // Reserved cells remain opaque; they are not extra manifest variants.
  for (let column = count; column < columns; column += 1) put(base, baseTile(family, column % count), column, row)
  if (transitionFamilies.includes(family)) {
    const familyRow = transitionFamilies.indexOf(family) * 3
    for (const [kindIndex, kind] of ['edge', 'outer', 'inner'].entries()) {
      for (let direction = 0; direction < 4; direction += 1) {
        const name = (kind === 'edge' ? cardinals : corners)[direction]
        entry.transitions[`${kind}/${name}`] = {
          key: `terrain/${family}/${kind}/${name}`, atlas: 'transitions',
          rect: put(transitions, transitionTile(family, kind, direction), direction, familyRow + kindIndex),
        }
      }
    }
  }
  if (family === 'bridge') {
    for (const [direction, name] of cardinals.entries()) {
      entry.transitions[`edge/${name}`] = {
        key: `terrain/bridge/edge/${name}`, atlas: 'transitions',
        rect: put(transitions, transitionTile(family, 'edge', direction), direction, transitionFamilies.length * 3),
      }
    }
  }
  manifest.families[family] = entry
}

const art = new URL('public/art/pixel/terrain/', root)
const outputs = [
  [new URL('terrain-atlas.png', art), png(base)],
  [new URL('transition-atlas.png', art), png(transitions)],
  [new URL('src/components/village/pixelTileAtlas.json', root), Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)],
]
if (process.argv.includes('--check')) {
  for (const [path, expected] of outputs) {
    if (!readFileSync(path).equals(expected)) throw new Error(`Regenerate pixel assets: ${fileURLToPath(path)}`)
  }
  console.log('Both PNG atlases and the manifest match their deterministic source.')
} else {
  mkdirSync(art, { recursive: true })
  for (const [path, bytes] of outputs) writeFileSync(path, bytes)
  const entries = Object.values(manifest.families)
  console.log(`Generated ${entries.reduce((n, family) => n + family.variants.length, 0)} opaque base tiles and ${entries.reduce((n, family) => n + Object.keys(family.transitions).length, 0)} composable transition tiles in ${fileURLToPath(art)}`)
}
