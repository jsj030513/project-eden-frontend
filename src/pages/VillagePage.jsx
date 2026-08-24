import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import VirtualJoystick from '../components/village/VirtualJoystick'
import VillageScene from '../components/village/VillageScene'
import VillageStatusText from '../components/village/VillageStatusText'
import { TUTORIAL_EVENTS, TUTORIAL_STEPS } from '../constants/tutorialSteps'
import { useCharacterMovement } from '../hooks/useCharacterMovement'
import NpcDialogue from '../components/village/NpcDialogue'
import { nextNpcDialogueIndex, resolveNpcDialogue } from '../components/village/npcDialogueScript'
import {
  chooseNpcDialogue,
  closeNpcDialogueSession,
  recordWorldInteractionProgress,
  startNpcDialogue,
} from '../api/worldApi'
import { getAccessToken } from '../api/httpClient'
import {
  decrementDiagnostic,
  incrementDiagnostic,
  recordHydrationDiagnostic,
} from '../components/village/phase3cDiagnostics'
import {
  interactionMatches,
  resolveContextualInteraction,
  resolveHudInteraction,
  selectRecentVillageHistory,
  selectCurrentHudInteraction,
} from '../components/village/contextualInteraction'

const TUTORIAL_MOVE_DISTANCE = 32
const EMPTY_INTERACTIONS = Object.freeze([])

