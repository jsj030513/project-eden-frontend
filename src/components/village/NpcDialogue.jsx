const RELATIONSHIP_LABELS = {
  STRANGER: '낯선 사이',
  ACQUAINTANCE: '아는 사이',
  FRIEND: '친구',
  CLOSE_FRIEND: '가까운 친구',
  BEST_FRIEND: '소중한 친구',
}

const QUEST_STATUS_LABELS = {
  AVAILABLE: '진행 가능',
  ACTIVE: '진행 중',
  COMPLETED: '완료',
  LOCKED: '잠김',
}

function NpcRelationship({ relationship }) {
  if (!relationship) return null
  const quests = relationship.quests || []
  const activeQuests = quests.filter((quest) => quest.status === 'ACTIVE' || quest.status === 'AVAILABLE')
  const completedQuests = quests.filter((quest) => quest.status === 'COMPLETED')
  const lockedQuests = quests.filter((quest) => quest.status === 'LOCKED')

  const renderQuest = (quest) => (
    <li key={quest.questId} data-quest-status={quest.status}>
      <span>{quest.title}</span>
      <small>
        {QUEST_STATUS_LABELS[quest.status] || quest.status}
        {(quest.status === 'ACTIVE' || quest.status === 'COMPLETED')
          && ` · ${quest.progress}/${quest.target}`}
      </small>
    </li>
  )

  return (
    <aside className="npc-relationship" aria-label="주민 관계와 퀘스트">
      <div className="npc-relationship__affinity">
        <strong>{RELATIONSHIP_LABELS[relationship.level] || relationship.relationship}</strong>
        <span aria-label={`호감도 ${relationship.currentAffinity} / ${relationship.maxAffinity}`}>
          ♥ {relationship.currentAffinity} / {relationship.maxAffinity}
        </span>
      </div>
      <div
        className="npc-relationship__meter"
        role="progressbar"
        aria-label={`${relationship.relationship || RELATIONSHIP_LABELS[relationship.level]} 호감도`}
        aria-valuemin="0"
        aria-valuemax={relationship.maxAffinity}
        aria-valuenow={relationship.currentAffinity}
      >
        <i style={{ width: `${Math.min(100, (relationship.currentAffinity / relationship.maxAffinity) * 100)}%` }} />
      </div>
      {activeQuests.length > 0 && (
        <section>
          <h3>진행 중인 부탁</h3>
          <ul>{activeQuests.map(renderQuest)}</ul>
        </section>
      )}
      {completedQuests.length > 0 && (
        <details>
          <summary>완료한 부탁 {completedQuests.length}</summary>
          <ul>{completedQuests.map(renderQuest)}</ul>
        </details>
      )}
      {lockedQuests.length > 0 && (
        <details>
          <summary>아직 잠긴 부탁 {lockedQuests.length}</summary>
          <ul>{lockedQuests.map(renderQuest)}</ul>
        </details>
      )}
    </aside>
  )
}

function NpcDialogue({ dialogue, relationship = null, onNext, onChoice, onClose, isLoading = false, error = null }) {
  if (!dialogue) return null
  return (
    <section
      className="npc-dialogue-panel template-npc-dialogue-panel"
      aria-live="polite"
      aria-label={`${dialogue.displayName}와의 대화`}
      data-target-asset-type={dialogue.targetAssetType}
      data-dialogue-line-index={dialogue.lineIndex}
      data-npc-activity={dialogue.activity || 'IDLE'}
    >
      <div className="npc-dialogue-panel__copy">
        <h2>{dialogue.displayName}{dialogue.activity && <small>{dialogue.activity}</small>}</h2>
        <p>{dialogue.message}</p>
        {error && <p role="alert">{error}</p>}
        <NpcRelationship relationship={relationship} />
      </div>
      <div className="npc-dialogue-panel__actions">
        {dialogue.choices?.length ? dialogue.choices.map((choice, index) => (
          <button
            key={choice.id}
            type="button"
            onClick={() => onChoice?.(choice.id)}
            disabled={isLoading}
            autoFocus={index === 0}
          >
            {choice.label}
          </button>
        )) : (
          <button type="button" onClick={dialogue.isLastLine ? onClose : onNext} disabled={isLoading} autoFocus>
            {isLoading ? '대화 중…' : dialogue.primaryActionLabel}
          </button>
        )}
        {!dialogue.isLastLine && (
          <button
            type="button"
            className="npc-dialogue-panel__quiet"
            onClick={onClose}
            aria-label={`${dialogue.displayName} 대화 닫기`}
          >
            {dialogue.closeActionLabel}
          </button>
        )}
      </div>
    </section>
  )
}

export default NpcDialogue
