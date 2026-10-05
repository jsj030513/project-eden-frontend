Project Eden P2 terrain art

The PNGs are original, hand-authored pixel motifs and palettes encoded by
`scripts/generate-pixel-terrain.mjs`. No external art, game sprites or image
generation dependencies are used. Regenerate with `node scripts/generate-pixel-terrain.mjs`;
verify reproducibility without writing files with the same command plus `--check`.

The generator produces `public/art/pixel/terrain/terrain-atlas.png` (64×80)
and `transition-atlas.png` (64×144), plus `pixelTileAtlas.json` beside the resolver.
Each cell is 16×16. Twenty opaque base cells provide four variants for each of
grass, path, soil, water and rock-ground. Thirty-six transparent overlays provide
four cardinal edges, four outer corners and four inner corners for each of
path, soil and water. The overlays always sit over an opaque base. All other
terrain families retain their existing CSS and hub artwork.

Palette (base/shadow/light/highlight):

| Family | Four source colors |
| --- | --- |
| grass | #789456, #6d884e, #89a461, #a0b572 |
| path | #baa078, #a18a66, #cbb18a, #dcc399 |
| soil | #896344, #755439, #9e7851, #b28a60 |
| water | #588e90, #4b7f84, #6b9f9d, #85b3aa |
| rock-ground | #938c7a, #7c786c, #aaa18a, #bcb29b |

Path and soil rims reuse the grass base color. Water banks reuse two path colors.
Soil includes furrows only; rock-ground includes low gravel marks only. Trees,
crops, fences, rocks with interactions, foam and animated water are outside P2.

The P1 resolver remains unchanged. `pixelTileManifest.js` resolves its family,
variantIndex and boundary masks into named atlas rectangles and integer CSS
background positions. The P1 coordinate hash chooses the actual base art.
N/E/S/W use bits 1/2/4/8; NE/SE/SW/NW use bits 1/2/4/8 in the diagonal mask.
Two adjacent cardinal boundaries select an outer corner. A diagonal boundary
with neither adjacent cardinal boundary selects an inner corner. Composition
covers all 256 input combinations for road, soil and water without generating
256 sprites per family. Road/soil grass rims apply only against grass,
flower-ground and forest-ground; water banks apply against known land except
bridges. These are visual rules, with no change to terrain semantics or collision.

The manifest retains `terrain/<family>/...` keys so later water subtypes and
seasonal art can be added without changing world data. P2 always uses its base
palette; it does not implement ocean/depth/season selection.

`PixelTerrainLayer` checks the two images load with the declared dimensions.
Loaded art is rendered in an opaque, pointer-events:none sibling above the
unchanged `.persistent-terrain` fallback. A failed transition atlas or unsupported
mask uses the selected family base. A failed base atlas or unsupported family
renders no overlay, exposing the existing CSS. The JPG remains untouched below.
This extra layer adds at most one noninteractive DOM node per visible P2 tile;
the existing viewport culling still applies. The new layer permits overflow at
its local origin so negative world coordinates remain visible after the shared
world-origin translation. The existing world/viewport performs outer clipping.
Terrain resolution is memoized
independently of camera-window changes.

Camera follow-up: source cells are enlarged exactly 3× to 48 logical pixels with
`image-rendering:pixelated`. The unchanged camera subsequently scales by 1.1,
0.84 or 0.94, producing 3.3, 2.52 or 2.82 CSS pixels per source pixel. Chromium
screenshots at 1280×720, 375×667 and 667×375 retain legible pixel motifs, but
uneven pixel widths and fine tile-boundary lines can be seen. This is not strict
device-pixel alignment. Keep camera zoom and fractional RAF coordinates unchanged
in P2; evaluate pixel snapping and integer effective device scale in a separate
camera task, including high-DPI and moving-camera captures.

`e2e/pixel-terrain.spec.js` uses a deterministic, mocked world containing every
P2 terrain, a water notch, isolated road and retained P1 terrains. It captures
`before-p1-fallback.png` with both new PNGs blocked, then `after-p2.png` with art
loaded. The before image is the unchanged P1 fallback rendering in the P2 app,
not a checkout of an older commit. Both images are actual Chromium screenshots;
the fixture does not exercise a live backend or inference service. Use Playwright's
`--output=/tmp/eden-p2-visual-results` to keep screenshots outside the repository.
