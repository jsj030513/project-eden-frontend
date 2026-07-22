import { useEffect, useRef, useState } from 'react'

const CAPTURE_STATE = {
  IDLE: 'idle',
  PREVIEW: 'preview',
}

const STATUS_MESSAGE = {
  uploadingPhoto: '오늘의 순간을 마을로 옮기고 있습니다.',
  recognizing: '마을이 이 순간을 천천히 바라보고 있습니다.',
  refreshingVillage: '작은 변화가 풍경 어딘가에 머물고 있습니다.',
  completed: '오늘의 순간이 마을에 조용히 남았습니다.',
}

function CapturePage({
  captureState,
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

    clearPreviewUrl()
    const nextPreviewUrl = URL.createObjectURL(file)
    previewUrlRef.current = nextPreviewUrl
    setSelectedFile(file)
    setPreviewUrl(nextPreviewUrl)
    setLocalCaptureState(CAPTURE_STATE.PREVIEW)
    onResetCapture()
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
    onResetCapture()
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
  const isServerBusy = ['uploadingPhoto', 'recognizing', 'refreshingVillage'].includes(captureState.status)
  const isRecovery = recoveryStatuses.includes(captureState.status)
  const isIdle = localCaptureState === CAPTURE_STATE.IDLE && !isServerBusy && !isRecovery
  const isPreview = localCaptureState === CAPTURE_STATE.PREVIEW && !isServerBusy && !isRecovery
  const isTutorialActive = Boolean(tutorialState?.isActive)
  const canRetryRecognition = Boolean(captureState.uploadedPhotoId) && captureState.retryCount < 2 && !captureState.isUploading
  const canReconnect = Boolean(selectedFile) && !captureState.isUploading
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

  return (
    <main className="capture-page page-enter">
      <div
        className={`capture-view capture-view--${isServerBusy ? 'saving' : localCaptureState}`}
        aria-label="따뜻한 숲과 노을을 담는 카메라 화면"
        data-capture-status={captureState.status}
        data-capture-context={targetContext ? 'contextual' : 'general'}
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
                    onClick={isUnknownRecovery ? resetSelection : captureState.status === 'network-error' && !captureState.uploadedPhotoId ? saveMemory : retryCurrentPhoto}
                    disabled={isUnknownRecovery ? captureState.isUploading : captureState.status === 'network-error' && !captureState.uploadedPhotoId ? !canReconnect : !canRetryRecognition}
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
