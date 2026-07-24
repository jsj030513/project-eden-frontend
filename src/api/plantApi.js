import { apiJson } from './httpClient'

export function getMyPlants() {
  return apiJson('/api/plants/me')
}

export function getMySeeds() {
  return apiJson('/api/seeds/me')
}

export function plantFlowerSeed() {
  return apiJson('/api/seeds/plant', {
    method: 'POST',
    body: { seedType: 'FLOWER' },
  })
}
