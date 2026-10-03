import { defineConfig } from '@playwright/test'
import base from '../playwright.config.js'

// Keep the fixture's APIRequestContext and the browser on the same backend.
// Port 8080 may belong to the older backend checkout, which has no World API.
const apiURL = 'http://127.0.0.1:18080'
const frontendURL = 'http://127.0.0.1:5174'
process.env.EDEN_E2E_API_URL = apiURL
process.env.EDEN_E2E_FRONTEND_URL = frontendURL

export default defineConfig({
  ...base,
  testDir: '.',
  testMatch: [
    'village-final-evidence.spec.js',
    'village-contextual-interaction.spec.js',
    'village-capture-return.spec.js',
    'village-targeted-planting.spec.js',
    'village-npc-dialogue.spec.js',
    'village-community-animal.spec.js',
    'village-phase3a-viewport.spec.js',
    'village-phase3b-footprint.spec.js',
    'village-phase3c-journey.spec.js',
    'village-phase3c-closure.spec.js',
    'village-phase4a1-npc.spec.js',
    'village-hydration-race.spec.js',
  ],
  use: { ...base.use, baseURL: frontendURL },
  webServer: [
    {
      command: 'node e2e/start-village-backend.mjs',
      cwd: new URL('..', import.meta.url).pathname,
      url: `${apiURL}/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
      cwd: new URL('..', import.meta.url).pathname,
      env: { VITE_API_BASE_URL: apiURL },
      url: frontendURL,
      reuseExistingServer: false,
      timeout: 30_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    },
  ],
})
