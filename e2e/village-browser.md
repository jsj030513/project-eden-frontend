# Village browser tests

Run the existing 90-test live suite from the frontend directory:

```sh
EDEN_E2E_BACKEND_JAR=/path/to/world-api-backend.jar node e2e/village-browser.mjs
```

Playwright options are forwarded, for example:

```sh
node e2e/village-browser.mjs e2e/village-capture-return.spec.js --grep 'preserves target context'
```

The runner selects `village-live.config.js`. That config starts the existing
`backend-memory-interpretation` JAR on 127.0.0.1:18080 with isolated H2 and uploads,
and Vite on 127.0.0.1:5174. It sets both fixture API URL and Vite API base URL to
the same backend. Set `EDEN_E2E_BACKEND_JAR` to the intended World API Backend JAR.
The variable is required; no Backend artifact or localhost service is selected
as a fallback. The JAR and H2 dependency must already exist; no backend build
or source change is performed. Occupied ports fail startup instead of reusing an
unrelated backend.

Provisioning uses real signup and login, then sends the returned JWT in
`Authorization: Bearer <token>` through APIRequestContext. Browser tests log in
through the app, which stores the token under `projectEdenAccessToken` in
sessionStorage. World creation is not mocked. Existing scenario-specific photo,
recognition and failure routes remain in their specs.

The default localhost:8080 server is not a reliable Village backend target:
in the P3.5 reproduction signup/login/character creation succeeded there, but
world creation returned 401 despite a Bearer JWT. The Village-specific artifact
supports World API and accepts authenticated creation without relaxing security.

## P3.6 stale contract cleanup

The footprint spec verifies the current compact community-house contract in
`worldHubLayout.js`: three 48px tiles scaled by 0.72 and rounded to 104px,
with a 52px horizontal offset. DOM geometry uses the shared camera scale and
subtracts the world border to compare content coordinates. The house body is
half the full artwork height; interaction and collision checks remain intact.

Its BFS route fixture excludes canonical `npcPositions` as well as non-walkable
terrain. `WorldEcologyService.move` rejects occupied destinations with
`NPC_BLOCKED`; every fixture move must still return HTTP 200 and accepted=true.

The 30-second NPC stability test runs under the runner's Spring test profile.
`NpcCheckpointScheduler` is annotated `@Profile("!test")`, so canonical NPC
identities, positions and versions must remain stable in repeated state reads.
Rendered NPCs must match canonical state, remain visible and have no duplicate
identities. Movement concurrency, chunks, dialogue and logout cleanup assertions
remain. Production checkpoint cadence requires separate integration coverage
under a non-test profile; this browser test does not verify that cadence.

Mobile bridge visibility targets the six authoritative `.terrain-bridge` plank
tiles (including painted background and the entry plank in the viewport), as
P3's accepted hub test does. The legacy pond `.visual-bridge` decoration is
hidden by the current pixel hub presentation.
