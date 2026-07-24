export const TUTORIAL_STORAGE_KEY = 'projectEdenTutorialCompleted'

export const TUTORIAL_STEPS = {
  WELCOME: 'WELCOME',
  MOVE: 'MOVE',
  APPROACH_NPC: 'APPROACH_NPC',
  TALK_TO_NPC: 'TALK_TO_NPC',
  CAPTURE_MEMORY: 'CAPTURE_MEMORY',
  WATCH_REVEAL: 'WATCH_REVEAL',
  TALK_AGAIN: 'TALK_AGAIN',
  COMPLETE: 'COMPLETE',
}

export const TUTORIAL_EVENTS = {
  START: 'START',
  MOVED: 'MOVED',
  APPROACHED_NPC: 'APPROACHED_NPC',
  TALKED_TO_NPC: 'TALKED_TO_NPC',
  ENTERED_CAPTURE: 'ENTERED_CAPTURE',
  SAW_REVEAL: 'SAW_REVEAL',
  TALKED_AFTER_REVEAL: 'TALKED_AFTER_REVEAL',
  FINISHED: 'FINISHED',
  SKIPPED: 'SKIPPED',
}

export function createInitialTutorialState(isCompleted = false) {
  return {
    isActive: !isCompleted,
    currentStep: isCompleted ? TUTORIAL_STEPS.COMPLETE : TUTORIAL_STEPS.WELCOME,
    hasMoved: false,
    hasApproachedNpc: false,
    hasOpenedDialogue: false,
    hasCapturedMemory: false,
    hasSeenReveal: false,
    hasTalkedAfterReveal: false,
    isCompleted,
  }
}
