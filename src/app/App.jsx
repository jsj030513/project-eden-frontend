import { useCallback, useEffect, useRef, useState } from 'react'
import AppShell from '../components/layout/AppShell'
import DevelopmentLoginPanel from '../components/auth/DevelopmentLoginPanel'
import TutorialOverlay from '../components/tutorial/TutorialOverlay'
import { createInitialTutorialState, TUTORIAL_EVENTS, TUTORIAL_STEPS, TUTORIAL_STORAGE_KEY } from '../constants/tutorialSteps'
import LandingPage from '../pages/LandingPage'
import VillagePage from '../pages/VillagePage'
import CapturePage from '../pages/CapturePage'
import { login, signup } from '../api/authApi'
import { createCharacter, getMyCharacter } from '../api/characterApi'
import { clearAccessToken, getAccessToken } from '../api/httpClient'
import { getMyNpcs, getNpcDialogue } from '../api/npcApi'
import { uploadPhoto } from '../api/photoApi'
import { recognizePhoto } from '../api/recognitionApi'
import { getVillageChanges, getVillageHistory, getVillageInterpretation, getMyVillage } from '../api/villageApi'
import { createHouse, createInventory, createWorld, getMyHouse, getMyInventory, getMyWorld, getMyWorldState, moveMyPlayer } from '../api/worldApi'

const PAGES = {
  LANDING: 'landing',
  AUTH: 'auth',
  VILLAGE: 'village',
  CAPTURE: 'capture',
}

const AUTH_ERROR_MESSAGE = '마을로 들어가는 길을 다시 확인해주세요.'
const VILLAGE_ERROR_MESSAGE = '마을의 풍경을 잠시 불러오지 못했습니다.'
const PARTIAL_VILLAGE_ERROR_MESSAGE = '마을의 일부 풍경을 아직 불러오지 못했습니다.'
const PHOTO_ERROR_MESSAGE = '이 순간이 아직 마을에 닿지 못했습니다.'
const RECOGNITION_ERROR_MESSAGE = '이 순간을 바라보는 데 조금 더 시간이 필요한 것 같아요.'
const UNKNOWN_RECOGNITION_MESSAGE = '이름을 붙이지 못한 순간도\n마을에는 조용히 남을 수 있어요.'
const NETWORK_RECOGNITION_MESSAGE = '마을로 이어지는 길이 잠시 멀어졌어요.'
const SERVER_RECOGNITION_MESSAGE = '이 순간을 바라보는 데 조금 더 시간이 필요한 것 같아요.'
const FILE_TOO_LARGE_MESSAGE = '사진이 조금 커서 마을까지 닿지 못했어요.'

const DEFAULT_REVEAL_MESSAGE = '오늘의 순간이 마을 한편에 머물기 시작했습니다.'
const CATEGORY_REVEAL_MESSAGES = {
  NATURE: '꽃 한 송이가 조용히 자리를 잡았습니다.',
  FOOD: '따뜻한 향기가 마을에 오래 머물고 있습니다.',
  WALK: '작은 길 하나가 조금 더 멀리 이어졌습니다.',
  WATER: '물가에 새로운 바람이 머물기 시작했습니다.',
  ANIMAL: '작은 발자국 하나가 마을을 지나갔습니다.',
  STUDY: '조용히 쌓인 시간이\n마을의 한편에 머물기 시작했습니다.',
  WORK: '오늘의 노력이\n작은 불빛이 되어 남았습니다.',
  UNKNOWN: '이름 붙이지 못한 순간도\n마을 한편에 조용히 머물렀습니다.',
  GENERAL_MEMORY: DEFAULT_REVEAL_MESSAGE,
}
const THEME_REVEAL_MESSAGES = {
  BLOOMING_VILLAGE: '마을 곳곳에 꽃이 피어나기 시작했습니다.',
  WARM_VILLAGE: '따뜻한 불빛이 마을의 저녁을 채우기 시작했습니다.',
  WALKING_VILLAGE: '길들이 서로의 끝을 기억하기 시작했습니다.',
  WATERSIDE_VILLAGE: '물가의 소리가 마을 가까이 다가왔습니다.',
  ANIMAL_FRIENDLY_VILLAGE: '작은 친구들이 머물 자리를 발견했습니다.',
  QUIET_VILLAGE: '조용한 순간들이 마을의 풍경이 되었습니다.',
}

