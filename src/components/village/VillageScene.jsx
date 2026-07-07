const trees = ['tree--a', 'tree--b', 'tree--c', 'tree--d', 'tree--e', 'tree--f', 'tree--g']
const flowerBeds = ['flowers--a', 'flowers--b', 'flowers--c']

function PixelTree({ className }) {
  return <div className={`pixel-tree ${className}`}><i /><i /><i /><span /></div>
}

function PixelPerson({ npc = false }) {
  return (
    <div className={`pixel-person ${npc ? 'pixel-npc' : 'pixel-character'}`} aria-label={npc ? '마을 주민 모아' : '마을을 걷는 나'}>
      <i className="person-hair" /><i className="person-face" /><i className="person-shirt" /><i className="person-legs" />
    </div>
  )
}

function VillageScene({ compact = false }) {
  return (
    <div className={`village-scene${compact ? ' village-scene--compact' : ''}`}>
      <div className="pixel-sky"><span className="pixel-sun" /><span className="distant-hill distant-hill--one" /><span className="distant-hill distant-hill--two" /></div>
      <div className="grass-tiles" />
      <div className="pixel-path pixel-path--main" /><div className="pixel-path pixel-path--branch" />
      <div className="pixel-water"><i /><i /><i /></div>
      <div className="pixel-bridge"><i /><i /><i /><i /></div>
      <div className="pixel-house">
        <span className="house-roof" /><span className="house-roof-light" /><span className="house-chimney" />
        <span className="house-wall" /><span className="house-beam house-beam--one" /><span className="house-beam house-beam--two" />
        <span className="house-window house-window--one" /><span className="house-window house-window--two" /><span className="house-door" /><span className="house-step" />
      </div>
      <div className="pixel-fence fence--left">{Array.from({ length: 7 }, (_, i) => <i key={i} />)}</div>
      <div className="pixel-fence fence--right">{Array.from({ length: 5 }, (_, i) => <i key={i} />)}</div>
      {trees.map((tree) => <PixelTree className={tree} key={tree} />)}
      {flowerBeds.map((bed) => <div className={`pixel-flowers ${bed}`} key={bed}>{Array.from({ length: 10 }, (_, i) => <i key={i} />)}</div>)}
      <div className="pixel-lamp"><i /><span /></div>
      <PixelPerson />
      <PixelPerson npc />
      <div className="ground-details detail--one">· ·</div><div className="ground-details detail--two">· ˚ ·</div><div className="ground-details detail--three">˙ ·</div>
      <div className="scene-vignette" />
    </div>
  )
}

export default VillageScene
