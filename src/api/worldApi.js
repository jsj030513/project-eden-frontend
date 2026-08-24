import { apiJson } from './httpClient'

export function getMyWorld() {
  return apiJson('/api/worlds/me')
}

export function getMyWorldState(options = {}) {
  return apiJson('/api/worlds/me/state', options)
}

export function getMyWorldChunks(centerChunkX, centerChunkY, radius = 1, options = {}) {
  const params = new URLSearchParams({
    centerChunkX: String(centerChunkX),
    centerChunkY: String(centerChunkY),
    radius: String(radius),
  })
  return apiJson(`/api/worlds/me/chunks?${params}`, options)
}

export function moveMyPlayer(targetX, targetY, options = {}) {
  return apiJson('/api/worlds/me/move', { ...options, method: 'POST', body: { targetX, targetY } })
}

export function startNpcDialogue(objectId, options = {}) {
  return apiJson(`/api/worlds/me/npcs/${encodeURIComponent(objectId)}/dialogues/start`, {
    ...options,
    method: 'POST',
  })
}

export function chooseNpcDialogue(objectId, sessionId, choiceId, options = {}) {
  return apiJson(`/api/worlds/me/npcs/${encodeURIComponent(objectId)}/dialogues/${encodeURIComponent(sessionId)}/choices/${encodeURIComponent(choiceId)}`, {
    ...options,
    method: 'POST',
  })
}

export function closeNpcDialogueSession(objectId, sessionId, options = {}) {
  return apiJson(`/api/worlds/me/npcs/${encodeURIComponent(objectId)}/dialogues/${encodeURIComponent(sessionId)}/close`, {
    ...options,
    method: 'POST',
  })
}

export function getNpcRelationships(options = {}) {
  return apiJson('/api/worlds/me/npcs/relationships', options)
}

export function getNpcRelationship(objectId, options = {}) {
  return apiJson(`/api/worlds/me/npcs/${encodeURIComponent(objectId)}/relationship`, options)
}

export function recordWorldInteractionProgress(targetId, options = {}) {
  return apiJson(`/api/worlds/me/interactions/${encodeURIComponent(targetId)}/progress`, {
    ...options,
    method: 'POST',
  })
}

export function plantMemory({ photoId, targetId, expectedX, expectedY }, options = {}) {
  return apiJson('/api/worlds/me/plant-memory', {
    ...options,
    method: 'POST',
    body: { photoId, targetId, expectedX, expectedY },
  })
}

export function createWorld() {
  return apiJson('/api/worlds', { method: 'POST' })
}

export function getMyHouse() {
  return apiJson('/api/houses/me')
}

export function createHouse() {
  return apiJson('/api/houses', { method: 'POST' })
}

export function getMyInventory() {
  return apiJson('/api/inventories/me')
}

export function createInventory() {
  return apiJson('/api/inventories', { method: 'POST' })
}
