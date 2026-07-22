import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import VirtualJoystick from '../components/village/VirtualJoystick'
import VillageScene from '../components/village/VillageScene'
import VillageStatusText from '../components/village/VillageStatusText'
import { TUTORIAL_EVENTS, TUTORIAL_STEPS } from '../constants/tutorialSteps'
import { useCharacterMovement } from '../hooks/useCharacterMovement'
import { resolveNpcDialogue } from '../components/village/NpcDialogue'
import {
  interactionMatches,
  resolveContextualInteraction,
  resolveHudInteraction,
  selectCurrentHudInteraction,
} from '../components/village/contextualInteraction'

const TUTORIAL_MOVE_DISTANCE = 32
const EMPTY_INTERACTIONS = Object.freeze([])

function VillagePage({ villageState, npcState, villageRevealState, tutorialState, successToast, captureOpen = false, onCapture, onRetryVillage, onTalkToNpc, onCloseNpcDialogue, onLeaveNpcRange, onTutorialEvent, onMove, onMovementEnd }) {
  const [activePanel, setActivePanel] = useState('NONE')
  const [templateDialogue, setTemplateDialogue] = useState(null)
  const [contextualInteraction, setContextualInteraction] = useState(null)
  const captureTargetRef = useRef(null)
  const tutorialMoveStartRef = useRef(null)
  const characterElementRef = useRef(null)
  const worldElementRef = useRef(null)
  const {
    characterPosition,
    npcPosition,
    showNpcDialogue,
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
  const templateDialogueContent = templateDialogue ? resolveNpcDialogue(templateDialogue) : null
  const contextualContent = contextualInteraction ? resolveContextualInteraction(contextualInteraction) : null
  const closeActivePanel = useCallback(() => {
    setActivePanel('NONE')
    setTemplateDialogue(null)
    setContextualInteraction(null)
  }, [])
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
    closeActivePanel()
    onCapture(captureTargetRef.current)
  }, [closeActivePanel, onCapture])
  const openHudInteraction = useCallback(() => {
    if (!currentHudInteraction || captureOpen) return
    onCloseNpcDialogue?.()
    if (currentHudInteraction.type === 'TALK') {
      setContextualInteraction(null)
      setTemplateDialogue(currentHudInteraction)
      setActivePanel('DIALOGUE')
      return
    }
    if (currentHudInteraction.type === 'INTERACT') {
      setTemplateDialogue(null)
      setContextualInteraction(currentHudInteraction)
      setActivePanel('CONTEXTUAL')
    }
  }, [captureOpen, currentHudInteraction, onCloseNpcDialogue])
  const openInspect = useCallback(() => {
    if (captureOpen) return
    onCloseNpcDialogue?.()
    setTemplateDialogue(null)
    setContextualInteraction(null)
    setActivePanel('INSPECT')
  }, [captureOpen, onCloseNpcDialogue])
  const openLegacyNpcDialogue = useCallback(() => {
    closeActivePanel()
    onTalkToNpc()
  }, [closeActivePanel, onTalkToNpc])

  useEffect(() => {
    if (!showNpcDialogue && npcState.isOpen) {
      onLeaveNpcRange()
    }
  }, [npcState.isOpen, onLeaveNpcRange, showNpcDialogue])

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
    if (tutorialState?.isActive && tutorialState.currentStep === TUTORIAL_STEPS.APPROACH_NPC && showNpcDialogue) {
      onTutorialEvent?.(TUTORIAL_EVENTS.APPROACHED_NPC)
    }
  }, [onTutorialEvent, showNpcDialogue, tutorialState?.currentStep, tutorialState?.isActive])

  useEffect(() => {
    if (tutorialState?.isActive && tutorialState.currentStep === TUTORIAL_STEPS.TALK_TO_NPC && npcState.isOpen && npcState.dialogue) {
      onTutorialEvent?.(TUTORIAL_EVENTS.TALKED_TO_NPC)
    }
  }, [npcState.dialogue, npcState.isOpen, onTutorialEvent, tutorialState?.currentStep, tutorialState?.isActive])

  const isRevealActive = Boolean(villageRevealState?.isPending || villageRevealState?.isPlaying)
  const statusMessage = isRevealActive
    ? villageRevealState.message
    : villageState.notice || villageState.interpretation?.message || villageState.village?.latestMessage
  const hasMemory = Boolean(
    villageState.village?.totalMemoryCount
    || (villageState.interpretation?.theme && villageState.interpretation.theme !== 'UNDEFINED'),
  )
  const canTalkToNpc = showNpcDialogue && !npcState.isLoading
  const shouldShowNpcPanel = showNpcDialogue && (npcState.isOpen || npcState.isLoading || npcState.error)
  const npcPanelMessage = npcState.isLoading
    ? '무슨 말을 건넬지 천천히 생각하고 있습니다.'
    : npcState.error || npcState.dialogue?.message

  return (
    <main className={`village-page page-enter${isRevealActive ? ' is-revealing' : ''}`}>
      <section className="village-stage" aria-label="노을빛이 머무는 에덴 마을">
        <VillageScene
          characterPosition={characterPosition}
          npcPosition={npcPosition}
          showNpcDialogue={showNpcDialogue && !npcState.isOpen}
          npcDialogueVariant="hint"
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
          npcMessage="말을 걸 수 있어요"
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
        {showNpcDialogue && !shouldShowNpcPanel && !currentHudInteraction && activePanel === 'NONE' && !isRevealActive && (
          <div className="npc-talk-panel">
            <button type="button" onClick={openLegacyNpcDialogue} disabled={!canTalkToNpc} aria-label="모아와 대화하기">
              <span aria-hidden="true">💬</span>
              <b>대화</b>
            </button>
          </div>
        )}
        {shouldShowNpcPanel && (
          <section className="npc-dialogue-panel" aria-live="polite" aria-label="모아와의 대화">
            <div className="npc-dialogue-panel__copy">
              <strong>모아 <span>· 마을지기</span></strong>
              <p>{npcPanelMessage}</p>
              {import.meta.env.DEV && npcState.dialogue?.dialogueKey && (
                <small>{npcState.dialogue.dialogueKey}</small>
              )}
            </div>
            <div className="npc-dialogue-panel__actions">
              <button type="button" onClick={openLegacyNpcDialogue} disabled={!canTalkToNpc}>
                {npcState.isLoading ? '듣는 중...' : '다시 이야기하기'}
              </button>
              <button type="button" className="npc-dialogue-panel__quiet" onClick={onCloseNpcDialogue} disabled={npcState.isLoading}>
                닫기
              </button>
            </div>
          </section>
        )}
        {currentHudInteraction && currentHudContent && !shouldShowNpcPanel && !currentHudPanelIsOpen && !isRevealActive && (
          <div
            className="npc-talk-panel village-interaction-prompt"
            data-interaction-type={currentHudInteraction.type}
            data-interaction-category={currentHudInteraction.category || 'UNKNOWN'}
            data-target-asset-type={currentHudInteraction.targetAssetType || 'UNKNOWN'}
          >
            <button type="button" onClick={openHudInteraction} aria-label={`${currentHudContent.displayName} · ${currentHudContent.actionLabel}`}>
              <span aria-hidden="true">{currentHudInteraction.type === 'TALK' ? '💬' : '✦'}</span>
              <span className="village-interaction-prompt__copy">
                <small>{currentHudContent.displayName}</small>
                <b>{currentHudContent.actionLabel}</b>
              </span>
            </button>
          </div>
        )}
        {activePanel === 'DIALOGUE' && templateDialogueContent && (
          <section className="npc-dialogue-panel" aria-live="polite" aria-label={`${templateDialogueContent.displayName}와의 대화`}>
            <div className="npc-dialogue-panel__copy"><strong>{templateDialogueContent.displayName}</strong><p>{templateDialogueContent.message}</p></div>
            <div className="npc-dialogue-panel__actions"><button type="button" className="npc-dialogue-panel__quiet" onClick={closeActivePanel}>닫기</button></div>
          </section>
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
            </div>
            <div className="npc-dialogue-panel__actions">
              {contextualContent.primaryActionLabel && (
                <button type="button" onClick={() => openMemoryUpload(contextualInteraction)}>
                  {contextualContent.primaryActionLabel}
                </button>
              )}
              <button type="button" className="npc-dialogue-panel__quiet" onClick={closeActivePanel} aria-label={`${contextualContent.displayName} 정보 닫기`}>
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
