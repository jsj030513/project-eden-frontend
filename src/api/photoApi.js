import { apiRequest } from './httpClient'

export function uploadPhoto(file, plantId = null) {
  const formData = new FormData()
  formData.append('file', file)

  if (plantId !== null && plantId !== undefined) {
    formData.append('plantId', String(plantId))
  }

  return apiRequest('/api/photos', {
    method: 'POST',
    body: formData,
  })
}