function emptyRevealState() {
  return {
    isPending: false,
    isPlaying: false,
    previousVillage: null,
    nextVillage: null,
    previousInterpretation: null,
    nextInterpretation: null,
    changeType: null,
    objectType: null,
    category: null,
    themeChanged: false,
    message: null,
  }
}

function normalizeCategory(value) {
  const normalized = String(value || '').toUpperCase()

  if (['NATURE', 'FLOWER', 'PLANT', 'GARDEN', 'BLOOMING'].some((token) => normalized.includes(token))) return 'NATURE'
  if (['FOOD', 'MEAL', 'DISH', 'TABLE', 'BAKERY', 'CAFE', 'COOK'].some((token) => normalized.includes(token))) return 'FOOD'
  if (['WALK', 'PATH', 'ROAD', 'BENCH', 'SIGN'].some((token) => normalized.includes(token))) return 'WALK'
  if (['WATER', 'POND', 'RIVER', 'SEA', 'BRIDGE', 'HARBOR'].some((token) => normalized.includes(token))) return 'WATER'
  if (['ANIMAL', 'CAT', 'DOG', 'BIRD', 'PET', 'PAW'].some((token) => normalized.includes(token))) return 'ANIMAL'
  if (['STUDY', 'BOOK', 'NOTEBOOK', 'READING', 'LECTURE', 'WRITING', 'LIBRARY', 'SCHOOL', 'CLASS', 'EXAM', 'MEMO'].some((token) => normalized.includes(token))) return 'STUDY'
  if (['WORK', 'LAPTOP', 'COMPUTER', 'CODING', 'PROGRAMMING', 'DESK', 'OFFICE', 'MEETING', 'WORKSPACE', 'PROJECT', 'DEVELOPER'].some((token) => normalized.includes(token))) return 'WORK'

  return value ? 'UNKNOWN' : null
}

function getTheme(interpretation) {
  return interpretation?.theme || interpretation?.currentTheme || interpretation?.villageTheme || null
}

function getThemeCategory(theme) {
  return {
    BLOOMING_VILLAGE: 'NATURE',
    WARM_VILLAGE: 'FOOD',
    WALKING_VILLAGE: 'WALK',
    WATERSIDE_VILLAGE: 'WATER',
    ANIMAL_FRIENDLY_VILLAGE: 'ANIMAL',
    QUIET_VILLAGE: 'UNKNOWN',
  }[theme] || null
}

function getChangeKey(change) {
  return String(change?.id ?? change?.changeId ?? change?.type ?? change?.changeType ?? JSON.stringify(change))
}

function getNewestChange(previousChanges = [], nextChanges = []) {
  const previousKeys = new Set(previousChanges.map(getChangeKey))
  return nextChanges.find((change) => !previousKeys.has(getChangeKey(change))) || null
}

function getChangeObjectType(change, category) {
  const rawType = String(change?.changeType || change?.type || change?.objectType || '').toUpperCase()

  if (rawType.includes('FLOWER') || rawType.includes('GARDEN')) return 'FLOWER_PATH'
  if (rawType.includes('TABLE') || rawType.includes('BAKERY') || rawType.includes('CAFE')) return 'TABLE'
  if (rawType.includes('BENCH') || rawType.includes('SIGN') || rawType.includes('PATH')) return 'BENCH'
  if (rawType.includes('BRIDGE') || rawType.includes('WATER') || rawType.includes('HARBOR')) return 'SMALL_BRIDGE'
  if (rawType.includes('CAT') || rawType.includes('BIRD') || rawType.includes('ANIMAL') || rawType.includes('SHELTER')) return 'CAT_SPOT'
  if (rawType.includes('QUIET')) return 'QUIET_PLACE'

  return {
    NATURE: 'FLOWER_PATH',
    FOOD: 'TABLE',
    WALK: 'BENCH',
    WATER: 'SMALL_BRIDGE',
    ANIMAL: 'CAT_SPOT',
    STUDY: 'QUIET_PLACE',
    WORK: 'QUIET_PLACE',
    UNKNOWN: 'QUIET_PLACE',
  }[category] || 'QUIET_PLACE'
}

