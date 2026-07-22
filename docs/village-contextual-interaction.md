# Village Contextual Interaction

## Single HUD Prompt

`VillagePage` reads the backend-ordered `availableInteractions` array and renders only the first available `TALK` or `INTERACT` item. It does not recreate the backend priority. The prompt is screen-space UI, uses a native button, and displays the backend `displayName` and `actionLabel`. Missing labels use centralized, non-crashing fallbacks.

Generic `INSPECT` remains a world-space tile interaction in `VillageScene`. Contextual tiles returned as `INTERACT` are therefore not duplicated as generic inspect buttons.

## Contextual Panels

- `FARM_PLOT_EMPTY`: explains the empty plot and offers `사진으로 기억 심기`. Its target metadata remains selected until Capture entry, but no planting target is submitted or persisted in 2-B2.
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

The existing photo upload and recognition calls remain authoritative. `completeRecognizedMoment` is guarded against duplicate completion, performs one `fetchVillageData` operation, calculates one reveal, clears the target context, and returns to Village. A transition guard prevents the normal Village-entry effect from repeating the same refetch. The refreshed world state becomes the source for player position and interaction prompts.

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

The empty-farm CTA itself performs zero photo, recognition, planting, and world-change mutations. The deterministic success E2E records exactly one photo upload and one recognition request. No 2-B3 path invokes `/api/seeds/plant` or adds a target field to existing request bodies.

## Capture Return E2E Evidence

- Capture return suite: 10 passed.
- Covered: target-context entry/cancel, deterministic success, upload failure, recognition failure, world-state partial failure, full Village refresh failure, UNKNOWN recovery, reveal-once behavior, and three responsive touch returns.
- Existing Village evidence: 6 passed.
- Contextual interaction evidence: 10 passed.
- Touch Capture return passed at 375×667, 390×844, and 430×932 with a reachable back control, joystick movement after return, no panel restoration, and no viewport overflow.

## E2E Fixture Isolation Limitation

Each E2E suite passes reliably when run separately, which is the official verification method for 2-B. The suites share one fixture account and its persisted player coordinates, so running them concurrently can cause position interference between suites. Fixture isolation is required before introducing a parallel aggregate E2E command and remains outside this step.

## 2-B3 Out of Scope

Target-aware planting persistence, planting APIs, Capture request schema changes, crop harvest/economy, new retry frameworks, and reveal design changes remain out of scope.
