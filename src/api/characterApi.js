import { apiJson } from './httpClient'

export function getMyCharacter() {
  return apiJson('/api/characters/me')
}

export function createCharacter() {
  return apiJson('/api/characters', {
    method: 'POST',
    body: {
      name: 'Eden',
      gender: 'NONE',
      hairStyle: 'PIXEL_CUT',
      hairColor: 'brown',
      outfit: 'ROBE',
      job: 'BEGINNER',
    },
  })
}
