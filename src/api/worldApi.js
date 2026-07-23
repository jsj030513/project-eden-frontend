import { apiJson } from './httpClient'

export function getMyWorld() {
  return apiJson('/api/worlds/me')
}

export function getMyWorldState(options = {}) {
  return apiJson('/api/worlds/me/state', options)
}

export function moveMyPlayer(targetX, targetY, options = {}) {
  return apiJson('/api/worlds/me/move', { ...options, method: 'POST', body: { targetX, targetY } })
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
