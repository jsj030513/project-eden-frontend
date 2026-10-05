import { useEffect, useMemo, useState } from 'react'
import { PIXEL_TILE_ATLAS, lookupPixelTile, pixelTileStyle } from './pixelTileManifest'
import { tileToPixel } from './worldViewport'

export default function PixelTerrainLayer({ tiles }) {
  const [loaded, setLoaded] = useState({})
  useEffect(() => {
    let active = true
    const images = Object.entries(PIXEL_TILE_ATLAS.atlases).map(([name, atlas]) => {
      const image = new Image()
      image.onload = () => {
        // An incorrectly sized or failed atlas never covers the CSS fallback.
        if (active && image.naturalWidth === atlas.width && image.naturalHeight === atlas.height) {
          setLoaded((current) => ({ ...current, [name]: true }))
        }
      }
      image.onerror = () => { if (active) setLoaded((current) => ({ ...current, [name]: false })) }
      image.src = atlas.url
      return image
    })
    return () => {
      active = false
      for (const image of images) { image.onload = null; image.onerror = null }
    }
  }, [])

  const visuals = useMemo(() => tiles.flatMap((tile) => {
    const visual = lookupPixelTile(tile, { baseAvailable: loaded.base === true, transitionsAvailable: loaded.transitions === true })
    return visual ? [{ tile, visual, style: pixelTileStyle(visual) }] : []
  }), [tiles, loaded.base, loaded.transitions])

  return <div className="pixel-terrain" aria-hidden="true" data-rendered-count={visuals.length}>
    {visuals.map(({ tile, visual, style }) => <i
      key={`${tile.x}:${tile.y}`}
      className="pixel-terrain__tile"
      data-tile={`${tile.x}:${tile.y}`}
      data-family={visual.family}
      data-asset-key={visual.key}
      data-asset-mode={visual.mode}
      style={{ ...style, left: tileToPixel(tile.x), top: tileToPixel(tile.y) }}
    />)}
  </div>
}
