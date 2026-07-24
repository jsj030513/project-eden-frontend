const FALLBACK_SCRIPT = Object.freeze({
  displayName: '마을 주민',
  lines: Object.freeze([
    '오늘도 마을을 천천히 둘러보세요.',
    '가까운 곳의 반짝임은 살펴볼 수 있어요.',
  ]),
})

const TEMPLATE_NPC_SCRIPTS = Object.freeze({
  DEFAULT_NPC_GUIDE: Object.freeze({
    displayName: '마을 안내자',
    lines: Object.freeze([
      '길을 따라 걸으며 가까운 풍경을 살펴보세요.',
      '말풍선이나 반짝임이 보이면 그 자리에서 상호작용할 수 있어요.',
      '오늘의 장면을 남기면 마을에 새로운 기억이 머물러요.',
    ]),
  }),
  DEFAULT_NPC_GARDENER: Object.freeze({
    displayName: '정원 관리인',
    lines: Object.freeze([
      '비어 있는 밭 가까이에서 밭을 살펴볼 수 있어요.',
      '꽃이나 채소가 담긴 기억은 빈 밭에 심어볼 수 있어요.',
      '이미 자란 작물도 가까이에서 천천히 둘러보세요.',
    ]),
  }),
  DEFAULT_NPC_MEMORY_KEEPER: Object.freeze({
    displayName: '기억 보관인',
    lines: Object.freeze([
      '당신이 남긴 장면은 마을의 풍경으로 이어져요.',
      '한 번 자리 잡은 기억은 다시 마을에 돌아와도 남아 있어요.',
      '새로운 기억이 생기면 마을을 다시 둘러보세요.',
    ]),
  }),
  DEFAULT_NPC_ANIMAL_CARETAKER: Object.freeze({
    displayName: '동물 돌봄이',
    lines: Object.freeze([
      '이곳의 강아지와 고양이, 새도 마을의 이웃이에요.',
      '가까이 다가가면 동물 친구들의 모습을 살펴볼 수 있어요.',
      '놀라지 않도록 천천히 다가가 주세요.',
    ]),
  }),
})

function nonBlank(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function getNpcDialogueScript(targetAssetType) {
  return TEMPLATE_NPC_SCRIPTS[targetAssetType] || FALLBACK_SCRIPT
}

export function resolveNpcDialogue(interaction, requestedIndex = 0) {
  const script = getNpcDialogueScript(interaction?.targetAssetType)
  const index = Number.isInteger(requestedIndex)
    ? Math.min(Math.max(requestedIndex, 0), script.lines.length - 1)
    : 0
  const isLastLine = index === script.lines.length - 1

  return {
    targetId: Number.isInteger(interaction?.targetId) ? interaction.targetId : null,
    targetAssetType: nonBlank(interaction?.targetAssetType) || 'UNKNOWN',
    displayName: nonBlank(interaction?.displayName) || script.displayName,
    lines: script.lines,
    lineIndex: index,
    message: script.lines[index],
    isLastLine,
    primaryActionLabel: isLastLine ? '대화 마치기' : '다음',
    closeActionLabel: '닫기',
  }
}

export function nextNpcDialogueIndex(interaction, currentIndex) {
  const script = getNpcDialogueScript(interaction?.targetAssetType)
  const normalized = Number.isInteger(currentIndex) ? Math.max(currentIndex, 0) : 0
  return Math.min(normalized + 1, script.lines.length - 1)
}

export const TEMPLATE_NPC_ASSET_TYPES = Object.freeze(Object.keys(TEMPLATE_NPC_SCRIPTS))
