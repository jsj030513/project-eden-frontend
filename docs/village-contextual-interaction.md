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

## Template NPC dialogue architecture

Village template dialogue now has one canonical renderer, `NpcDialogue.jsx`, and one case-safe pure script module, `npcDialogueScript.js`. The former conflicting lowercase `npcDialogue.js` path was removed. `VillagePage` opens a DIALOGUE panel only from the first server-ordered `TALK` entry in `availableInteractions`; it does not calculate pixel distance or manufacture a template-NPC interaction locally.

The official Village roles are:

- `DEFAULT_NPC_GUIDE` → 마을 안내자: movement, nearby interaction, and memory guidance.
- `DEFAULT_NPC_GARDENER` → 정원 관리인: empty plots and supported memory planting.
- `DEFAULT_NPC_MEMORY_KEEPER` → 기억 보관인: persistent memories and world refresh.
- `DEFAULT_NPC_ANIMAL_CARETAKER` → 동물 돌봄이: nearby default animal inspection.

Each read-only script has three session-local lines. Unknown assets use a two-line generic fallback instead of crashing. Next advances through a clamped line index; the final action is 대화 마치기. Close, Escape, server-authoritative TALK disappearance after range exit, NPC switching, another panel, Capture entry, refresh, or unmount resets the index. Reopening always starts at the first line.

## Legacy NPC boundary

The fixed-coordinate “모아” prompt, world bubble, and parallel dialogue panel are no longer rendered in the Village. The legacy backend API and its entities remain untouched for compatibility, but template placed-object ids are never sent to `/api/npcs/{id}/dialogue` and are never persisted as `NpcMemory` identities. Template dialogue open, Next, and Close are mutation-free.

## Template dialogue panel coordination

DIALOGUE uses the existing single `activePanel` coordinator with INSPECT and CONTEXTUAL. Opening one clears the others. Capture first closes the active Village panel and does not restore it on return. When the selected server interaction disappears, the panel closes and its session state resets. The dialogue region exposes the NPC name as a heading, accessible panel and close labels, keyboard-focusable actions, and Escape behavior.

## Template NPC E2E evidence

`e2e/village-npc-dialogue.spec.js` completed 9/9 scenarios:

- pure resolver coverage for all four assets, generic fallback, index clamp, and Next/Close labels;
- complete ordered sessions for all four template NPCs with correct names and zero dialogue/photo/seed/world mutations;
- Escape reset, NPC switching, server-authoritative range exit, and first-line restart;
- DIALOGUE/CONTEXTUAL/Capture mutual exclusion with no stale restoration;
- refresh without session restoration while authoritative TALK remains available;
- complete touch dialogue at 375×667, 390×844, and 430×932.

All three mobile runs kept the panel within the viewport, kept the dynamic joystick pad visually inactive behind the modal dialogue, avoided action-bar overlap and document overflow, and exposed every Next/Close control. The aggregate command then completed all 49 Village, Contextual, Capture, Planting, and NPC scenarios in 3.2 minutes. Individual evidence remained Village 6/6, Contextual 10/10, Capture 10/10, Planting 14/14, and NPC 9/9.

## D1 closure boundary before D2

At the D1 closure point, the Community memory summary and richer animal contextual work had not started. D1 added no NPC affinity, quest, reward, economy, generated dialogue, persistent conversation progress, template/legacy identity mapping, media endpoint, or backend dialogue mutation.

## Community recent history summary

The existing `villageState.history` payload is the only Community source. `App` already retrieves it as part of the existing Village aggregate load, so opening the Community panel performs no new fetch. The client consumes the real fields `historyType`, `category`, `changeType`, `message`, and `createdAt`; it does not invent a title or asset value that the response does not contain.

`normalizeVillageHistory` rejects non-arrays, null items, objects without a non-blank message, and malformed timestamps without throwing. `selectRecentVillageHistory` sorts valid timestamps newest-first, preserves the original order for ties, keeps duplicate identifiers safe by including stable source position in the render key, and returns at most three entries. Entries without a valid timestamp remain readable without a fabricated date. Empty or wholly invalid input renders:

> 아직 마을에 기록된 기억이 없어요.<br>
> 사진으로 기억을 남기면 이곳에서 다시 볼 수 있어요.

Ownership is inherited from the authenticated `/api/village/history` contract. The E2E fixture created NATURE history for the current account and ANIMAL history for another isolated account, then verified that the Community summary showed only the current user's latest three messages.

## Read-only animal contextual copy

The contextual resolver owns one stable copy mapping:

- `DEFAULT_DOG` — 강아지: “마을을 지켜보며 조용히 쉬고 있는 강아지예요.”
- `DEFAULT_CAT` — 고양이: “따뜻한 햇볕 아래에서 편안히 쉬고 있는 고양이예요.”
- `DEFAULT_BIRD` — 새: “마을의 작은 소리를 들으며 주변을 바라보는 새예요.”

Unknown future ANIMAL metadata uses the generic “동물 친구” fallback. These panels expose only their accessible heading, description, and labelled Close action. They do not promise feeding, naming, following, affinity, rewards, or any mutation.

## Community and animal panel coordination

Community and animal interactions reuse the single `activePanel` coordinator. Closing with the button or Escape returns focus to the originating HUD prompt when it remains connected, otherwise to the keyboard-focusable Village stage. Server-authoritative range disappearance closes the panel; re-entry starts a fresh session. Community→Crop, Community→Capture, Animal→NPC TALK, and NPC/Animal switching leave one panel and no stale history or dialogue state.

