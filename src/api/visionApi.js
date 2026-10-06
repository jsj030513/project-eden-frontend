import { apiRequest } from './httpClient'

/**
 * Requests the backend's Vision ranking for an image.
 * The returned ranking contains raw model scores, not probabilities or confidence.
 */
export function classifyImage(image, options = {}) {
  const formData = new FormData()
  formData.append('image', image)

  return apiRequest('/api/vision/classify', {
    ...options,
    method: 'POST',
    body: formData,
  })
}
