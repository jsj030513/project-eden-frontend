import { TUTORIAL_STEPS } from '../../constants/tutorialSteps'

const STEP_COPY = {
  [TUTORIAL_STEPS.WELCOME]: {
    eyebrow: '처음 오셨군요.',
    message: '이 마을은\n당신의 순간을 기억하며 자랍니다.',
    action: '천천히 둘러보기',
  },
  [TUTORIAL_STEPS.MOVE]: {
    message: '화면 왼쪽을 가볍게 누르고\n손가락을 움직여보세요.',
    hotspot: 'joystick',
  },
  [TUTORIAL_STEPS.APPROACH_NPC]: {
    message: '마을 주민이 당신을 기다리고 있어요.',
    hotspot: 'npc',
  },
  [TUTORIAL_STEPS.TALK_TO_NPC]: {
    message: '조용히 말을 걸어볼까요?',
    hotspot: 'talk',
  },
  [TUTORIAL_STEPS.CAPTURE_MEMORY]: {
    message: '오늘의 순간 하나를\n마을에 남겨볼까요?',
    hotspot: 'camera',
  },
  [TUTORIAL_STEPS.WATCH_REVEAL]: {
    message: '당신의 오늘이\n마을 한편에 머물기 시작했습니다.',
  },
  [TUTORIAL_STEPS.TALK_AGAIN]: {
    message: '이제 주민에게 다시 말을 걸어보세요.\n조금 전과 다른 이야기를 들려줄지도 몰라요.',
    hotspot: 'talk',
  },
  [TUTORIAL_STEPS.COMPLETE]: {
    message: '이제 이 마을은\n당신의 순간을 기억하기 시작했습니다.',
    action: '마을에서 더 머물기',
  },
}

function TutorialOverlay({ tutorialState, page, onAdvance, onSkip }) {
  if (!tutorialState?.isActive) return null
  if (page !== 'village' && page !== 'capture') return null

  const copy = STEP_COPY[tutorialState.currentStep]
  if (!copy) return null

  const isWelcome = tutorialState.currentStep === TUTORIAL_STEPS.WELCOME
  const isComplete = tutorialState.currentStep === TUTORIAL_STEPS.COMPLETE
  const isCapture = page === 'capture'
  const shellClass = [
    'tutorial-overlay',
    `tutorial-overlay--${tutorialState.currentStep.toLowerCase().replaceAll('_', '-')}`,
    isCapture ? 'tutorial-overlay--capture' : 'tutorial-overlay--village',
  ].join(' ')

  return (
    <div className={shellClass} aria-live="polite">
      <button className="tutorial-skip" type="button" onClick={onSkip}>
        지금은 둘러볼게요
      </button>
      {copy.hotspot && <span className={`tutorial-hotspot tutorial-hotspot--${copy.hotspot}`} aria-hidden="true" />}
      <section className={`tutorial-card${isWelcome || isComplete ? ' tutorial-card--center' : ''}`}>
        {copy.eyebrow && <p className="tutorial-card__eyebrow">{copy.eyebrow}</p>}
        <p>{copy.message}</p>
        {copy.action && (
          <button type="button" onClick={onAdvance}>
            {copy.action}
          </button>
        )}
      </section>
    </div>
  )
}

export default TutorialOverlay