The Community list is a semantic heading plus ordered list. Long messages wrap safely, the panel retains its existing max-height scrolling boundary, and its date column collapses below the message at narrow widths. Capture entry clears the current panel and never restores it on return.

## D2 network and responsive evidence

`e2e/village-community-animal.spec.js` completed 9/9 scenarios. It covers pure malformed/latest/duplicate helpers, populated history, empty history, maximum-three/latest ordering, user isolation, Community Escape/range/re-entry, all three animal copies, read-only mutation evidence, cross-panel transitions, focus return, and three mobile touch contexts.

Community/Animal open and close produced zero Photo, planting, world-change, seed, NPC-dialogue, or other mutation POSTs. Existing movement POST and world-state/history GET requests remain allowed. No Community-specific request or endpoint was introduced.

| Viewport | Community | Animal | Overflow | Safe area |
|---|---|---|---|---|
| 375×667 | 3 records, Close reachable | Dog prompt/panel/Escape | none | pass |
| 390×844 | 3 records, Close reachable | Cat prompt/panel/Escape | none | pass |
| 430×932 | 3 records, Close reachable | Bird prompt/panel/Escape | none | pass |

Each context used `hasTouch=true`, `isMobile=true`, and device scale factor `2`; coarse pointer, hover-none, and positive touch-point assertions passed. Physical iPhone Safari was not tested.

## D2 regression evidence

Individual Playwright results were Village 6/6, Contextual 10/10, Capture 10/10, Targeted Planting 14/14, Template NPC 9/9, and Community/Animal 9/9. The final aggregate command includes all six specs and completed 58/58 in 4.3 minutes. `npm run lint` and `npm run build` passed, and frontend/backend `git diff --check` passed.

## 2-D3 boundary

D2 adds no Community interior, full history page, edit/delete/share/comment action, animal mutation, affinity, feeding, naming, media, quest, reward, generated dialogue, new API, or persistence. These remain outside the read-only closure and no 2-D3 implementation has started.

## 2-D3 final integration evidence

D3 added no product feature, API, persistence, or migration. It closed the
remaining evidence gap with one explicit animal Escape/range-exit/re-entry
scenario and runtime page-error/React-warning guards in the D1 and D2 browser
suites. All six official Village specs now run without file-level serial mode.
The two D specs
also passed together with two Playwright workers: 19/19 in 2.1 minutes, with
no fixture identity, coordinate, target, or panel-state collision.

The individual final results were:

- Village final evidence: 6/6.
- Contextual interaction: 10/10.
- Capture return: 10/10.
- Targeted planting: 14/14.
- Template NPC dialogue: 9/9.
- Community/Animal: 10/10.

`npm run test:e2e:village-all` therefore contains 59 scenarios. It passed
twice consecutively with one official worker, in 5.4 and 5.9 minutes.
`npm run lint` completed with zero warnings, `npm run build` completed
successfully, and `git diff --check` passed.

## D3 NPC, Community, Animal, and panel closure

All four template NPCs completed their three-line local sessions with Next,
final Close, Escape reset, authoritative range exit, target switching, refresh
reset, one dialogue panel, and zero dialogue/photo/planting/world mutations.
The legacy fixed “모아” Village prompt remained absent.

Community history retained newest-first ordering, a maximum of three,
authenticated-user isolation, malformed-input safety, and the explicit empty
state. Dog, Cat, and Bird retained distinct read-only copy and each proved
Escape, authoritative range exit, and re-entry. The combined suite
covered Community→Capture, Community→Crop, Animal→NPC, NPC→Animal, and
NPC→Capture. Every transition closed the previous panel and did not restore
stale dialogue/history state after Capture.

The frontend continues to consume the first available server interaction
without recalculating priority. Backend evidence confirms
`TALK > INTERACT > INSPECT` and deterministic tie ordering.

## D3 responsive, accessibility, console, and network matrix

Chromium mobile contexts at 375×667, 390×844, and 430×932 used
`hasTouch=true`, `isMobile=true`, device scale factor `2`, coarse pointer,
hover-none, and positive touch points. NPC dialogue, Community history,
Dog/Cat/Bird contextual panels, and Capture transitions remained within each
viewport with reachable labelled controls and no document overflow. Physical
iPhone Safari was not tested.

Dialogue/contextual regions expose accessible names and headings. Next/Close
buttons are labelled; Escape and trigger/root focus return passed. The D1/D2
runtime guards observed no uncaught page error, React key/duplicate/hydration
warning, module-resolution warning, or accessibility runtime warning. The
case-sensitive import remains exactly `NpcDialogue.jsx` →
`npcDialogueScript.js`.

Opening or advancing NPC, Community, and Animal panels produced no dialogue,
Photo, planting, seed, or world-change mutation POST. World-state/history GET
and authoritative movement POST remained allowed. Capture mutations occur only
after an explicit Capture transition and are covered separately by the Capture
and Planting suites.

## D3 reproducibility and distribution gate

The pre-commit audit found that `npcDialogueScript.js`,
`village-npc-dialogue.spec.js`, and `village-community-animal.spec.js` were
untracked even though they are required D files. The final D review explicitly
includes those files with the tracked dialogue, contextual-interaction, E2E,
script, styling, and documentation changes.

Earlier required infrastructure, including `useCharacterMovement.js` and the
backend terrain/world-state source group, remains owned by previous phases and
is not folded into the D commits. The current complete dirty worktree therefore
still has a broader clean-checkout blocker even though the D-owned files
themselves are captured. No push is performed as part of this closure.
