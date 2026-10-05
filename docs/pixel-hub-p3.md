Project Eden P3 hub coverage audit (before removing the runtime JPG)

Backend sources were read only. The actual `baseTerrainAt` method, `TerrainType`
and `WorldHubLayout` were compiled and evaluated in `/tmp/eden-p3-audit`; soil
rectangles and template placements were extracted from `seedTemplate`.
`e2e/fixtures/hub-template-v3.json` records source SHA-256 values, the resulting
map, object anchors and the checked-in outer templates. This is a fresh template
v3 fixture, not a snapshot of a user's existing database. Existing worlds can
contain later memories, moved animals and runtime NPC positions.

The hub bootstrap loops x=0..23, y=0..15: 384 cells, 24×16, 1152×768 logical
pixels at 48px per tile. Six 8×8 chunks cover the hub (chunkX=0..2, chunkY=0..1).
The enclosing world defaults to x=-8..31, y=-8..23 (40×32), not 24×16.

Before P3, the JPG is the first `.grass-tiles` CSS background, sized 1152×768,
no-repeat, positioned at `--world-origin-x/y`. For the expanded bounds this is
384px/384px. `.world-coordinate-layer` uses the same origin translation for
terrain and objects, followed by the existing camera transform.

Coverage decision: all 384 hub cells exist. GRASS 156, ROAD 33, SOIL 32 and
WATER 24 (245 cells) use P2 PNG art. FOREST 124, BUILDING 9 and BRIDGE 6
(139 cells) use the shared legacy CSS. The fresh hub creates no ROCK,
FLOWER_FIELD, BEACH or CLIFF cells. No ground coverage requires the JPG.

G=GRASS, R=ROAD, S=SOIL, W=WATER, B=BRIDGE, H=BUILDING, F=FOREST.

```text
00 FFFFFFFFFFFFFFFFFFFFFFFF
01 FFFFFFFFFFFFFFFFFFFFFFFF
02 FFGGGGGGGGGRGGGGGGGGGGFF
03 FFGGGGGGGGGRGHHHGGGGGGFF
04 FFGSSSSGGGGRGHHHGGGGGGFF
05 FFGSSSSGGGGRGHHHGGGGGGFF
06 FFGGGGGGGGGRGGRGGGGGGGFF
07 FFRRRRRRRRRRRRRRRRRRRRFF
08 FFGGGGGGGGGRGGGGGGGGGGFF
09 FFSSSSGGGGGRGGGGGGGGGGFF
10 FFSSSSGSSSSRGGGGGGGGGGFF
11 FFGGGGGSSSSRGGGGGWWWWWWG
12 FFSSSSGGGGGRGGGGGWWWWWWG
13 FFSSSSGGGGGRGGGGGBBBBBBR
14 FFFFFFFFFFFFFFFFFWWWWWWG
15 FFFFFFFFFFFFFFFFFWWWWWWG
```

| Feature | Authoritative coverage | Frontend/JPG coverage and P3 decision |
| --- | --- | --- |
| House | COMMUNITY_HOUSE at tile (14,6), BUILDING footprint x13..15/y3..5; approach (14,7) | Existing CSS object is visible independently of JPG. Preserve dimensions, anchor and interaction. |
| Plaza/fountain | PLAZA object at (11,7) | Existing CSS fountain is hidden with opacity:0 because JPG drew it. Restore this existing object; create no new object/interaction. |
| Crops/farms | SOIL rectangles (2,9,4,2), (2,12,4,2), (3,4,4,2), (7,10,4,2); 8 carrots, 8 flowers, 4 tomatoes, 4 cabbages, 1 empty plot | Keep object/terrain layers separate. Do not restore fixed `.visual-farm` rectangles. |
| Bridge | Six BRIDGE cells x17..22/y13, entry x16/exit x23 | Existing common plank CSS can draw the bridge. The fixed `.visual-bridge` is inside disabled hub-decoration; do not enable the old pond/bridge composite. |
| Pond | 24 WATER cells; bridge removes 6 water cells, east bank x23 remains land | Follow terrain outline. Painted curved shore, lotus and reeds are not authoritative. |
| NPCs/animals | Four NPC templates, dog, cat, two birds (35 total template objects including crops and landmarks) | Preserve projection/object renderer and event layers. Fixture shows template anchors, not live simulation. |
| Trees/flower clusters | Hub FOREST is terrain; planted TREE_GROVE/FLOWER_CLUSTER may exist later; outer template decorations are data-backed | Fixed hub tree/flower decorations are already hidden. Do not re-enable these JPG-layout coordinates. |
| Fence/lamp/sign/bench/garden/mailbox | No corresponding hub bootstrap placement | Present in JPG and/or the disabled fixed decoration group. Record as future pure decoration candidates; no game object added. |
| Pond plants/shore rocks/ripples | No detailed hub bootstrap placement | JPG-only/disabled decoration details will disappear. Water texture and edges remain. |
| Ground tufts/leaves/stones | Frontend `.ground-flora`, fixed CSS positions | Not terrain-aware; suppress on data-backed worlds so they cannot float on water or duplicate outer decor. Leave the no-data landing preview alone. |

