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
