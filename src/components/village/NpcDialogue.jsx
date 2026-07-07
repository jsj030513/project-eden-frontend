function NpcDialogue() {
  return (
    <div className="npc-wrap">
      <div className="npc-dialogue" role="status">
        <strong>모아</strong>
        <p>안녕! 네가 오기를 기다렸어.<br />오늘은 어떤 하루였어?</p>
      </div>
      <div className="npc" aria-label="마을 주민 모아">
        <span className="npc__hair" /><span className="npc__face" /><span className="npc__body" />
      </div>
    </div>
  )
}

export default NpcDialogue
