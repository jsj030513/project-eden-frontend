import { useEffect, useRef, useState } from 'react'
import { classifyImage } from '../api/visionApi'

export const VISION_FILE_ACCEPT = '.jpg,.jpeg,.mpo,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif'
export const VISION_MAX_FILE_SIZE = 10 * 1024 * 1024

// Codes defined by the backend's VisionExceptionHandler. Never render its message.
const VISION_ERROR_MESSAGES = {
  VISION_DISABLED: '사진 분석 기능이 현재 비활성화되어 있습니다. 나중에 다시 시도해 주세요.',
  VISION_CONNECTION_FAILED: '사진 분석 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  VISION_TIMEOUT: '사진 분석 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.',
  VISION_IMAGE_REQUIRED: '분석할 사진을 먼저 선택해 주세요.',
  VISION_IMAGE_EMPTY: '빈 파일은 분석할 수 없습니다. 다른 사진을 선택해 주세요.',
  VISION_IMAGE_TOO_LARGE: '사진의 용량 또는 해상도가 분석 한도를 초과했습니다. 더 작은 사진을 선택해 주세요.',
  VISION_IMAGE_UNSUPPORTED: '분석 서비스에서 지원하지 않는 사진 형식입니다. 다른 사진을 선택해 주세요.',
  VISION_IMAGE_INVALID: '사진을 읽을 수 없습니다. 다른 사진을 선택해 주세요.',
  VISION_INVALID_REQUEST: '사진 분석 요청을 확인할 수 없습니다. 사진을 다시 선택해 주세요.',
}

export function validateVisionFile(file) {
  if (!file) return '분석할 사진을 먼저 선택해 주세요.'
  if (file.size > VISION_MAX_FILE_SIZE) return '사진 분석은 10MiB 이하의 파일을 선택해 주세요.'
  return null
}

export function getVisionFailure(error) {
  // Keep a supplied code for later use, but never display upstream details.
  const suppliedCode = error?.details?.code ?? error?.details?.error?.code
  const code = typeof suppliedCode === 'string' ? suppliedCode : null
  let message = '사진을 분석하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  if (error?.status === 401) message = '로그인이 만료되었습니다. 다시 로그인해 주세요.'
  else if (Object.hasOwn(VISION_ERROR_MESSAGES, code)) message = VISION_ERROR_MESSAGES[code]
  else if (error?.status === 413) message = VISION_ERROR_MESSAGES.VISION_IMAGE_TOO_LARGE
  else if (error?.status === 503) message = '지금은 사진 분석 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'
  else if (error?.status === 504) message = '사진 분석 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.'
  else if (error?.type === 'NETWORK') message = '사진 분석 서비스에 연결하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.'
  else if ([400, 415, 422].includes(error?.status)) message = '사진을 분석할 수 없습니다. 다른 사진을 선택해 주세요.'
  return { message, code, status: error?.status, type: error?.type }
}

export function useVisionCapture() {
  const requestRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [visionResult, setVisionResult] = useState(null)

  useEffect(() => () => {
    requestRef.current?.abort()
    requestRef.current = null
  }, [])

  const resetVision = (file) => {
    const previousRequest = requestRef.current
    requestRef.current = null
    previousRequest?.abort()
    setVisionResult(null)
    const message = file ? validateVisionFile(file) : null
    setStatus(message ? 'error' : 'idle')
    setError(message ? { message, code: null } : null)
  }

  const analyzeImage = async (file) => {
    // A ref also blocks two submissions within the same React render.
    if (requestRef.current) return
    const message = validateVisionFile(file)
    if (message) {
      setError({ message, code: null })
      setStatus('error')
      return
    }

    const controller = new AbortController()
    requestRef.current = controller
    setStatus('analyzing')
    setError(null)
    setVisionResult(null)
    try {
      const response = await classifyImage(file, { signal: controller.signal, suppressAuthRedirect: true })
      if (requestRef.current !== controller) return
      if (response?.status !== 'ranked' || !Array.isArray(response.ranking)) {
        setError({ message: '분석 결과를 표시할 수 없습니다.', code: null })
        setStatus('error')
        return
      }
      // Preserve the full response, including ranking order and raw scores.
      setVisionResult(response)
      setStatus('success')
    } catch (failure) {
      if (requestRef.current !== controller) return
      setError(getVisionFailure(failure))
      setStatus('error')
    } finally {
      if (requestRef.current === controller) requestRef.current = null
    }
  }

  return { status, error, visionResult, resetVision, analyzeImage, isAnalyzing: status === 'analyzing' }
}
