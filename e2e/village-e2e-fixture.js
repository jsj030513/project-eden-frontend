import { randomUUID } from 'node:crypto'

export const FRONTEND_URL = 'http://localhost:5173'
export const API_URL = 'http://localhost:8080'

const DEFAULT_PASSWORD = process.env.EDEN_E2E_PASSWORD || 'Eden-Local-E2E-2026!'

function safeSuiteName(value) {
  return String(value || 'suite')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'suite'
}

export function createE2EFixture(suiteName) {
  const normalizedSuite = safeSuiteName(suiteName)
  const runId = `${process.pid}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`
  return Object.freeze({
    suiteName: normalizedSuite,
    runId,
    email: `village-${normalizedSuite}-${runId}@local.test`,
    password: DEFAULT_PASSWORD,
    nickname: `${normalizedSuite.slice(0, 12)}-${randomUUID().slice(0, 6)}`,
  })
}

const defaultFixture = createE2EFixture('legacy')
export const FIXTURE_EMAIL = defaultFixture.email
export const FIXTURE_PASSWORD = defaultFixture.password

function requireSuccess(response, operation) {
  if (response.ok()) return
  throw new Error(`${operation} failed: HTTP ${response.status()}`)
}

export async function provisionLocalFixture(request, fixture = defaultFixture) {
  const signup = await request.post(`${API_URL}/api/users/signup`, {
    data: {
      email: fixture.email,
      password: fixture.password,
      nickname: fixture.nickname,
    },
  })
  requireSuccess(signup, 'fixture signup')

  const login = await request.post(`${API_URL}/api/auth/login`, {
    data: { email: fixture.email, password: fixture.password },
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
  return {
    ...fixture,
    token,
    worldState: await worldState.json(),
  }
}

export function findEmptyPlotTarget(state) {
  const candidates = (state?.placedObjects ?? [])
    .filter((object) => object.assetType === 'FARM_PLOT_EMPTY')
    .map((object) => ({ id: object.id, x: object.x / 48, y: object.y / 48 }))
    .sort((left, right) => left.y - right.y || left.x - right.x || left.id - right.id)
  const walkable = new Set((state?.terrainTiles ?? [])
    .filter((tile) => tile.walkable)
    .map((tile) => `${tile.x}:${tile.y}`))

  for (const candidate of candidates) {
    const adjacent = [
      { x: candidate.x + 1, y: candidate.y },
      { x: candidate.x - 1, y: candidate.y },
      { x: candidate.x, y: candidate.y + 1 },
      { x: candidate.x, y: candidate.y - 1 },
    ].find((position) => walkable.has(`${position.x}:${position.y}`))
    if (adjacent) return { ...candidate, adjacent }
  }
  throw new Error('Fixture world has no unconsumed FARM_PLOT_EMPTY with a walkable adjacent tile')
}
