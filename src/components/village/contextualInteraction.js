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
  DEFAULT_DOG: '강아지가 반갑게 꼬리를 흔들어요.',
  DEFAULT_CAT: '고양이가 조용히 마을을 바라보고 있어요.',
  DEFAULT_BIRD: '새가 주변을 살피며 지저귀고 있어요.',
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

function nonBlank(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
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

  return {
    ...hud,
    displayName: (targetAssetType && ASSET_TITLES[targetAssetType]) || hud.displayName,
    description: (targetAssetType && ASSET_DESCRIPTIONS[targetAssetType])
      || (category && CATEGORY_DESCRIPTIONS[category])
      || FALLBACK_COPY.description,
    primaryActionLabel: isEmptyFarm ? '사진으로 기억 심기' : null,
  }
}