function buildRevealState(previousState, nextState, recognition) {
  const worldChange = recognition?.worldChange
  const previousTheme = getTheme(previousState.interpretation)
  const nextTheme = getTheme(nextState.interpretation)
  const themeChanged = Boolean(nextTheme && previousTheme !== nextTheme)
  const newestChange = getNewestChange(previousState.changes, nextState.changes)
  const rawCategory = worldChange?.worldCategory
    || newestChange?.category
    || newestChange?.memoryCategory
    || nextState.interpretation?.primaryCategory
    || nextState.interpretation?.rememberedCategory
    || recognition?.recognizedObject
    || recognition?.category
    || getThemeCategory(nextTheme)
  const normalizedCategory = normalizeCategory(rawCategory) || 'GENERAL_MEMORY'
  const category = normalizedCategory === 'UNKNOWN' ? 'GENERAL_MEMORY' : normalizedCategory
  const changeType = themeChanged ? 'THEME_CHANGE' : category
  const objectType = worldChange?.assetType || getChangeObjectType(newestChange, category)
  const message = worldChange?.displayMessage || (themeChanged
    ? THEME_REVEAL_MESSAGES[nextTheme] || DEFAULT_REVEAL_MESSAGE
    : CATEGORY_REVEAL_MESSAGES[category] || DEFAULT_REVEAL_MESSAGE)

  return {
    ...emptyRevealState(),
    isPending: true,
    previousVillage: previousState.village,
    nextVillage: nextState.village,
    previousInterpretation: previousState.interpretation,
    nextInterpretation: nextState.interpretation,
    changeType,
    objectType,
    category,
    themeChanged,
    message,
    focusPosition: worldChange ? { x: worldChange.focusX, y: worldChange.focusY } : null,
  }
}

function emptyCaptureState() {
  return {
    status: 'idle',
    uploadedPhotoId: null,
    recognition: null,
    retryCount: 0,
    isUploading: false,
    error: null,
  }
}

function getPhotoId(photo) {
  return photo?.photoId ?? photo?.id ?? null
}

function isUnknownRecognition(recognition) {
  const recognizedObject = String(recognition?.recognizedObject || '').toUpperCase()
  // OBJECT + UNKNOWN category is the backend's explicit GENERAL_MEMORY
  // fallback: the image was processed successfully, but no specific thing was
  // claimed.  It must continue through the normal reveal flow rather than
  // presenting a false technical recognition failure.
  return recognizedObject === 'UNKNOWN' || recognition?.recognized === false
}

function getCaptureFailure(error, failedStep) {
  if (error?.status === 401) return { status: 'auth-error', message: error.message || AUTH_ERROR_MESSAGE }
  if (error?.status === 413) return { status: 'file-too-large', message: FILE_TOO_LARGE_MESSAGE }
  if (error?.status === 400 || error?.status === 415) {
    return {
      status: 'input-error',
      message: error?.message || '사진 형식을 확인한 뒤 다시 선택해 주세요.',
    }
  }
  if (error?.type === 'NETWORK') return { status: 'network-error', message: NETWORK_RECOGNITION_MESSAGE }
  if (error?.status >= 500) return { status: 'server-error', message: SERVER_RECOGNITION_MESSAGE }

  return {
    status: 'server-error',
    message: failedStep === 'RECOGNITION_FAILED'
      ? RECOGNITION_ERROR_MESSAGE
      : failedStep === 'VILLAGE_REFRESH_FAILED'
        ? VILLAGE_ERROR_MESSAGE
        : error?.message || PHOTO_ERROR_MESSAGE,
  }
}