Classification: house/crops/NPCs/animals are A (backend object); some also D
(interaction). PLAZA is A/E (visual representation of an existing record).
Bridge/building/water collision belongs to terrain, not decoration. The dormant
hub-decoration and ground-flora are B/E. Fine painted foliage, paths' exact
curves, shore outline and miscellaneous furniture are C (JPG-only detail).

Implemented minimum removal: the runtime JPG CSS layer is removed and the
asset file is retained. The common terrain fallback is opaque and negative tile
coordinates paint after the existing world-origin translation. Existing PLAZA
visibility is restored and ungrounded fixed flora is suppressed on authoritative
worlds. P2 assets/resolver/manifest, backend semantics, world generation and
camera are unchanged. No new art was created.

Both center and outer use `terrainTiles → resolveWorldTiles → viewport filter
→ PixelTerrainLayer → lookupPixelTile/pixelTileManifest`. Neighbor resolution
runs before viewport filtering. Unsupported families retain the same opaque
`.persistent-terrain` fallback; the renderer has no hub-specific mapping.
Terrain and object layers keep `pointer-events:none`, with the original tile
interaction buttons and their 48px hitboxes above them.

Known limits / P4-P5 candidates: the hub generator has a two-tile FOREST rim
and its road ends at that rim, while outer templates have straight connector
bands. The common renderer removes the JPEG rectangle, but it cannot turn these
real terrain discontinuities into connected roads without changing authoritative
data. Forest/flower fallback remains CSS rather than new PNGs. Decorative
furniture, detailed trees/foliage and the painted pond silhouette are not rebuilt.
Existing fractional camera zoom/pixel alignment remains outside P3.
The existing compact house sprite is smaller than the 3×3 BUILDING footprint,
so part of its dark CSS footprint remains visible. Crop sprites retain their
existing anchor/vertical offset rather than being repositioned to fit the art.

Verification on 2026-10-01 used the existing P3 worktree without resetting the
earlier work. The saved pre-P3 snapshot in `/tmp/eden-p3-baseline`
contains the original JPG CSS; its hashes match `/tmp/eden-p3-baseline.json`.
All four backend source hashes in the fixture still match. Re-running the
read-only extraction in `/tmp/eden-p3-audit/extract.py` reproduced all fixture
fields, including 384 terrain cells and the 35 template object anchors. Fixture
object IDs are synthetic; live database IDs and later NPC/animal positions are
not asserted by this code-derived fixture.

Validation results:

| Suite | Result |
| --- | --- |
| world-tile-resolver | 20/20 |
| pixel-tile-manifest + pixel-terrain (P2) | 22/22 |
| hub-pixel (P3) | 17/17 |
| village-joystick (mouse/touch, portrait/landscape) | 4/4 |
| village-phase3b-chunk-cache + village-phase3c-regions | 16/16 |
| lint / build / git diff --check | passed |

The browser suites run real Chromium against deterministic API fixtures. They
exercise keyboard movement, blocked WATER, BRIDGE traversal, camera tracking,
tile click/INSPECT, joystick, memory planting and Village return.
They do not verify live backend photo inference or persistence.

The additional existing Village suites were attempted against localhost:8080:
90 tests, 1 passed, 20 failed in shared fixture setup, 69 did not run. Every
failure was `fixture /api/worlds creation failed: HTTP 401` before a browser
scenario ran. No backend/authentication change was made to bypass this blocker.
Details: `/tmp/eden-p3-verification/village-report.json`.

Before screenshots are preserved under `/tmp/eden-p3-before/` (P2 JPG).
Fresh P3 screenshots are under `/tmp/eden-p3-verification/after/`:
`desktop-center.png` (1280×720), `portrait-center.png` (375×667),
`landscape-center.png` (667×375), `north.png`, `south.png`, `west.png`,
`east.png`, and `pond-bridge.png`. Edge/pond captures use 1280×720.
The same audited template supplies both phases; these are not live DB captures.

Visual review: all four JPEG boundaries are gone, with no uncovered ground.
Road/soil/water now share the outer atlas texture and pixel density. The pond
is rectangular according to authoritative WATER, with six visible bridge
planks/tiles. The crossroad, four farm rectangles, house and existing fountain
preserve the central composition. North/south/west/east still show the actual
FOREST rim and discontinuous roads; smoothing that layout is a P4/P5 backend
candidate, not a renderer correction. The CSS forest/flower colors and simpler
foliage remain a visual limitation shared by center and outer.
