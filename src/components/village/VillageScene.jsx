function VillageScene({ compact = false }) {
  return (
    <div className={`village-scene${compact ? ' village-scene--compact' : ''}`}>
      <div className="cloud cloud--one" /><div className="cloud cloud--two" />
      <div className="mountain mountain--back" /><div className="mountain mountain--front" />
      <div className="ground ground--far" /><div className="ground ground--near" />
      <div className="path" />
      <div className="house house--left"><span className="roof" /><span className="chimney" /><span className="door" /><span className="window" /></div>
      <div className="house house--right"><span className="roof" /><span className="door" /><span className="window" /></div>
      <div className="tree tree--one"><span /><i /></div>
      <div className="tree tree--two"><span /><i /></div>
      <div className="tree tree--three"><span /><i /></div>
      <div className="flowers flowers--one">✦ · ✦</div><div className="flowers flowers--two">· ✦ ·</div>
      <div className="pixel-spark spark--one">+</div><div className="pixel-spark spark--two">+</div>
    </div>
  )
}

export default VillageScene
