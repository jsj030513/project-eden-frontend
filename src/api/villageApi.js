import { apiJson } from './httpClient'

export function getMyVillage(options = {}) {
  return apiJson('/api/village/me', options)
}

export function getVillageInterpretation(options = {}) {
  return apiJson('/api/village/interpretation', options)
}

export function getVillageChanges(options = {}) {
  return apiJson('/api/village/changes', options)
}

export function getVillageHistory(options = {}) {
  return apiJson('/api/village/history', options)
}