function VillagePage({ villageState, villageRevealState, tutorialState, successToast, captureOpen = false, onCapture, onRetryVillage, onRefreshWorldState, onTutorialEvent, onMove, onMovementEnd, onPinnedInteractionChange }) {
  const hasWorldState = Boolean(villageState.worldState)
  const [activePanel, setActivePanel] = useState('NONE')
  const [templateDialogue, setTemplateDialogue] = useState(null)
  const [dialogueLineIndex, setDialogueLineIndex] = useState(0)
  const [serverDialogue, setServerDialogue] = useState(null)
  const [dialogueLoading, setDialogueLoading] = useState(false)
  const [dialogueError, setDialogueError] = useState(null)
  const [contextualInteraction, setContextualInteraction] = useState(null)
  const [inspectInteraction, setInspectInteraction] = useState(null)
  const [regionBanner, setRegionBanner] = useState(null)
  const [npcProgressToast, setNpcProgressToast] = useState(null)
  const serverDialogueRef = useRef(null)
  const dialogueAccessTokenRef = useRef(null)
  const captureTargetRef = useRef(null)
  const tutorialMoveStartRef = useRef(null)
  const characterElementRef = useRef(null)
  const worldElementRef = useRef(null)
  const villageStageRef = useRef(null)
  const lastPanelTriggerRef = useRef(null)
  const lastRegionDiscoveryRef = useRef(null)
  const regionBannerTimerRef = useRef(null)
  const npcProgressTimerRef = useRef(null)
  const {
    characterPosition,
    setJoystickVector,
    stopJoystick,
  } = useCharacterMovement({
    worldState: villageState.worldState,
    onMove,
    onMovementEnd,
    characterElementRef,
    worldElementRef,
    disabled: activePanel === 'DIALOGUE',
  })

  const availableInteractions = useMemo(
    () => villageState.worldState?.availableInteractions || EMPTY_INTERACTIONS,
    [villageState.worldState?.availableInteractions],
  )
  const diagnosticWorldId = villageState.worldState?.worldId ?? null
  const diagnosticTerrainCount = villageState.worldState?.terrainTiles?.length ?? 0
  const diagnosticObjectCount = villageState.worldState?.placedObjects?.length ?? 0
  useEffect(() => {
    recordHydrationDiagnostic('VILLAGE_PAGE_RENDER', {
      worldId: diagnosticWorldId,
      stateTerrainCount: diagnosticTerrainCount,
      stateObjectCount: diagnosticObjectCount,
      hasWorldState,
    })
  }, [diagnosticObjectCount, diagnosticTerrainCount, diagnosticWorldId, hasWorldState])
  const currentHudInteraction = useMemo(
    () => selectCurrentHudInteraction(availableInteractions),
    [availableInteractions],
  )
  const currentHudContent = useMemo(
    () => currentHudInteraction ? resolveHudInteraction(currentHudInteraction) : null,
    [currentHudInteraction],
  )
  const currentHudPanelIsOpen = activePanel === 'DIALOGUE'
    ? interactionMatches(currentHudInteraction, templateDialogue)
    : activePanel === 'CONTEXTUAL'
      ? interactionMatches(currentHudInteraction, contextualInteraction)
      : false
  const runtimeNpc = useMemo(() => {
    if (!templateDialogue?.targetId) return null
    return (villageState.worldState?.npcPositions || []).find((npc) => (
      String(npc.objectId ?? npc.id) === String(templateDialogue.targetId)
    )) || null
  }, [templateDialogue, villageState.worldState?.npcPositions])
  const templateDialogueContent = serverDialogue
    ? {
      targetId: serverDialogue.npc?.objectId,
      targetAssetType: templateDialogue?.targetAssetType,
      displayName: serverDialogue.npc?.displayName || templateDialogue?.displayName || '마을 주민',
      portraitKey: serverDialogue.npc?.portraitKey,
      activity: serverDialogue.npc?.activity,
      message: serverDialogue.node?.text,
      choices: serverDialogue.node?.choices || [],
      isLastLine: Boolean(serverDialogue.completed || serverDialogue.node?.close),
      primaryActionLabel: '대화 마치기',
      closeActionLabel: '닫기',
    }
    : templateDialogue
      ? resolveNpcDialogue(templateDialogue, dialogueLineIndex)
      : null
  const contextualContent = contextualInteraction ? resolveContextualInteraction(contextualInteraction) : null
  const recentCommunityHistory = useMemo(
    () => selectRecentVillageHistory(villageState.history),
    [villageState.history],
  )
  const regionDiscoveryKey = villageState.worldState?.regionDiscovery?.key
  const regionDiscoveryType = villageState.worldState?.regionDiscovery?.regionType
  const showProgressNotifications = useCallback((notifications = []) => {
    const messages = notifications.map((notification) => notification?.message).filter(Boolean)
    if (!messages.length) return
    if (npcProgressTimerRef.current) window.clearTimeout(npcProgressTimerRef.current)
    setNpcProgressToast(messages.join(' · '))
    npcProgressTimerRef.current = window.setTimeout(() => {
      npcProgressTimerRef.current = null
      setNpcProgressToast(null)
    }, 3200)
  }, [])
  useEffect(() => {
    if (!regionDiscoveryKey || regionDiscoveryKey === lastRegionDiscoveryRef.current) return
    lastRegionDiscoveryRef.current = regionDiscoveryKey
    const names = { MEADOW: '초원', FOREST: '숲', POND: '작은 연못' }
    setRegionBanner(names[regionDiscoveryType] || '새로운 지역')
    if (regionBannerTimerRef.current) {
      window.clearTimeout(regionBannerTimerRef.current)
      decrementDiagnostic('activeRevealTimers')
    }
    incrementDiagnostic('revealTimersCreated')
    incrementDiagnostic('activeRevealTimers', 'maxActiveRevealTimers')
    regionBannerTimerRef.current = window.setTimeout(() => {
      regionBannerTimerRef.current = null
      decrementDiagnostic('activeRevealTimers')
      setRegionBanner(null)
    }, 2200)
  }, [regionDiscoveryKey, regionDiscoveryType])
  useEffect(() => () => {
    if (!regionBannerTimerRef.current) return
    window.clearTimeout(regionBannerTimerRef.current)
    regionBannerTimerRef.current = null
    decrementDiagnostic('activeRevealTimers')
  }, [])
  useEffect(() => () => {
    if (npcProgressTimerRef.current) window.clearTimeout(npcProgressTimerRef.current)
  }, [])
  const resetActivePanel = useCallback(() => {
    setActivePanel('NONE')
    setTemplateDialogue(null)
    setDialogueLineIndex(0)
    setServerDialogue(null)
    setDialogueLoading(false)
    setDialogueError(null)
    setContextualInteraction(null)
    setInspectInteraction(null)
    dialogueAccessTokenRef.current = null
  }, [])
  useEffect(() => {
    serverDialogueRef.current = serverDialogue
    if (serverDialogue?.sessionId) {
      dialogueAccessTokenRef.current = getAccessToken()
    }
  }, [serverDialogue])
  useEffect(() => {
    const cleanupDialogueForLogout = () => {
      const session = serverDialogueRef.current
      const accessToken = dialogueAccessTokenRef.current
      if (session?.sessionId && session?.npc?.objectId && !session.completed) {
        closeNpcDialogueSession(
          session.npc.objectId,
          session.sessionId,
          {
            suppressAuthRedirect: true,
            headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
          },
        ).catch(() => {})
      }
      resetActivePanel()
    }
    window.addEventListener('project-eden:unauthorized', cleanupDialogueForLogout)
    return () => window.removeEventListener('project-eden:unauthorized', cleanupDialogueForLogout)
  }, [resetActivePanel])
  const closeActivePanel = useCallback(() => {
    const session = serverDialogue
    if (session?.sessionId && session?.npc?.objectId && !session.completed) {
      closeNpcDialogueSession(session.npc.objectId, session.sessionId, { suppressAuthRedirect: true }).catch(() => {})
    }
    resetActivePanel()
    window.requestAnimationFrame(() => {
      const trigger = lastPanelTriggerRef.current
      if (trigger?.isConnected) trigger.focus()
      else villageStageRef.current?.focus()
    })
  }, [resetActivePanel, serverDialogue])
  const openMemoryUpload = useCallback((interaction = null) => {
    const session = serverDialogue
    if (session?.sessionId && session?.npc?.objectId && !session.completed) {
      closeNpcDialogueSession(session.npc.objectId, session.sessionId, { suppressAuthRedirect: true }).catch(() => {})
    }
    captureTargetRef.current = interaction ? {
      type: interaction.type,
      targetId: interaction.targetId,
      targetAssetType: interaction.targetAssetType,
      x: interaction.x,
      y: interaction.y,
      category: interaction.category,
      displayName: interaction.displayName,
    } : null
    resetActivePanel()
    onCapture(captureTargetRef.current)
  }, [onCapture, resetActivePanel, serverDialogue])
  const openHudInteraction = useCallback(async (event) => {
    if (!currentHudInteraction || captureOpen) return
    lastPanelTriggerRef.current = event.currentTarget
    if (currentHudInteraction.type === 'TALK') {
      setContextualInteraction(null)
      setTemplateDialogue(currentHudInteraction)
      setDialogueLineIndex(0)
      setActivePanel('DIALOGUE')
      const npc = (villageState.worldState?.npcPositions || []).find((candidate) => (
        String(candidate.objectId ?? candidate.id) === String(currentHudInteraction.targetId)
      ))
      if (npc?.dialogueKey) {
        setDialogueLoading(true)
        setDialogueError(null)
        try {
          setServerDialogue(await startNpcDialogue(currentHudInteraction.targetId, { suppressAuthRedirect: true }))
        } catch (error) {
          setDialogueError(error?.message || '대화를 시작할 수 없습니다.')
        } finally {
          setDialogueLoading(false)
        }
      }
      if (tutorialState?.currentStep === TUTORIAL_STEPS.TALK_AGAIN) {
        onTutorialEvent?.(TUTORIAL_EVENTS.TALKED_AFTER_REVEAL)
      } else if (tutorialState?.currentStep === TUTORIAL_STEPS.TALK_TO_NPC) {
        onTutorialEvent?.(TUTORIAL_EVENTS.TALKED_TO_NPC)
      }
      return
    }
    if (currentHudInteraction.type === 'INTERACT') {
      setTemplateDialogue(null)
      setDialogueLineIndex(0)
      setContextualInteraction(currentHudInteraction)
      setActivePanel('CONTEXTUAL')
      recordWorldInteractionProgress(currentHudInteraction.targetId, { suppressAuthRedirect: true })
        .then(showProgressNotifications)
        .catch(() => {})
    }
  }, [captureOpen, currentHudInteraction, onTutorialEvent, showProgressNotifications, tutorialState?.currentStep, villageState.worldState?.npcPositions])
  const openInspect = useCallback((interaction) => {
    if (captureOpen) return
    setTemplateDialogue(null)
    setDialogueLineIndex(0)
    setContextualInteraction(null)
    setInspectInteraction(interaction || null)
    setActivePanel('INSPECT')
  }, [captureOpen])
  const advanceTemplateDialogue = useCallback(() => {
    if (!templateDialogue) return
    const resolved = resolveNpcDialogue(templateDialogue, dialogueLineIndex)
    if (resolved.isLastLine) {
      closeActivePanel()
      return
    }
    setDialogueLineIndex((current) => nextNpcDialogueIndex(templateDialogue, current))
  }, [closeActivePanel, dialogueLineIndex, templateDialogue])

  const chooseServerDialogue = useCallback(async (choiceId) => {
    if (!serverDialogue?.sessionId || !runtimeNpc?.objectId || dialogueLoading) return
    setDialogueLoading(true)
    setDialogueError(null)
    try {
      const response = await chooseNpcDialogue(
        runtimeNpc.objectId,
        serverDialogue.sessionId,
        choiceId,
        { suppressAuthRedirect: true },
      )
      setServerDialogue(response)
      showProgressNotifications(response.notifications)
    } catch (error) {
      setDialogueError(error?.message || '대화를 이어갈 수 없습니다.')
    } finally {
      setDialogueLoading(false)
    }
  }, [dialogueLoading, runtimeNpc?.objectId, serverDialogue?.sessionId, showProgressNotifications])

  useEffect(() => {
    const selected = activePanel === 'DIALOGUE'
      ? templateDialogue
      : activePanel === 'CONTEXTUAL'
        ? contextualInteraction
        : null
    if (!selected) return
    const isStillAvailable = availableInteractions.some((interaction) => (
      interaction?.available === true && interactionMatches(interaction, selected)
    ))
    if (!isStillAvailable) closeActivePanel()
  }, [activePanel, availableInteractions, closeActivePanel, contextualInteraction, templateDialogue])

  useEffect(() => { if (captureOpen) closeActivePanel() }, [captureOpen, closeActivePanel])

  useEffect(() => {
    if (!onRefreshWorldState || !hasWorldState) return undefined
    const timer = window.setInterval(() => {
      Promise.resolve(onRefreshWorldState()).catch(() => {})
    }, 5500)
    return () => window.clearInterval(timer)
  }, [hasWorldState, onRefreshWorldState])

  useEffect(() => {
    const interaction = activePanel === 'DIALOGUE'
      ? currentHudInteraction || templateDialogue
      : activePanel === 'CONTEXTUAL'
        ? currentHudInteraction || contextualInteraction
        : activePanel === 'INSPECT'
          ? inspectInteraction
          : null
    onPinnedInteractionChange?.(interaction)
    return () => onPinnedInteractionChange?.(null)
  }, [activePanel, contextualInteraction, currentHudInteraction, inspectInteraction, onPinnedInteractionChange, templateDialogue])

  useEffect(() => {
    if (activePanel === 'NONE') return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.target?.matches?.('input,textarea,[contenteditable=true]')) return
      event.preventDefault()
      closeActivePanel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activePanel, closeActivePanel])

  useEffect(() => {
    if (!tutorialState?.isActive || tutorialState.currentStep !== TUTORIAL_STEPS.MOVE) {
      tutorialMoveStartRef.current = null
      return
    }

    if (!tutorialMoveStartRef.current) {
      tutorialMoveStartRef.current = { x: characterPosition.x, y: characterPosition.y }
      return
    }

    const distance = Math.hypot(
      characterPosition.x - tutorialMoveStartRef.current.x,
      characterPosition.y - tutorialMoveStartRef.current.y,
    )

    if (distance >= TUTORIAL_MOVE_DISTANCE) {
      onTutorialEvent?.(TUTORIAL_EVENTS.MOVED)
    }
  }, [characterPosition.x, characterPosition.y, onTutorialEvent, tutorialState?.currentStep, tutorialState?.isActive])

  useEffect(() => {
    if (tutorialState?.isActive
      && tutorialState.currentStep === TUTORIAL_STEPS.APPROACH_NPC
      && currentHudInteraction?.type === 'TALK') {
      onTutorialEvent?.(TUTORIAL_EVENTS.APPROACHED_NPC)
    }
  }, [currentHudInteraction?.type, onTutorialEvent, tutorialState?.currentStep, tutorialState?.isActive])

  const isRevealActive = Boolean(villageRevealState?.isPending || villageRevealState?.isPlaying)
  const statusMessage = isRevealActive
    ? villageRevealState.message
    : villageState.notice
      || villageState.interpretation?.message
      || villageState.village?.latestMessage
      || villageState.worldState?.villageTitle
  const hasMemory = Boolean(
    villageState.village?.totalMemoryCount
    || (villageState.interpretation?.theme && villageState.interpretation.theme !== 'UNDEFINED'),
  )
  return (
    <main className={`village-page page-enter${isRevealActive ? ' is-revealing' : ''}${activePanel === 'DIALOGUE' ? ' has-template-dialogue' : ''}`}>
      <section
        ref={villageStageRef}
        className="village-stage"
        aria-label="노을빛이 머무는 에덴 마을"
        tabIndex={-1}
      >
        <VillageScene
          characterPosition={characterPosition}
          hasMemory={hasMemory}
          apiTheme={villageState.interpretation?.theme}
          expressions={villageState.interpretation?.expressions}
          village={villageState.village}
          worldState={villageState.worldState}
          characterElementRef={characterElementRef}
          worldElementRef={worldElementRef}
          onPlantMemory={openMemoryUpload}
          activePanel={activePanel}
          pinnedInteraction={activePanel === 'DIALOGUE'
            ? currentHudInteraction || templateDialogue
            : activePanel === 'CONTEXTUAL'
              ? currentHudInteraction || contextualInteraction
              : activePanel === 'INSPECT'
                ? inspectInteraction
                : null}
          onOpenInspect={openInspect}
          onCloseInspect={closeActivePanel}
          changes={villageState.changes}
          revealState={villageRevealState}
          tutorialStep={tutorialState?.isActive ? tutorialState.currentStep : null}
        />
        <aside className="weather-panel" aria-label="마을 시간과 날씨">
          <span className="weather-panel__sun" aria-hidden="true">☀</span>
          <span><strong>봄 1일차 · 오후 06:30</strong><small>맑음 · 22°C</small></span>
        </aside>
        <button className="village-menu-button" type="button" aria-label="마을 메뉴">
          <span aria-hidden="true">☰</span>
        </button>
        <VillageStatusText message={statusMessage} isLoading={villageState.isLoading && !isRevealActive} />
        {regionBanner && <div className="region-discovery-banner" role="status">새로운 지역 발견 · {regionBanner}</div>}
        <aside className="village-history-card" aria-label="최근 마을 기록">
          <h2>최근 마을 기록</h2>
          {recentCommunityHistory.length ? (
            <ol>
              {recentCommunityHistory.map((history) => (
                <li key={history.key}>
                  <span>{history.message}</span>
                  {history.dateLabel && <time dateTime={history.createdAt}>{history.dateLabel}</time>}
                </li>
              ))}
            </ol>
          ) : <p>아직 기록이 없어요.</p>}
        </aside>
        {villageState.error && !villageState.isLoading && (
          <div className="village-error-card" role="alert">
            <p>{villageState.error}</p>
            <button type="button" onClick={onRetryVillage}>다시 시도</button>
          </div>
        )}
        {successToast && (
          <div className="success-toast" role="status">
            오늘의 순간이 마을에<br />조용히 남았습니다.
          </div>
        )}
        {npcProgressToast && (
          <div className="npc-progress-toast" role="status">{npcProgressToast}</div>
        )}
        {currentHudInteraction && currentHudContent && !currentHudPanelIsOpen && !isRevealActive && (
          <div
            className="npc-talk-panel village-interaction-prompt"
            data-interaction-type={currentHudInteraction.type}
            data-interaction-category={currentHudInteraction.category || 'UNKNOWN'}
            data-target-asset-type={currentHudInteraction.targetAssetType || 'UNKNOWN'}
          >
            <button
              ref={lastPanelTriggerRef}
              type="button"
              onClick={openHudInteraction}
              aria-label={`${currentHudContent.displayName} · ${currentHudContent.actionLabel}`}
            >
              <span aria-hidden="true">{currentHudInteraction.type === 'TALK' ? '💬' : '✦'}</span>
              <span className="village-interaction-prompt__copy">
                <small>{currentHudContent.displayName}</small>
                <b>{currentHudContent.actionLabel}</b>
              </span>
            </button>
          </div>
        )}
        {activePanel === 'DIALOGUE' && templateDialogueContent && (
          <NpcDialogue
            dialogue={templateDialogueContent}
            relationship={serverDialogue?.relationship}
            onNext={advanceTemplateDialogue}
            onChoice={chooseServerDialogue}
            onClose={closeActivePanel}
            isLoading={dialogueLoading}
            error={dialogueError}
          />
        )}
        {activePanel === 'CONTEXTUAL' && contextualInteraction && contextualContent && (
          <section
            className="npc-dialogue-panel contextual-interaction-panel"
            aria-label={`${contextualContent.displayName} 살펴보기`}
            data-interaction-category={contextualInteraction.category || 'UNKNOWN'}
            data-target-asset-type={contextualInteraction.targetAssetType || 'UNKNOWN'}
          >
            <div className="npc-dialogue-panel__copy">
              <h2 className="contextual-interaction-panel__title">{contextualContent.displayName}</h2>
              <p>{contextualContent.description}</p>
              {contextualInteraction.category === 'COMMUNITY' && (
                <section className="community-history-summary" aria-labelledby="community-history-heading">
                  <h3 id="community-history-heading">최근 마을 기록</h3>
                  {recentCommunityHistory.length ? (
                    <ol>
                      {recentCommunityHistory.map((history) => (
                        <li key={history.key}>
                          <span>{history.message}</span>
                          {history.dateLabel && <time dateTime={history.createdAt}>{history.dateLabel}</time>}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="community-history-summary__empty">
                      아직 마을에 기록된 기억이 없어요.<br />
                      사진으로 기억을 남기면 이곳에서 다시 볼 수 있어요.
                    </p>
                  )}
                </section>
              )}
            </div>
            <div className="npc-dialogue-panel__actions">
              {contextualContent.primaryActionLabel && (
                <button type="button" onClick={() => openMemoryUpload(contextualInteraction)} autoFocus>
                  {contextualContent.primaryActionLabel}
                </button>
              )}
              <button
                type="button"
                className="npc-dialogue-panel__quiet"
                onClick={closeActivePanel}
                aria-label={`${contextualContent.displayName} 정보 닫기`}
                autoFocus={!contextualContent.primaryActionLabel}
              >
                닫기
              </button>
            </div>
          </section>
        )}
        <VirtualJoystick onMove={setJoystickVector} onStop={stopJoystick} disabled={isRevealActive || activePanel === 'DIALOGUE'} />
        <div className="village-action-bar">
          <span><i aria-hidden="true">JOY</i> 천천히 마을 산책하기</span>
          <button className="capture-icon-button" type="button" onClick={() => openMemoryUpload()} disabled={isRevealActive} aria-label="오늘의 순간 남기기">
            <span className="pixel-camera-icon" aria-hidden="true"><i /></span>
          </button>
        </div>
      </section>
    </main>
  )
}

export default VillagePage
