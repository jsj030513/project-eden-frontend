import { apiJson } from './httpClient'

export const DEFAULT_NPC_ID = import.meta.env.VITE_DEFAULT_NPC_ID || '1'

export function getMyNpcs(options = {}) {
  return apiJson('/api/npcs/me', options)
}

export function getNpcDialogue(npcId = DEFAULT_NPC_ID) {
  return apiJson(`/api/npcs/${encodeURIComponent(npcId)}/dialogue`)
}
