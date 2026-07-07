function VillageStatusText({ hasCaptured }) {
  return (
    <div className="village-status">
      <span aria-hidden="true">✦</span>
      <p>{hasCaptured ? '꽃이 이 마을을 참 좋아하는 것 같네요.' : '아직 마을은 조용히 당신의 첫 순간을 기다리고 있습니다.'}</p>
    </div>
  )
}

export default VillageStatusText
