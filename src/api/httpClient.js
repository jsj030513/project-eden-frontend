const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'
const TOKEN_KEY = 'projectEdenAccessToken'
const AUTH_EXPIRED_MESSAGE = '마을로 이어지는 시간이 지나 다시 문을 열어야 합니다.'

export class ApiError extends Error {
  constructor(message, { status, type, details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.type = type
    this.details = details
  }
}

export function normalizeAccessToken(value) {
  if (!value) return null

  let token = String(value).trim()

  try {
    const parsed = JSON.parse(token)

    if (typeof parsed === 'string') {
      token = parsed
    } else if (parsed && typeof parsed === 'object') {
      token = parsed.accessToken || parsed.token || parsed.jwt || ''
    }
  } catch {
    // Plain token.
  }

  token = String(token).replace(/^Bearer\s+/i, '').trim()

  if (!token || token === 'undefined' || token === 'null' || token === '[object Object]') {
    return null
  }

  return token
}

export function getAccessToken() {
  const rawToken = window.sessionStorage.getItem(TOKEN_KEY)
  const token = normalizeAccessToken(rawToken)

  if (token && rawToken !== token) {
    window.sessionStorage.setItem(TOKEN_KEY, token)
  }

  return token
}

export function setAccessToken(token) {
  const normalizedToken = normalizeAccessToken(token)

  if (!normalizedToken) {
    window.sessionStorage.removeItem(TOKEN_KEY)
    return null
  }

  window.sessionStorage.setItem(TOKEN_KEY, normalizedToken)
  return normalizedToken
}

export function clearAccessToken() {
  window.sessionStorage.removeItem(TOKEN_KEY)
}

function isAuthEndpoint(path) {
  return path.startsWith('/api/auth/') || path.startsWith('/api/users/signup')
}

function warnUnauthorized({ path, method, hasToken, status }) {
  if (!import.meta.env.DEV) return

  console.warn('Project Eden API returned 401', {
    url: path,
    method,
    hasToken,
    status,
  })
}

export function getAccessTokenDiagnostics() {
  const token = getAccessToken()

  return {
    hasToken: Boolean(token),
    tokenParts: token ? token.split('.').length : 0,
    tokenLength: token?.length ?? 0,
    authorizationPrefix: token ? 'Bearer' : null,
  }
}

function normalizeErrorMessage(status, body) {
  if (status === 401) {
    return AUTH_EXPIRED_MESSAGE
  }

  if (typeof body === 'object' && body !== null) {
    return body.message ?? body.error ?? '요청을 처리하지 못했습니다.'
  }

  return body || '마을로 이어지는 길이 잠시 조용해졌습니다.'
}

async function parseBody(response) {
  if (response.status === 204) return null

  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}

export async function apiRequest(path, options = {}) {
  const {
    suppressAuthRedirect = false,
    ...fetchOptions
  } = options
  const headers = new Headers(options.headers)
  const token = getAccessToken()
  const tokenParts = token ? token.split('.').length : 0
  const hasFormBody = options.body instanceof FormData

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (import.meta.env.DEV && path === '/api/photos') {
    console.info('Project Eden photo upload auth check', {
      url: path,
      method: fetchOptions.method || 'GET',
      ...getAccessTokenDiagnostics(),
    })
  }

  if (options.body && !hasFormBody && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...fetchOptions,
      headers,
    })
  } catch (error) {
    throw new ApiError('마을로 이어지는 길이 잠시 조용해졌습니다.', {
      type: 'NETWORK',
      details: error,
    })
  }

  const body = await parseBody(response)

  if (!response.ok) {
    if (response.status === 401) {
      warnUnauthorized({
        path,
        method: fetchOptions.method || 'GET',
        hasToken: Boolean(token),
        status: response.status,
      })

      if (!suppressAuthRedirect && token && !isAuthEndpoint(path)) {
        clearAccessToken()
        window.dispatchEvent(new CustomEvent('project-eden:unauthorized'))
      }
    }

    const errorType = response.status === 401
      ? token
        ? tokenParts === 3 ? 'TOKEN_REJECTED' : 'TOKEN_MALFORMED'
        : 'TOKEN_MISSING'
      : response.status === 413
        ? 'PAYLOAD_TOO_LARGE'
        : response.status >= 500
          ? 'SERVER'
          : 'API'

    throw new ApiError(normalizeErrorMessage(response.status, body), {
      status: response.status,
      type: errorType,
      details: body,
    })
  }

  return body
}

export function apiJson(path, options = {}) {
  return apiRequest(path, {
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
}
