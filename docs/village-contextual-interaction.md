# Village Contextual Interaction

## Single HUD Prompt

`VillagePage` reads the backend-ordered `availableInteractions` array and renders only the first available `TALK` or `INTERACT` item. It does not recreate the backend priority. The prompt is screen-space UI, uses a native button, and displays the backend `displayName` and `actionLabel`. Missing labels use centralized, non-crashing fallbacks.

Generic `INSPECT` remains a world-space tile interaction in `VillageScene`. Contextual tiles returned as `INTERACT` are therefore not duplicated as generic inspect buttons.

## Contextual Panels

- `FARM_PLOT_EMPTY`: explains the empty plot and offers `사진으로 기억 심기`. Opening Capture is mutation-free; after photo upload, 2-C2 submits the selected server target through the dedicated planting command.
- Crops: carrot, flower, mixed vegetable, tomato, and cabbage use asset-specific descriptions and have no harvest or economy action.
- Animals: default dog, cat, and bird use asset-specific descriptions and remain `INTERACT`, not `TALK`.
- `COMMUNITY_HOUSE`: opens an informational `커뮤니티 하우스` panel without friend, visit, or board behavior.
- Unknown category or asset values render a safe generic title and description.

## Panel Coordinator

The existing `VillagePage` coordinator now supports `INSPECT`, `DIALOGUE`, and `CONTEXTUAL`; App-level Capture remains `MEMORY_UPLOAD`. Opening a new panel clears the previous local panel. Capture entry clears Village panels, and returning from Capture does not restore them. A single Village-level Escape listener closes the active Village panel; the duplicate Scene listener was removed. App retains the separate Escape handler that owns the Capture page.

Selected `DIALOGUE` and `CONTEXTUAL` interactions are compared against refreshed server interactions by type, target ID, asset type, and coordinate. When the target leaves range, the related panel closes instead of being restored from stale state.

## Responsive Behavior

The shared prompt stays in the HUD safe area on the right side and does not cover the coarse-pointer joystick surface on the left. Contextual panels reuse the existing safe-area dialogue layout, remain inside the viewport, and keep both the primary and close controls reachable. Long labels are truncated inside the prompt without introducing horizontal page overflow.

## E2E Evidence

The local runtime on frontend port `5173` and backend port `8080` was exercised without response mocking.

- Existing Village evidence suite: 6 passed.
- Contextual interaction suite: 10 passed (9 browser scenarios plus 1 unknown/missing metadata fallback contract).
- Runtime categories verified: FARM, CROP, ANIMAL, COMMUNITY.
- Runtime assets verified: FARM_PLOT_EMPTY, FARM_CARROT, FARM_TOMATO, FARM_CABBAGE, DEFAULT_DOG, DEFAULT_CAT, DEFAULT_BIRD, COMMUNITY_HOUSE, and DEFAULT_NPC interactions.
- Empty-farm Capture entry produced zero planting, photo-upload, recognition, or world-change mutation requests before a photo was selected.
- Contextual range exit, panel mutual exclusion, contextual/dialogue/capture Escape behavior, and server-ordered single prompt passed.
- Touch emulation passed at 375×667, 390×844, and 430×932 with coarse pointer enabled, joystick movement, contextual panel visibility, no horizontal/vertical overflow, and no prompt/joystick overlap.

## 2-B2 Boundary

2-B2 did not add planting persistence, harvest/economy mechanics, animal persistence, community-house features, dialogue progression, a new Capture contract, or a frontend priority algorithm. Its deferred Capture return boundary is implemented and evidenced below as 2-B3.

## Capture Target Context Lifecycle

An empty-farm CTA passes an in-memory session context to `App`: interaction type, target ID, target asset type, category, coordinates, and display name. Capture exposes this context only as non-visual DOM metadata for UI/E2E coordination. Selecting a file does not add these fields to photo upload, recognition, planting, or world-change requests.

The context is cleared on successful completion, cancel, Escape, authentication reset, and the next general Capture entry. A canceled or completed contextual panel is never restored when Village renders again.

## Capture Success Flow

General Capture keeps the existing photo upload and recognition calls. A valid empty-farm target switches only the post-upload operation to `plant-memory`. `completeRecognizedMoment` is guarded against duplicate completion, performs one `fetchVillageData` operation, calculates at most one backend-backed reveal, clears the target context, and returns to Village. A transition guard prevents the normal Village-entry effect from repeating the same refetch. The refreshed world state—not an optimistic local edit—becomes the source for player position, placed crops, and interaction prompts.

## Capture Failure Flow

Photo-upload and recognition failures remain on Capture with the existing recovery UI and preserved target context. A local submission/retry lock prevents rapid duplicate calls. No reveal or Village refetch is produced for these failures. A world-state-only partial refresh failure preserves the last valid world state and server-approved player position. A full Village refresh failure falls back to the pre-capture snapshot and still completes one safe reveal without a second navigation.

