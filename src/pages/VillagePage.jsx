import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import VirtualJoystick from '../components/village/VirtualJoystick'
import VillageScene from '../components/village/VillageScene'
import VillageStatusText from '../components/village/VillageStatusText'
import { TUTORIAL_EVENTS, TUTORIAL_STEPS } from '../constants/tutorialSteps'
import { useCharacterMovement } from '../hooks/useCharacterMovement'
import { resolveNpcDialogue } from '../components/village/NpcDialogue'

const TUTORIAL_MOVE_DISTANCE = 32

function VillagePage({ villageState, npcState, villageRevealState, tutorialState, successToast, captureOpen = false, onCapture, onRetryVillage, onTalkToNpc, onCloseNpcDialogue, onLeaveNpcRange, onTutorialEvent, onMove, onMovementEnd }) {
  const [activePanel, setActivePanel] = useState('NONE')
  const [templateDialogue, setTemplateDialogue] = useState(null)
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

  const talkInteraction = useMemo(() => (villageState.worldState?.availableInteractions || []).find((interaction) => (
    interaction?.available === true && interaction.type === 'TALK' && interaction.targetId != null
  )) || null, [villageState.worldState?.availableInteractions])
  const templateDialogueContent = templateDialogue ? resolveNpcDialogue(templateDialogue) : null
  const closeActivePanel = useCallback(() => { setActivePanel('NONE'); setTemplateDialogue(null) }, [])
  const openMemoryUpload = useCallback(() => { closeActivePanel(); onCapture() }, [closeActivePanel, onCapture])
  const openTemplateDialogue = useCallback(() => { if (!talkInteraction || captureOpen) return; setActivePanel('DIALOGUE'); setTemplateDialogue(talkInteraction) }, [captureOpen, talkInteraction])
  const openInspect = useCallback(() => { if (captureOpen) return; setTemplateDialogue(null); setActivePanel('INSPECT') }, [captureOpen])

  useEffect(() => {
    if (!showNpcDialogue && npcState.isOpen) {
      onLeaveNpcRange()
    }
  }, [npcState.isOpen, onLeaveNpcRange, showNpcDialogue])

  useEffect(() => {
    if (templateDialogue && (!talkInteraction || talkInteraction.targetId !== templateDialogue.targetId)) closeActivePanel()
  }, [closeActivePanel, talkInteraction, templateDialogue])

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
        {showNpcDialogue && !shouldShowNpcPanel && (
          <div className="npc-talk-panel">
            <button type="button" onClick={onTalkToNpc} disabled={!canTalkToNpc} aria-label="모아와 대화하기">
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
              <button type="button" onClick={onTalkToNpc} disabled={!canTalkToNpc}>
                {npcState.isLoading ? '듣는 중...' : '다시 이야기하기'}
              </button>
              <button type="button" className="npc-dialogue-panel__quiet" onClick={onCloseNpcDialogue} disabled={npcState.isLoading}>
                닫기
              </button>
            </div>
          </section>
        )}
        {talkInteraction && activePanel !== 'DIALOGUE' && !shouldShowNpcPanel && (
          <div className="npc-talk-panel npc-talk-panel--template">
            <button type="button" onClick={openTemplateDialogue} aria-label={`${talkInteraction.displayName || '마을 주민'}와 대화하기`}>
              <span aria-hidden="true">💬</span><b>대화하기</b>
            </button>
          </div>
        )}
        {activePanel === 'DIALOGUE' && templateDialogueContent && (
          <section className="npc-dialogue-panel" aria-live="polite" aria-label={`${templateDialogueContent.displayName}와의 대화`}>
            <div className="npc-dialogue-panel__copy"><strong>{templateDialogueContent.displayName}</strong><p>{templateDialogueContent.message}</p></div>
            <div className="npc-dialogue-panel__actions"><button type="button" className="npc-dialogue-panel__quiet" onClick={closeActivePanel}>닫기</button></div>
          </section>
        )}
        <VirtualJoystick onMove={setJoystickVector} onStop={stopJoystick} disabled={isRevealActive} />
        <div className="village-action-bar">
          <span><i aria-hidden="true">JOY</i> 천천히 마을 산책하기</span>
          <button className="capture-icon-button" type="button" onClick={openMemoryUpload} disabled={isRevealActive} aria-label="오늘의 순간 남기기">
            <span className="pixel-camera-icon" aria-hidden="true"><i /></span>
          </button>
        </div>
      </section>
    </main>
  )
}

export default VillagePage
