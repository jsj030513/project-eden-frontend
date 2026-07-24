import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import VirtualJoystick from '../components/village/VirtualJoystick'
import VillageScene from '../components/village/VillageScene'
import VillageStatusText from '../components/village/VillageStatusText'
import { TUTORIAL_EVENTS, TUTORIAL_STEPS } from '../constants/tutorialSteps'
import { useCharacterMovement } from '../hooks/useCharacterMovement'
import NpcDialogue from '../components/village/NpcDialogue'
import { nextNpcDialogueIndex, resolveNpcDialogue } from '../components/village/npcDialogueScript'
import {
  interactionMatches,
  resolveContextualInteraction,
  resolveHudInteraction,
  selectRecentVillageHistory,
  selectCurrentHudInteraction,
} from '../components/village/contextualInteraction'

const TUTORIAL_MOVE_DISTANCE = 32
const EMPTY_INTERACTIONS = Object.freeze([])

function VillagePage({ villageState, villageRevealState, tutorialState, successToast, captureOpen = false, onCapture, onRetryVillage, onTutorialEvent, onMove, onMovementEnd }) {
  const [activePanel, setActivePanel] = useState('NONE')
  const [templateDialogue, setTemplateDialogue] = useState(null)
  const [dialogueLineIndex, setDialogueLineIndex] = useState(0)
  const [contextualInteraction, setContextualInteraction] = useState(null)
  const captureTargetRef = useRef(null)
  const tutorialMoveStartRef = useRef(null)
  const characterElementRef = useRef(null)
  const worldElementRef = useRef(null)
  const villageStageRef = useRef(null)
  const lastPanelTriggerRef = useRef(null)
  const {
    characterPosition,
    setJoystickVector,
    stopJoystick,
  } = useCharacterMovement({ worldState: villageState.worldState, onMove, onMovementEnd, characterElementRef, worldElementRef })

  const availableInteractions = useMemo(
    () => villageState.worldState?.availableInteractions || EMPTY_INTERACTIONS,
    [villageState.worldState?.availableInteractions],
  )
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
  const templateDialogueContent = templateDialogue
    ? resolveNpcDialogue(templateDialogue, dialogueLineIndex)
    : null
  const contextualContent = contextualInteraction ? resolveContextualInteraction(contextualInteraction) : null
  const recentCommunityHistory = useMemo(
    () => selectRecentVillageHistory(villageState.history),
    [villageState.history],
  )
  const resetActivePanel = useCallback(() => {
    setActivePanel('NONE')
    setTemplateDialogue(null)
    setDialogueLineIndex(0)
    setContextualInteraction(null)
  }, [])
  const closeActivePanel = useCallback(() => {
    resetActivePanel()
    window.requestAnimationFrame(() => {
      const trigger = lastPanelTriggerRef.current
      if (trigger?.isConnected) trigger.focus()
      else villageStageRef.current?.focus()
    })
  }, [resetActivePanel])
  const openMemoryUpload = useCallback((interaction = null) => {
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
  }, [onCapture, resetActivePanel])
  const openHudInteraction = useCallback((event) => {
    if (!currentHudInteraction || captureOpen) return
    lastPanelTriggerRef.current = event.currentTarget
    if (currentHudInteraction.type === 'TALK') {
      setContextualInteraction(null)
      setTemplateDialogue(currentHudInteraction)
      setDialogueLineIndex(0)
      setActivePanel('DIALOGUE')
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
    }
  }, [captureOpen, currentHudInteraction, onTutorialEvent, tutorialState?.currentStep])
  const openInspect = useCallback(() => {
    if (captureOpen) return
    setTemplateDialogue(null)
    setDialogueLineIndex(0)
    setContextualInteraction(null)
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

  useEffect(() => { if (captureOpen) resetActivePanel() }, [captureOpen, resetActivePanel])

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
    : villageState.notice || villageState.interpretation?.message || villageState.village?.latestMessage
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
          onOpenInspect={openInspect}
          onCloseInspect={closeActivePanel}
          changes={villageState.changes}
          revealState={villageRevealState}
          tutorialStep={tutorialState?.isActive ? tutorialState.currentStep : null}
        />
        <aside className="weather-panel" aria-label="마을 시간과 날씨">
          <span className="weather-panel__sun" aria-hidden="true">☀</span>
          <span><strong>늦은 오후</strong><small>따뜻한 바람</small></span>
        </aside>
        <button className="village-menu-button" type="button" aria-label="마을 메뉴">
          <span aria-hidden="true">☰</span>
        </button>
        <VillageStatusText message={statusMessage} isLoading={villageState.isLoading && !isRevealActive} />
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
            onNext={advanceTemplateDialogue}
            onClose={closeActivePanel}
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
        <VirtualJoystick onMove={setJoystickVector} onStop={stopJoystick} disabled={isRevealActive} />
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