## Capture Cancel Flow

Cancel or Escape clears Capture state and target context, returns directly to Village, and skips an unnecessary world refetch because the pre-capture state is still current. No inspect, dialogue, or contextual panel is restored. Reopening Capture from the general camera action starts with an empty target context.

## Refetch and Reveal Rules

- Successful recognized or explicitly retained UNKNOWN memory: one Village fetch, one world-state request when the aggregate fetch reaches optional resources, and one reveal.
- Capture cancel: zero additional world-state requests.
- Upload or recognition failure: zero Village/world-state refetches and zero reveals.
- Reveal temporarily suppresses interaction prompts; prompts are recalculated from the current server state after reveal finishes.
- Duplicate submit/completion callbacks cannot produce duplicate upload, refetch, navigation, or reveal operations.

## Capture Network Mutation Boundary

The empty-farm CTA itself performs zero photo, recognition, planting, and world-change mutations. General Capture records one photo upload plus one existing recognition request. Targeted planting records one photo upload plus one `plant-memory` request and zero direct recognition, seed-plant, or world-change requests. No path invokes `/api/seeds/plant`; the planting command body contains only `photoId`, `targetId`, `expectedX`, and `expectedY`.

## Capture Return E2E Evidence

- Capture return suite: 10 passed.
- Covered: target-context entry/cancel, deterministic success, upload failure, recognition failure, world-state partial failure, full Village refresh failure, UNKNOWN recovery, reveal-once behavior, and three responsive touch returns.
- Existing Village evidence: 6 passed.
- Contextual interaction evidence: 10 passed.
- Touch Capture return passed at 375×667, 390×844, and 430×932 with a reachable back control, joystick movement after return, no panel restoration, and no viewport overflow.

## E2E Fixture Isolation Limitation

Each E2E suite passes reliably when run separately, which is the official verification method for 2-B. The suites share one fixture account and its persisted player coordinates, so running them concurrently can cause position interference between suites. Fixture isolation is required before introducing a parallel aggregate E2E command and remains outside this step.

## Targeted Planting Capture Mode

`App` normalizes the Capture target before selecting a mode. `TARGETED_PLANTING` requires an `INTERACT` context with a positive `targetId`, integer `x/y`, `targetAssetType=FARM_PLOT_EMPTY`, and `category=FARM`. Missing or unsupported metadata safely resolves to `GENERAL_MEMORY`; it never creates a guessed target request.

- General: `POST /api/photos` → `POST /api/photos/{photoId}/recognize`.
- Targeted: `POST /api/photos` → `POST /api/worlds/me/plant-memory`.

The planting request deliberately excludes asset/category/display metadata, character/world IDs, and crop guesses. Backend target state and ownership remain authoritative.

## Plantable and Non-plantable Flow

For `plantingApplied=true`, the response must contain `recognition`, `cropAssetType`, and the targeted `worldChange`. The reveal uses that backend world change. One Village refresh then replaces the empty plot and exposes the server-provided crop interaction. The frontend never removes the plot or inserts a crop optimistically.

For `plantingApplied=false`, null `cropAssetType` and null `worldChange` are valid. The memory is treated as processed, no crop reveal is fabricated, one refresh keeps the empty plot authoritative, and the user sees a safe “심을 수 있는 작물을 찾지 못했어요” notice instead of an error/retry loop.

## Conflict Code UX

- `TARGET_ALREADY_PLANTED`: clear stale context, refresh once, return to the changed Village.
- `TARGET_CHANGED`: clear stale context, refresh once, and require a new interaction.
- `PHOTO_ALREADY_EXPRESSED`: clear context without automatic target switching or re-upload.
- `TARGET_OUT_OF_RANGE`: clear context, refresh once, and ask the player to approach again.
- 403/404: return safely without exposing ownership or filesystem details.
- Unknown terminal conflict metadata: use a generic planting completion message without crashing.

Terminal conflicts never restore the old empty-farm panel and never auto-retry.

## Retry Phase and Photo ID Reuse

Capture state records `uploadedPhotoId` and `failedOperation`.

- Upload failure retries the upload stage and does not call planting beforehand.
- Planting network/5xx failure retains target context and retries only `plant-memory`.
- A lost planting response retries the same `photoId`, `targetId`, and expected coordinates; it does not re-upload the file.
- Submit, retry, and completion locks keep one in-flight mutation and one reveal/refetch completion.

The browser test simulated response loss and verified one upload, two byte-equivalent planting commands, one final reveal, and one final world-state refresh.

## Target Context Lifecycle

The empty-farm CTA creates the context. It remains through upload and retryable planting failures. It is removed after plantable success, non-plantable success, cancel/Escape, terminal conflict, authentication reset, and every general Capture entry. Capture completion never restores the previous contextual panel.

## Targeted Planting E2E Evidence

`e2e/village-targeted-planting.spec.js` ran 13 tests successfully on 2026-07-23:

