import { apiJson, setAccessToken } from './httpClient'

function extractLoginToken(response) {
  return response?.accessToken || response?.token || response?.jwt || null
}

function logLoginTokenDiagnostics(token) {
  if (!import.meta.env.DEV) return

  console.info('Project Eden login token check', {
    hasAccessToken: Boolean(token),
    tokenParts: token ? token.split('.').length : 0,
    tokenLength: token?.length ?? 0,
  })
}

export async function signup({ email, password, nickname }) {
  return apiJson('/api/users/signup', {
    method: 'POST',
    body: { email, password, nickname },
  })
}

export async function login({ email, password }) {
  const response = await apiJson('/api/auth/login', {
    method: 'POST',
    body: { email, password },
  })
  const accessToken = setAccessToken(extractLoginToken(response))

  logLoginTokenDiagnostics(accessToken)

  if (!accessToken || accessToken.split('.').length !== 3) {
    throw new Error('마을로 들어가는 열쇠를 다시 확인해주세요.')
  }

  return {
    ...response,
    accessToken,
  }
}

export function getMe() {
  return apiJson('/api/users/me')
}
