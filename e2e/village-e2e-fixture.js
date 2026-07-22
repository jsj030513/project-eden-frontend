export const FRONTEND_URL = 'http://localhost:5173'
export const API_URL = 'http://localhost:8080'

const usesConfiguredFixture = Boolean(process.env.EDEN_E2E_PASSWORD)
const runId = `${process.pid}-${Date.now()}`

export const FIXTURE_EMAIL = usesConfiguredFixture
  ? process.env.EDEN_E2E_EMAIL || 'village-polish-v8-fixture@local.test'
  : `village-contextual-${runId}@local.test`
export const FIXTURE_PASSWORD = process.env.EDEN_E2E_PASSWORD || 'Eden-Local-E2E-2026!'

function requireSuccess(response, operation) {
  if (response.ok()) return
  throw new Error(`${operation} failed: HTTP ${response.status()}`)
}

export async function provisionLocalFixture(request) {
  if (usesConfiguredFixture) return

  const signup = await request.post(`${API_URL}/api/users/signup`, {
    data: {
      email: FIXTURE_EMAIL,
      password: FIXTURE_PASSWORD,
      nickname: `ctx-${runId}`.slice(0, 20),
    },
  })
  requireSuccess(signup, 'fixture signup')

  const login = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD },
  })
  requireSuccess(login, 'fixture login')
  const loginBody = await login.json()
  const token = loginBody.accessToken || loginBody.token || loginBody.jwt
  if (!token) throw new Error('fixture login returned no access token')

  const headers = { Authorization: `Bearer ${token}` }
  const character = await request.post(`${API_URL}/api/characters`, {
    headers,
    data: {
      name: 'Eden',
      gender: 'NONE',
      hairStyle: 'PIXEL_CUT',
      hairColor: 'brown',
      outfit: 'ROBE',
      job: 'BEGINNER',
    },
  })
  requireSuccess(character, 'fixture character creation')

  for (const resource of ['/api/worlds', '/api/houses', '/api/inventories']) {
    const response = await request.post(`${API_URL}${resource}`, { headers })
    requireSuccess(response, `fixture ${resource} creation`)
  }

  const worldState = await request.get(`${API_URL}/api/worlds/me/state`, { headers })
  requireSuccess(worldState, 'fixture world-state bootstrap')
}
