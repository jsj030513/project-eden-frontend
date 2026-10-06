import { useEffect, useRef, useState } from 'react'
import { useVisionCapture, VISION_FILE_ACCEPT } from '../hooks/useVisionCapture'
import VisionRanking from '../components/vision/VisionRanking'

const CAPTURE_STATE = {
  IDLE: 'idle',
  PREVIEW: 'preview',
}

const STATUS_MESSAGE = {
  uploadingPhoto: '오늘의 순간을 마을로 옮기고 있습니다.',
  recognizing: '마을이 이 순간을 천천히 바라보고 있습니다.',
  plantingMemory: '이 기억이 밭에 머물 자리를 찾고 있습니다.',
  refreshingVillage: '작은 변화가 풍경 어딘가에 머물고 있습니다.',
  completed: '오늘의 순간이 마을에 조용히 남았습니다.',
}

function CapturePage({
  mode = 'memory',
  captureState = {},
  targetContext,
  tutorialState,
  onBack,
  onSubmitMoment,
  onRetryRecognition,
  onKeepUnknownMoment,
  onAuthError,
  onResetCapture,
}) {
  const cameraInputRef = useRef(null)
  const libraryInputRef = useRef(null)
  const previewUrlRef = useRef(null)
  const submitLockRef = useRef(false)
  const retryLockRef = useRef(false)
  const [localCaptureState, setLocalCaptureState] = useState(CAPTURE_STATE.IDLE)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [previewFailed, setPreviewFailed] = useState(false)
  const isVision = mode === 'vision'
  const vision = useVisionCapture()

  const clearPreviewUrl = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }

  const selectFile = (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file) return
    if (isVision && vision.isAnalyzing) return

    clearPreviewUrl()
    const nextPreviewUrl = URL.createObjectURL(file)
    previewUrlRef.current = nextPreviewUrl
    setSelectedFile(file)
    setPreviewUrl(nextPreviewUrl)
    setPreviewFailed(false)
    setLocalCaptureState(CAPTURE_STATE.PREVIEW)
    if (isVision) vision.resetVision(file)
    else onResetCapture()
  }

  const resetSelection = () => {
    clearPreviewUrl()
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (libraryInputRef.current) libraryInputRef.current.value = ''
    setSelectedFile(null)
    setPreviewUrl(null)
    setLocalCaptureState(CAPTURE_STATE.IDLE)
    submitLockRef.current = false
    retryLockRef.current = false
    if (isVision) {
      setPreviewFailed(false)
      vision.resetVision()
    }
    else onResetCapture()
  }

  const saveMemory = () => {
    if (!selectedFile || captureState.isUploading || submitLockRef.current) return
    submitLockRef.current = true
    Promise.resolve(onSubmitMoment(selectedFile)).finally(() => {
      submitLockRef.current = false
    })
  }

  const retryCurrentPhoto = () => {
    if (captureState.isUploading || captureState.retryCount >= 2 || retryLockRef.current) return
    if (captureState.uploadedPhotoId) {
      retryLockRef.current = true
      Promise.resolve(onRetryRecognition()).finally(() => {
        retryLockRef.current = false
      })
      return
    }
    saveMemory()
  }

  useEffect(() => () => {
    clearPreviewUrl()
  }, [])

  useEffect(() => {
    if (captureState.status !== 'completed') return

    clearPreviewUrl()
    if (cameraInputRef.current) cameraInputRef.current.value = ''
    if (libraryInputRef.current) libraryInputRef.current.value = ''
    setSelectedFile(null)
    setPreviewUrl(null)
    setLocalCaptureState(CAPTURE_STATE.IDLE)
  }, [captureState.status])

  const recoveryStatuses = ['unknown', 'network-error', 'server-error', 'file-too-large', 'input-error', 'auth-error', 'error']
  const isServerBusy = ['uploadingPhoto', 'recognizing', 'plantingMemory', 'refreshingVillage'].includes(captureState.status)
  const isRecovery = recoveryStatuses.includes(captureState.status)
  const isIdle = localCaptureState === CAPTURE_STATE.IDLE && !isServerBusy && !isRecovery
  const isPreview = localCaptureState === CAPTURE_STATE.PREVIEW && !isServerBusy && !isRecovery
  const isTutorialActive = Boolean(tutorialState?.isActive)
  const canRetryRecognition = Boolean(captureState.uploadedPhotoId) && captureState.retryCount < 2 && !captureState.isUploading
  const canReconnect = Boolean(selectedFile) && !captureState.isUploading
  const shouldRetryUpload = captureState.failedOperation === 'PHOTO_UPLOAD_FAILED' && canReconnect
  const isUnknownRecovery = captureState.status === 'unknown'
  const recoveryCopy = {
    unknown: {
      title: '이 순간의 이름을<br />아직 찾지 못했어요.',
      message: '이름을 붙이지 못한 순간도\n마을에는 조용히 남을 수 있어요.',
      primary: '이대로 남기기',
      secondary: '다른 사진 선택하기',
      tertiary: '같은 사진 다시 살펴보기',
    },
    'network-error': {
      title: '마을로 이어지는 길이<br />잠시 멀어졌어요.',
      message: captureState.error,
      primary: '다른 사진 선택하기',
      secondary: '다시 연결하기',
    },
    'server-error': {
      title: '이 순간을 바라보는 데<br />조금 더 시간이 필요한 것 같아요.',
      message: captureState.error,
      primary: '다른 사진 선택하기',
      secondary: '같은 사진 다시 살펴보기',
    },
    'file-too-large': {
      title: '사진이 조금 커서<br />마을까지 닿지 못했어요.',
      message: captureState.error,
      primary: '다른 사진 선택하기',
      secondary: null,
    },
    'input-error': {
      title: '사진을 읽을 수 없어요.',
      message: captureState.error,
      primary: '다른 사진 선택하기',
      secondary: null,
    },
    'auth-error': {
      title: '마을 문이 잠시<br />닫혀 있는 것 같아요.',
      message: captureState.error,
      primary: '다시 로그인하기',
      secondary: null,
    },
    error: {
      title: '잠시 길이 흐려졌어요.',
      message: captureState.error,
      primary: '다른 사진 선택하기',
      secondary: '같은 사진 다시 살펴보기',
    },
  }[captureState.status]

  if (isVision) {
    return (
      <main className="capture-page capture-page--vision page-enter">
        <div
          className={`capture-view capture-view--vision capture-view--${vision.isAnalyzing ? 'saving' : localCaptureState}`}
          aria-label="Eden Vision 사진 분석 화면"
          data-capture-mode="vision"
          data-capture-status={vision.status}
        >
          <div className="capture-sun" />
          <div className="capture-ridge capture-ridge--back" />
          <div className="capture-ridge capture-ridge--front" />
          <input ref={cameraInputRef} className="capture-file-input" type="file" aria-label="분석할 사진 촬영" accept={VISION_FILE_ACCEPT} capture="environment" disabled={vision.isAnalyzing} onChange={selectFile} />
          <input ref={libraryInputRef} className="capture-file-input" type="file" aria-label="분석할 사진 선택" accept={VISION_FILE_ACCEPT} disabled={vision.isAnalyzing} onChange={selectFile} />
          <div className="capture-vision-content">
            <section className="capture-copy">
              <p className="eyebrow">EDEN VISION</p>
              <h1>사진 분석</h1>
              {vision.visionResult === null && <p>사진을 선택하면 Eden Vision으로 분석할 수 있어요.<br />최대 10MiB까지 선택할 수 있어요.</p>}
              <div role="status" aria-live="polite">
                {vision.isAnalyzing && <p>사진을 분석하고 있습니다.</p>}
                {vision.visionResult && <p>분석 응답을 받았습니다.</p>}
              </div>
              {vision.error && <p className="capture-vision-error" role="alert">{vision.error.message}</p>}
              {vision.visionResult !== null && <VisionRanking result={vision.visionResult} />}
              <div className="capture-actions" aria-busy={vision.isAnalyzing}>
                {vision.visionResult !== null
                  ? <button type="button" onClick={resetSelection}>다른 사진 분석</button>
                  : <>
                    <button type="button" onClick={() => cameraInputRef.current?.click()} disabled={vision.isAnalyzing}>카메라 열기</button>
                    <button type="button" onClick={() => libraryInputRef.current?.click()} disabled={vision.isAnalyzing}>{selectedFile ? '다시 선택하기' : '사진에서 선택하기'}</button>
                    {vision.error?.status === 401
                      ? <button type="button" onClick={onAuthError}>다시 로그인하기</button>
                      : <button type="button" onClick={() => vision.analyzeImage(selectedFile)} disabled={vision.isAnalyzing}>{vision.isAnalyzing ? '분석 중…' : vision.error && selectedFile ? '다시 분석하기' : '분석하기'}</button>}
                  </>}
                <button type="button" className="capture-actions__quiet" onClick={onBack}>마을로 돌아가기</button>
              </div>
            </section>
            {previewUrl && (
              <figure className="capture-preview" aria-label="분석할 사진 미리보기">
                {previewFailed
                  ? <p className="capture-preview-fallback">미리보기를 지원하지 않는 형식일 수 있습니다</p>
                  : <img key={previewUrl} src={previewUrl} alt="분석할 사진" onError={() => setPreviewFailed(true)} />}
                <figcaption>{selectedFile.name}<br />{(selectedFile.size / (1024 * 1024)).toFixed(2)} MiB · {selectedFile.size.toLocaleString('ko-KR')} bytes</figcaption>
              </figure>
            )}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="capture-page page-enter">
      <div
        className={`capture-view capture-view--${isServerBusy ? 'saving' : localCaptureState}`}
        aria-label="따뜻한 숲과 노을을 담는 카메라 화면"
        data-capture-status={captureState.status}
        data-capture-context={targetContext ? 'contextual' : 'general'}
        data-capture-mode={targetContext ? 'TARGETED_PLANTING' : 'GENERAL_MEMORY'}
        data-target-id={targetContext?.targetId ?? undefined}
        data-target-asset-type={targetContext?.targetAssetType ?? undefined}
        data-target-category={targetContext?.category ?? undefined}
        data-target-x={targetContext?.x ?? undefined}
        data-target-y={targetContext?.y ?? undefined}
        data-target-display-name={targetContext?.displayName ?? undefined}
      >
        <div className="capture-sun" />
        <div className="capture-ridge capture-ridge--back" />
        <div className="capture-ridge capture-ridge--front" />
        <div className="capture-tree capture-tree--left" /><div className="capture-tree capture-tree--right" />
        <div className="capture-frame"><i /><i /><i /><i /></div>
        <div className="capture-focus" aria-hidden="true"><span /></div>

        <input ref={cameraInputRef} className="capture-file-input" type="file" accept="image/*" capture="environment" onChange={selectFile} />
        <input ref={libraryInputRef} className="capture-file-input" type="file" accept="image/*" onChange={selectFile} />

        {previewUrl && (
          <figure className="capture-preview" aria-label="선택한 오늘의 순간 미리보기">
            <img src={previewUrl} alt="마을에 남길 오늘의 순간" />
          </figure>
        )}

        <section className="capture-copy">
          <p className="eyebrow">TODAY'S MOMENT</p>
          {isIdle && (
            <>
              <h1>{isTutorialActive ? '지금 곁에 있는<br />순간이면 충분해요.' : '오늘의 순간을<br />하나 남겨볼까요?'}</h1>
              <p>빛과 바람, 그리고 지금의 마음까지.<br />마을이 조용히 기억해 둘 거예요.</p>
              <div className="capture-actions">
                <button type="button" onClick={() => cameraInputRef.current?.click()}>카메라 열기</button>
                <button type="button" onClick={() => libraryInputRef.current?.click()}>사진에서 선택하기</button>
                <button type="button" className="capture-actions__quiet" onClick={onBack}>마을로 돌아가기</button>
              </div>
            </>
          )}
          {isPreview && (
            <>
              <h1>이 순간을 마을에<br />남겨볼까요?</h1>
              <p>사진은 백엔드 마을 기억 API로만 전달돼요.<br />마을은 조용히 풍경으로 답할 거예요.</p>
              <div className="capture-actions">
                <button type="button" onClick={saveMemory}>기억 남기기</button>
                <button type="button" onClick={() => cameraInputRef.current?.click()}>다시 찍기</button>
                <button type="button" className="capture-actions__quiet" onClick={() => libraryInputRef.current?.click()}>다시 선택하기</button>
                <button type="button" className="capture-actions__quiet" onClick={resetSelection}>취소</button>
              </div>
            </>
          )}
          {isServerBusy && (
            <>
              <h1>{STATUS_MESSAGE[captureState.status]}</h1>
              <div className="capture-saving-dots" aria-hidden="true"><i /><i /><i /></div>
            </>
          )}
          {isRecovery && (
            <div
              className={`capture-error-card${isUnknownRecovery ? ' capture-error-card--unknown' : ''}`}
              role={isUnknownRecovery ? 'status' : 'alert'}
              aria-live="polite"
            >
              <h1 dangerouslySetInnerHTML={{ __html: recoveryCopy.title }} />
              <p>{recoveryCopy.message}</p>
              <div className="capture-actions">
                <button
                  type="button"
                  onClick={isUnknownRecovery ? onKeepUnknownMoment : captureState.status === 'auth-error' ? onAuthError : resetSelection}
                  disabled={isUnknownRecovery && captureState.isUploading}
                >
                  {recoveryCopy.primary}
                </button>
                {recoveryCopy.secondary && (
                  <button
                    type="button"
                    className="capture-actions__quiet"
                    onClick={isUnknownRecovery ? resetSelection : shouldRetryUpload ? saveMemory : retryCurrentPhoto}
                    disabled={isUnknownRecovery ? captureState.isUploading : shouldRetryUpload ? false : !canRetryRecognition}
                  >
                    {recoveryCopy.secondary}
                  </button>
                )}
                {recoveryCopy.tertiary && (
                  <button
                    type="button"
                    className="capture-actions__quiet"
                    onClick={retryCurrentPhoto}
                    disabled={!canRetryRecognition}
                  >
                    {recoveryCopy.tertiary}
                  </button>
                )}
              </div>
            </div>
          )}
        </section>
        <div className="capture-hud">
          <span>EDEN CAM · 01</span><span>BACKEND MEMORY FLOW</span>
        </div>
      </div>
    </main>
  )
}

export default CapturePage
