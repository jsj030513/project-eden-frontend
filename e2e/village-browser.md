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