- exact request contract and network endpoint counts;
- plantable empty→crop refetch transition and crop panel;
- non-plantable null-safe return without reveal;
- general Capture regression;
- upload-stage retry;
- response-loss planting retry with photo ID reuse;
- all four conflict codes;
- 375×667, 390×844, and 430×932 touch returns;
- one unintercepted PostgreSQL-backed C1 runtime transition.

The actual runtime fixture was `village-contextual-30064-1784783547510@local.test`, player tile `(4,9)`, empty target `788` at `(3,9)`, photo `44`, recognition `31`, world change `822`, and crop object `822`. The response reported `plantingApplied=true` and `cropAssetType=FARM_FLOWER`; the browser showed one targeted reveal, refreshed world state once, removed the empty prompt, and opened the new 꽃밭 panel.

| Flow | Photo | Recognize | Plant-memory | Seed plant | World-state refetch |
|---|---:|---:|---:|---:|---:|
| General success | 1 | 1 | 0 | 0 | 1 |
| Targeted plantable | 1 | 0 | 1 | 0 | 1 |
| Targeted non-plantable | 1 | 0 | 1 | 0 | 1 |
| Upload failure before retry | 1 | 0 | 0 | 0 | 0 |
| Lost planting response + retry | 1 | 0 | 2 | 0 | 1 |

The complete frontend regression evidence is: Village 6 passed, Contextual 10 passed, Capture Return 10 passed, Targeted Planting 13 passed. `npm run lint` completed with zero warnings, `npm run build` completed successfully, and `git diff --check` passed after these browser suites.

## 2-C3 Boundary

Cross-process concurrency closure, suite-wide fixture isolation/parallel execution, and final multi-client idempotency evidence remain 2-C3 work. Crop harvest/economy, new retry frameworks, and reveal redesign remain outside 2-C2.

## 2-C3 fixture isolation policy

Every Village suite now creates a unique local fixture identity. The email contains the suite name, process id, millisecond timestamp, and UUID suffix. The nickname retains a UUID suffix even when a long suite name is truncated. Provisioning creates a new User, Character, World, House, and Inventory, then bootstraps world state. Persistent mutation scenarios that need an additional user create an additional fixture instead of reusing or resetting another suite's world.

No reset endpoint, direct database cleanup, hard-coded target id, crop id, WorldChange id, or player start coordinate is used. The fixture discovers unconsumed `FARM_PLOT_EMPTY` objects from world state, orders them by tile `y`, tile `x`, then object id, and chooses the first cardinally adjacent walkable tile. Movement to that tile uses the real authoritative move API.

## 2-C3 official E2E execution

`npm run test:e2e:village-all` invokes the four Village specs in one Playwright process. The official deterministic configuration remains one worker because the local backend/browser combination has a resource-sensitive touch-panel timeout under two-worker load. This is not used as a substitute for isolation: a two-worker proof ran 39 of 40 scenarios successfully with interleaved suites and no user, coordinate, or target collision; the remaining 430×932 inspect panel missed its 15-second visibility deadline. The same scenario passed in both complete one-worker runs.

Individual evidence:

- Village final evidence: 6/6.
- Contextual interaction: 10/10.
- Capture return: 10/10.
- Targeted planting: 14/14.

The targeted suite passed three consecutive complete runs after the unique nickname suffix defect was found and corrected. The aggregate 40-test suite then passed twice consecutively, in 4.0 minutes and 3.0 minutes, without account, coordinate, target, port, or browser-context residue.

## 2-C3 reload and mutation evidence

The real PostgreSQL-backed plantable flow created isolated Photo `57`, Recognition `44`, targeted WorldChange/crop `1985`, and replaced target projection `1916` at tile `(3,9)` with `FARM_FLOWER`. A Village reload showed the crop prompt, did not restore the empty prompt, and did not repeat the reveal. The test compares terrain, player position, NPC positions, animals, community house, template crops, and every unrelated placed object before and after. It also provisions another user and verifies that user's complete world state remains unchanged.

The real non-plantable flow created Photo `58` and Recognition `45` for `CAT`, retained empty target `1987`, and created no targeted WorldChange or crop. PostgreSQL recorded one Memory Classification and the matching ANIMAL Village Memory. Repeating the same Photo/target returned the same Recognition identity. Reload preserved the empty prompt and the complete world state matched its pre-command snapshot.

## 2-C3 final frontend status

The final isolated suite inventory is 40 scenarios: Village 6, Contextual 10, Capture Return 10, and Targeted Planting 14. Both official aggregate runs passed completely. `npm run lint` completed with zero warnings, `npm run build` completed successfully, and `git diff --check` passed.

Village MVP Polish 2차-C frontend target-aware Capture, safe terminal conflicts, response-loss retry, reload persistence, fixture isolation, and repeat-run evidence are complete. Crop harvest/economy, crop growth UI, new NPC progression, and new community functionality remain out of scope.
