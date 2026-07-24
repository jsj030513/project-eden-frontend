const HUD_INTERACTION_TYPES = new Set(['TALK', 'INTERACT'])

const FALLBACK_COPY = Object.freeze({
  displayName: '살펴볼 대상',
  actionLabel: '살펴보기',
  description: '마을에 놓인 대상을 천천히 살펴보세요.',
})

const ASSET_DESCRIPTIONS = Object.freeze({
  FARM_PLOT_EMPTY: '아직 아무 기억도 심어지지 않은 밭이에요.',
  FARM_CARROT: '당근이 건강하게 자라고 있어요.',
  FARM_FLOWER: '꽃들이 마을에 색을 더하고 있어요.',
  FARM_VEGETABLE: '여러 채소가 함께 자라고 있어요.',
  FARM_TOMATO: '토마토가 햇빛을 받으며 익어가고 있어요.',
  FARM_CABBAGE: '양배추 잎이 단단하게 여물고 있어요.',
  DEFAULT_DOG: '마을을 지켜보며 조용히 쉬고 있는 강아지예요.',
  DEFAULT_CAT: '따뜻한 햇볕 아래에서 편안히 쉬고 있는 고양이예요.',
  DEFAULT_BIRD: '마을의 작은 소리를 들으며 주변을 바라보는 새예요.',
  COMMUNITY_HOUSE: '친구들의 기억과 활동이 모이는 마을 공간이에요.',
})

const CATEGORY_DESCRIPTIONS = Object.freeze({
  FARM: ASSET_DESCRIPTIONS.FARM_PLOT_EMPTY,
  CROP: '마을에서 정성껏 자라고 있는 작물이에요.',
  ANIMAL: '마을에서 지내는 동물 친구예요.',
  COMMUNITY: ASSET_DESCRIPTIONS.COMMUNITY_HOUSE,
})

const ASSET_TITLES = Object.freeze({
  COMMUNITY_HOUSE: '커뮤니티 하우스',
})

const ANIMAL_COPY = Object.freeze({
  DEFAULT_DOG: Object.freeze({
    displayName: '강아지',
    description: ASSET_DESCRIPTIONS.DEFAULT_DOG,
  }),
  DEFAULT_CAT: Object.freeze({
    displayName: '고양이',
    description: ASSET_DESCRIPTIONS.DEFAULT_CAT,
  }),
  DEFAULT_BIRD: Object.freeze({
    displayName: '새',
    description: ASSET_DESCRIPTIONS.DEFAULT_BIRD,
  }),
})

function nonBlank(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function historyDateLabel(value) {
  const normalized = nonBlank(value)
  if (!normalized || !Number.isFinite(Date.parse(normalized))) return null
  const date = normalized.slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.replaceAll('-', '.') : null
}

export function normalizeVillageHistory(history) {
  if (!Array.isArray(history)) return []
  return history.flatMap((item, originalIndex) => {
    if (!item || typeof item !== 'object') return []
    const message = nonBlank(item.message)
    if (!message) return []
    const createdAt = nonBlank(item.createdAt)
    const timestamp = createdAt && Number.isFinite(Date.parse(createdAt)) ? Date.parse(createdAt) : null
    return [{
      key: `${item.id ?? 'history'}-${originalIndex}`,
      message,
      historyType: nonBlank(item.historyType),
      category: nonBlank(item.category),
      changeType: nonBlank(item.changeType),
      createdAt: timestamp === null ? null : createdAt,
      dateLabel: historyDateLabel(createdAt),
      timestamp,
      originalIndex,
    }]
  })
}

export function selectRecentVillageHistory(history, limit = 3) {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 3
  return normalizeVillageHistory(history)
    .sort((left, right) => (
      (right.timestamp ?? Number.NEGATIVE_INFINITY) - (left.timestamp ?? Number.NEGATIVE_INFINITY)
      || left.originalIndex - right.originalIndex
    ))
    .slice(0, safeLimit)
}

export function resolveAnimalCopy(targetAssetType) {
  return ANIMAL_COPY[targetAssetType] || Object.freeze({
    displayName: '동물 친구',
    description: CATEGORY_DESCRIPTIONS.ANIMAL,
  })
}

export function selectCurrentHudInteraction(interactions) {
  if (!Array.isArray(interactions)) return null
  return interactions.find((interaction) => (
    interaction?.available === true && HUD_INTERACTION_TYPES.has(interaction.type)
  )) || null
}

export function interactionMatches(left, right) {
  if (!left || !right) return false
  return left.type === right.type
    && left.targetId === right.targetId
    && left.targetAssetType === right.targetAssetType
    && left.x === right.x
    && left.y === right.y
}

export function resolveHudInteraction(interaction) {
  const isTalk = interaction?.type === 'TALK'
  return {
    displayName: nonBlank(interaction?.displayName) || (isTalk ? '마을 주민' : FALLBACK_COPY.displayName),
    actionLabel: nonBlank(interaction?.actionLabel) || (isTalk ? '대화하기' : FALLBACK_COPY.actionLabel),
  }
}

export function resolveContextualInteraction(interaction) {
  const hud = resolveHudInteraction(interaction)
  const targetAssetType = nonBlank(interaction?.targetAssetType)
  const category = nonBlank(interaction?.category)
  const isEmptyFarm = category === 'FARM' && targetAssetType === 'FARM_PLOT_EMPTY'
  const animal = category === 'ANIMAL' ? resolveAnimalCopy(targetAssetType) : null

  return {
    ...hud,
    displayName: animal?.displayName
      || (targetAssetType && ASSET_TITLES[targetAssetType])
      || hud.displayName,
    description: animal?.description
      || (targetAssetType && ASSET_DESCRIPTIONS[targetAssetType])
      || (category && CATEGORY_DESCRIPTIONS[category])
      || FALLBACK_COPY.description,
    primaryActionLabel: isEmptyFarm ? '사진으로 기억 심기' : null,
  }
}
