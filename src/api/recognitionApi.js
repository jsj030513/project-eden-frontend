import { apiJson } from './httpClient'

export function recognizePhoto(photoId, options = {}) {
  return apiJson(`/api/photos/${encodeURIComponent(photoId)}/recognize`, {
    ...options,
    method: 'POST',
  })
}
