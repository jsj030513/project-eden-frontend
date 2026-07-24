function NpcDialogue({ dialogue, onNext, onClose }) {
  if (!dialogue) return null
  return (
    <section
      className="npc-dialogue-panel template-npc-dialogue-panel"
      aria-live="polite"
      aria-label={`${dialogue.displayName}와의 대화`}
      data-target-asset-type={dialogue.targetAssetType}
      data-dialogue-line-index={dialogue.lineIndex}
    >
      <div className="npc-dialogue-panel__copy">
        <h2>{dialogue.displayName}</h2>
        <p>{dialogue.message}</p>
      </div>
      <div className="npc-dialogue-panel__actions">
        <button type="button" onClick={dialogue.isLastLine ? onClose : onNext} autoFocus>
          {dialogue.primaryActionLabel}
        </button>
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