function readTutorialCompleted() {
  try {
    return window.sessionStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function markTutorialCompleted() {
  try {
    window.sessionStorage.setItem(TUTORIAL_STORAGE_KEY, 'true')
  } catch {
    // sessionStorage can be unavailable in private or restricted contexts.
  }
}

function App() {
  const toastTimerRef = useRef(null)
  const revealStartTimerRef = useRef(null)
  const revealEndTimerRef = useRef(null)
  const [page, setPage] = useState(PAGES.LANDING)
  const [authState, setAuthState] = useState({
    accessToken: getAccessToken(),
    isAuthenticated: Boolean(getAccessToken()),
    isAuthLoading: false,
    authError: null,
  })
  const [authMode, setAuthMode] = useState('login')
  const [characterState, setCharacterState] = useState({
    character: null,
    isReady: false,
    isLoading: false,
    error: null,
  })
  const [captureState, setCaptureState] = useState(emptyCaptureState)
  const [villageState, setVillageState] = useState({
    village: null,
    interpretation: null,
    changes: [],
    history: [],
    notice: null,
    isLoading: false,
    error: null,
    worldState: null,
  })
  const [npcState, setNpcState] = useState({
    npcId: null,
    npcs: [],
    isOpen: false,
    dialogue: null,
    isLoading: false,
    error: null,
  })
  const [successToast, setSuccessToast] = useState(false)
  const [villageRevealState, setVillageRevealState] = useState(emptyRevealState)
  const [tutorialState, setTutorialState] = useState(() => createInitialTutorialState(readTutorialCompleted()))

  const completeTutorial = useCallback(() => {
    markTutorialCompleted()
    setTutorialState((current) => ({
      ...current,
      isActive: false,
      isCompleted: true,
      currentStep: TUTORIAL_STEPS.COMPLETE,
    }))
  }, [])

  const handleTutorialEvent = useCallback((eventName) => {
    setTutorialState((current) => {
      if (!current.isActive || current.isCompleted) return current

      if (eventName === TUTORIAL_EVENTS.SKIPPED || eventName === TUTORIAL_EVENTS.FINISHED) {
        markTutorialCompleted()
        return {
          ...current,
          isActive: false,
          isCompleted: true,
          currentStep: TUTORIAL_STEPS.COMPLETE,
        }
      }

      if (eventName === TUTORIAL_EVENTS.START && current.currentStep === TUTORIAL_STEPS.WELCOME) {
        return { ...current, currentStep: TUTORIAL_STEPS.MOVE }
      }

      if (eventName === TUTORIAL_EVENTS.MOVED && current.currentStep === TUTORIAL_STEPS.MOVE) {
        return { ...current, hasMoved: true, currentStep: TUTORIAL_STEPS.APPROACH_NPC }
      }

      if (eventName === TUTORIAL_EVENTS.APPROACHED_NPC && current.currentStep === TUTORIAL_STEPS.APPROACH_NPC) {
        return { ...current, hasApproachedNpc: true, currentStep: TUTORIAL_STEPS.TALK_TO_NPC }
      }

      if (eventName === TUTORIAL_EVENTS.TALKED_TO_NPC && current.currentStep === TUTORIAL_STEPS.TALK_TO_NPC) {
        return { ...current, hasOpenedDialogue: true, currentStep: TUTORIAL_STEPS.CAPTURE_MEMORY }
      }

      if (eventName === TUTORIAL_EVENTS.ENTERED_CAPTURE && current.currentStep === TUTORIAL_STEPS.CAPTURE_MEMORY) {
        return { ...current, hasCapturedMemory: true }
      }

      if (eventName === TUTORIAL_EVENTS.SAW_REVEAL && current.currentStep === TUTORIAL_STEPS.WATCH_REVEAL) {
        return { ...current, hasSeenReveal: true, currentStep: TUTORIAL_STEPS.TALK_AGAIN }
      }

      if (eventName === TUTORIAL_EVENTS.TALKED_AFTER_REVEAL && current.currentStep === TUTORIAL_STEPS.TALK_AGAIN) {
        return {
          ...current,
          hasTalkedAfterReveal: true,
          currentStep: TUTORIAL_STEPS.COMPLETE,
        }
      }

      return current
    })
  }, [])

  const resetAuth = useCallback(() => {
    clearAccessToken()
    setAuthState({
      accessToken: null,
      isAuthenticated: false,
      isAuthLoading: false,
      authError: AUTH_ERROR_MESSAGE,
    })
    setCharacterState({ character: null, isReady: false, isLoading: false, error: null })
    setVillageState({ village: null, interpretation: null, changes: [], history: [], notice: null, isLoading: false, error: null })
    setNpcState({ npcId: null, npcs: [], isOpen: false, dialogue: null, isLoading: false, error: null })
    setVillageRevealState(emptyRevealState())
    setTutorialState(createInitialTutorialState(readTutorialCompleted()))
    setPage(PAGES.AUTH)
  }, [])

  useEffect(() => {
    window.addEventListener('project-eden:unauthorized', resetAuth)
    return () => window.removeEventListener('project-eden:unauthorized', resetAuth)
  }, [resetAuth])

  const ensureResource = async (readRequest, createRequest, missingMessage, duplicateMessage) => {
    try {
      return await readRequest()
    } catch (error) {
      if (!error.message?.includes(missingMessage)) throw error
    }

    try {
      return await createRequest()
    } catch (error) {
      if (error.message?.includes(duplicateMessage)) return null
      throw error
    }
  }

  const prepareWorldResources = async () => {
    await ensureResource(getMyWorld, createWorld, '월드를 찾을 수 없습니다.', '이미 월드가 존재합니다.')
    await ensureResource(getMyHouse, createHouse, '집을 찾을 수 없습니다.', '이미 집이 존재합니다.')
    await ensureResource(getMyInventory, createInventory, '인벤토리를 찾을 수 없습니다.', '이미 인벤토리가 존재합니다.')
  }

  const ensureCharacterReady = useCallback(async () => {
    setCharacterState((current) => ({ ...current, isLoading: true, error: null }))

    try {
      const character = await getMyCharacter()
      await prepareWorldResources()
      setCharacterState({ character, isReady: true, isLoading: false, error: null })
      setAuthMode('login')
      return character
    } catch (error) {
      if (error.status === 404 || error.message?.includes('캐릭터를 찾을 수 없습니다')) {
        setAuthMode('character')
        setCharacterState({ character: null, isReady: false, isLoading: false, error: null })
        setPage(PAGES.AUTH)
        return null
      }

      setCharacterState({ character: null, isReady: false, isLoading: false, error: error.message })
      throw error
    }
  }, [])

  const fetchVillageData = useCallback(async ({ suppressAuthRedirect = false } = {}) => {
    setVillageState((current) => ({ ...current, isLoading: true, notice: null, error: null }))

    try {
      const guardedRequestOptions = { suppressAuthRedirect }
      const village = await getMyVillage(guardedRequestOptions)
      const optionalRequestOptions = { suppressAuthRedirect: true }
      const [interpretationResult, changesResult, historyResult, npcsResult, worldStateResult] = await Promise.allSettled([
        getVillageInterpretation(optionalRequestOptions),
        getVillageChanges(optionalRequestOptions),
        getVillageHistory(optionalRequestOptions),
        getMyNpcs(optionalRequestOptions),
        getMyWorldState(optionalRequestOptions),
      ])
      const interpretation = interpretationResult.status === 'fulfilled' ? interpretationResult.value : null
      const changes = changesResult.status === 'fulfilled' ? changesResult.value : []
      const history = historyResult.status === 'fulfilled' ? historyResult.value : []
      const npcs = npcsResult.status === 'fulfilled' ? npcsResult.value : []
      const worldState = worldStateResult.status === 'fulfilled' ? worldStateResult.value : null
      const hasPartialFailure = [interpretationResult, changesResult, historyResult, npcsResult, worldStateResult]
        .some((result) => result.status === 'rejected')

      setVillageState({
        village,
        interpretation,
        changes,
        history,
        notice: hasPartialFailure ? PARTIAL_VILLAGE_ERROR_MESSAGE : null,
        isLoading: false,
        error: null,
        worldState,
      })
      setNpcState((current) => ({
        ...current,
        npcs,
        npcId: npcs[0]?.id ?? current.npcId ?? import.meta.env.VITE_DEFAULT_NPC_ID ?? '1',
        error: null,
      }))
      return { village, interpretation, changes, history, npcs, worldState }
    } catch (error) {
      setVillageState((current) => ({ ...current, isLoading: false, error: VILLAGE_ERROR_MESSAGE }))
      throw error
    }
  }, [])

  const refreshMyWorldState = useCallback(async () => {
    try {
      const worldState = await getMyWorldState({ suppressAuthRedirect: true })
      setVillageState((current) => ({ ...current, worldState }))
      return worldState
    } catch {
      // The latest server-approved movement position remains valid on refresh failure.
      return null
    }
  }, [])

  const moveMyVillagePlayer = useCallback(
    (targetX, targetY) => moveMyPlayer(targetX, targetY, { suppressAuthRedirect: true }),
    [],
  )

  const enterVillage = async () => {
    if (!authState.isAuthenticated) {
      setPage(PAGES.AUTH)
      return
    }

    try {
      const character = await ensureCharacterReady()
      if (!character) return
      setPage(PAGES.VILLAGE)
    } catch {
      setPage(PAGES.AUTH)
    }
  }

  useEffect(() => {
    if (page !== PAGES.VILLAGE || !authState.isAuthenticated || !characterState.isReady) return
    fetchVillageData().catch(() => {})
  }, [authState.isAuthenticated, characterState.isReady, fetchVillageData, page])

  const handleLogin = async (credentials) => {
    setAuthState((current) => ({ ...current, isAuthLoading: true, authError: null }))

    try {
      const response = await login(credentials)
      setAuthState({
        accessToken: response.accessToken,
        isAuthenticated: true,
        isAuthLoading: false,
        authError: null,
      })
      const character = await ensureCharacterReady()
      if (character) setPage(PAGES.VILLAGE)
    } catch (error) {
      setAuthState({ accessToken: null, isAuthenticated: false, isAuthLoading: false, authError: error.message || AUTH_ERROR_MESSAGE })
    }
  }

  const handleSignup = async (credentials) => {
    setAuthState((current) => ({ ...current, isAuthLoading: true, authError: null }))

    try {
      await signup(credentials)
      setAuthMode('login')
      setAuthState((current) => ({ ...current, isAuthLoading: false, authError: null }))
    } catch (error) {
      setAuthState({ accessToken: null, isAuthenticated: false, isAuthLoading: false, authError: error.message || AUTH_ERROR_MESSAGE })
    }
  }

  const handleCreateCharacter = async () => {
    setCharacterState((current) => ({ ...current, isLoading: true, error: null }))

    try {
      const character = await createCharacter()
      await prepareWorldResources()
      setCharacterState({ character, isReady: true, isLoading: false, error: null })
      setPage(PAGES.VILLAGE)
    } catch (error) {
      setCharacterState((current) => ({ ...current, isLoading: false, error: error.message }))
    }
  }

  const getCurrentVillageSnapshot = () => ({
      village: villageState.village,
      interpretation: villageState.interpretation,
      changes: villageState.changes,
      history: villageState.history,
      worldState: villageState.worldState,
  })

  const completeRecognizedMoment = async (recognition, previousVillageSnapshot) => {
    setCaptureState((current) => ({ ...current, status: 'refreshingVillage' }))
    let nextVillageSnapshot

    try {
      nextVillageSnapshot = await fetchVillageData({ suppressAuthRedirect: true })
    } catch (error) {
      console.warn('Village refresh failed after photo recognition', {
        step: 'VILLAGE_REFRESH_FAILED',
        status: error.status,
        type: error.type,
      })
      nextVillageSnapshot = previousVillageSnapshot
      setVillageState((current) => ({
        ...current,
        isLoading: false,
        notice: PARTIAL_VILLAGE_ERROR_MESSAGE,
        error: null,
      }))
    }

    const revealState = buildRevealState(previousVillageSnapshot, nextVillageSnapshot, recognition)

    setCaptureState((current) => ({ ...current, status: 'completed', isUploading: false, recognition }))
    setVillageRevealState(revealState)
    setTutorialState((current) => (
      current.isActive && current.currentStep === TUTORIAL_STEPS.CAPTURE_MEMORY
        ? { ...current, hasCapturedMemory: true, currentStep: TUTORIAL_STEPS.WATCH_REVEAL }
        : current
    ))
    setPage(PAGES.VILLAGE)
    window.clearTimeout(toastTimerRef.current)
    setSuccessToast(true)
    toastTimerRef.current = window.setTimeout(() => setSuccessToast(false), 4200)
  }

  const submitMoment = async (file) => {
    const previousVillageSnapshot = getCurrentVillageSnapshot()

    setCaptureState((current) => ({ ...current, status: 'uploadingPhoto', isUploading: true, error: null }))
    let failedStep = 'PHOTO_UPLOAD_FAILED'

    try {
      const photo = await uploadPhoto(file)
      const photoId = getPhotoId(photo)
      setCaptureState((current) => ({ ...current, uploadedPhotoId: photoId }))

      failedStep = 'RECOGNITION_FAILED'
      setCaptureState((current) => ({ ...current, status: 'recognizing' }))
      const recognition = await recognizePhoto(photoId, { suppressAuthRedirect: true })

      if (isUnknownRecognition(recognition)) {
        setCaptureState((current) => ({
          ...current,
          status: 'unknown',
          isUploading: false,
          recognition,
          error: UNKNOWN_RECOGNITION_MESSAGE,
        }))
        return
      }

      await completeRecognizedMoment(recognition, previousVillageSnapshot)
    } catch (error) {
      const failure = getCaptureFailure(error, failedStep)
      setCaptureState((current) => ({ ...current, status: failure.status, isUploading: false, error: failure.message }))
    }
  }

  const retryRecognition = async () => {
    if (!captureState.uploadedPhotoId || captureState.isUploading || captureState.retryCount >= 2) return

    const previousVillageSnapshot = getCurrentVillageSnapshot()
    setCaptureState((current) => ({
      ...current,
      status: 'recognizing',
      isUploading: true,
      error: null,
      retryCount: current.retryCount + 1,
    }))

    try {
      const recognition = await recognizePhoto(captureState.uploadedPhotoId, { suppressAuthRedirect: true })

      if (isUnknownRecognition(recognition)) {
        setCaptureState((current) => ({
          ...current,
          status: 'unknown',
          isUploading: false,
          recognition,
          error: UNKNOWN_RECOGNITION_MESSAGE,
        }))
        return
      }

      await completeRecognizedMoment(recognition, previousVillageSnapshot)
    } catch (error) {
      const failure = getCaptureFailure(error, 'RECOGNITION_FAILED')
      setCaptureState((current) => ({ ...current, status: failure.status, isUploading: false, error: failure.message }))
    }
  }

  const keepUnknownMoment = async () => {
    if (!captureState.recognition || captureState.isUploading) return

    const previousVillageSnapshot = getCurrentVillageSnapshot()
    setCaptureState((current) => ({ ...current, isUploading: true, error: null }))
    await completeRecognizedMoment(captureState.recognition, previousVillageSnapshot)
  }

  const fetchNpcDialogue = async () => {
    if (!npcState.npcId || npcState.isLoading) return

    setNpcState((current) => ({ ...current, isLoading: true, error: null }))

    try {
      const dialogue = await getNpcDialogue(npcState.npcId)
      setNpcState((current) => {
        if (current.dialogue?.message && current.dialogue.message === dialogue.message) {
          console.warn('Same NPC dialogue returned consecutively', dialogue.dialogueKey)
        }

        return { ...current, dialogue, isOpen: true, isLoading: false, error: null }
      })
      handleTutorialEvent(
        tutorialState.currentStep === TUTORIAL_STEPS.TALK_AGAIN
          ? TUTORIAL_EVENTS.TALKED_AFTER_REVEAL
          : TUTORIAL_EVENTS.TALKED_TO_NPC,
      )
    } catch {
      setNpcState((current) => ({
        ...current,
        isOpen: true,
        isLoading: false,
        error: '잠시 목소리가 바람에 흩어졌어요.',
      }))
    }
  }

  const closeNpcDialogue = () => {
    setNpcState((current) => current.isOpen ? { ...current, isOpen: false } : current)
  }

  const handleLeaveNpcRange = () => {
    setNpcState((current) => current.isOpen ? { ...current, isOpen: false } : current)
  }

  useEffect(() => () => {
    window.clearTimeout(toastTimerRef.current)
    window.clearTimeout(revealStartTimerRef.current)
    window.clearTimeout(revealEndTimerRef.current)
  }, [])

  useEffect(() => {
    if (page !== PAGES.VILLAGE || !villageRevealState.isPending) return undefined

    window.clearTimeout(revealStartTimerRef.current)
    window.clearTimeout(revealEndTimerRef.current)

    revealStartTimerRef.current = window.setTimeout(() => {
      setVillageRevealState((current) => current.isPending ? { ...current, isPlaying: true } : current)
    }, 380)
    revealEndTimerRef.current = window.setTimeout(() => {
      setVillageRevealState(emptyRevealState())
      handleTutorialEvent(TUTORIAL_EVENTS.SAW_REVEAL)
    }, 2350)

    return () => {
      window.clearTimeout(revealStartTimerRef.current)
      window.clearTimeout(revealEndTimerRef.current)
    }
  }, [handleTutorialEvent, page, villageRevealState.isPending])

  useEffect(() => {
    if (page === PAGES.CAPTURE) {
      handleTutorialEvent(TUTORIAL_EVENTS.ENTERED_CAPTURE)
    }
  }, [handleTutorialEvent, page])

  useEffect(() => {
    if (page !== PAGES.CAPTURE) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.target?.matches?.('input,textarea,[contenteditable=true]')) return
      event.preventDefault()
      setPage(PAGES.VILLAGE)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [page])

  const openCapture = () => {
    closeNpcDialogue()
    setPage(PAGES.CAPTURE)
  }

  useEffect(() => {
    if (tutorialState.isActive && tutorialState.currentStep === TUTORIAL_STEPS.COMPLETE) {
      const finishTimer = window.setTimeout(() => completeTutorial(), 3000)
      return () => window.clearTimeout(finishTimer)
    }

    return undefined
  }, [completeTutorial, tutorialState.currentStep, tutorialState.isActive])

  useEffect(() => {
    if (!import.meta.env.DEV) return undefined

    window.__resetEdenTutorial = () => {
      window.sessionStorage.removeItem(TUTORIAL_STORAGE_KEY)
      setTutorialState(createInitialTutorialState(false))
    }

    return () => {
      delete window.__resetEdenTutorial
    }
  }, [])

  const renderPage = () => {
    switch (page) {
      case PAGES.AUTH:
        return (
          <DevelopmentLoginPanel
            mode={authMode}
            error={authState.authError || characterState.error}
            isLoading={authState.isAuthLoading || characterState.isLoading}
            onLogin={handleLogin}
            onSignup={handleSignup}
            onModeChange={setAuthMode}
            onCreateCharacter={handleCreateCharacter}
          />
        )
      case PAGES.VILLAGE:
        return (
          <VillagePage
            villageState={villageState}
            npcState={npcState}
            villageRevealState={villageRevealState}
            tutorialState={tutorialState}
            successToast={successToast}
            captureOpen={page === PAGES.CAPTURE}
            onCapture={openCapture}
            onRetryVillage={() => fetchVillageData().catch(() => {})}
            onTalkToNpc={fetchNpcDialogue}
            onCloseNpcDialogue={closeNpcDialogue}
            onLeaveNpcRange={handleLeaveNpcRange}
            onTutorialEvent={handleTutorialEvent}
            onMove={moveMyVillagePlayer}
            onMovementEnd={refreshMyWorldState}
          />
        )
      case PAGES.CAPTURE:
        return (
          <CapturePage
            captureState={captureState}
            tutorialState={tutorialState}
            onBack={() => setPage(PAGES.VILLAGE)}
            onSubmitMoment={submitMoment}
            onRetryRecognition={retryRecognition}
            onKeepUnknownMoment={keepUnknownMoment}
            onAuthError={resetAuth}
            onResetCapture={() => setCaptureState(emptyCaptureState())}
          />
        )
      default:
        return <LandingPage onStart={enterVillage} />
    }
  }

  return (
    <AppShell currentPage={page} onLogoClick={() => setPage(PAGES.LANDING)}>
      {renderPage()}
      <TutorialOverlay
        tutorialState={tutorialState}
        page={page}
        onAdvance={() => handleTutorialEvent(tutorialState.currentStep === TUTORIAL_STEPS.COMPLETE ? TUTORIAL_EVENTS.FINISHED : TUTORIAL_EVENTS.START)}
        onSkip={() => handleTutorialEvent(TUTORIAL_EVENTS.SKIPPED)}
      />
    </AppShell>
  )
}

export default App
