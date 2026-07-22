import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import NpcDialogue from './NpcDialogue'

const CAMERA_ZOOM = 0.66
const WORLD_SIZE = {
  width: 1200,
  height: 820,
}
const EMPTY_ARRAY = []

const trees = ['tree--a', 'tree--b', 'tree--c', 'tree--d', 'tree--e', 'tree--f', 'tree--g']
const flowerBeds = ['flowers--a', 'flowers--b', 'flowers--c']
const grassDetails = ['grass-clump--a', 'grass-clump--b', 'grass-clump--c', 'grass-clump--d', 'grass-clump--e', 'grass-clump--f', 'grass-clump--g', 'grass-clump--h']
const stoneDetails = ['stone--a', 'stone--b', 'stone--c', 'stone--d', 'stone--e']
const leafDetails = ['leaf--a', 'leaf--b', 'leaf--c', 'leaf--d']

function PixelTree({ className }) {
  return <div className={`pixel-tree ${className}`}><i /><i /><i /><span /></div>
}

const PixelPerson = forwardRef(function PixelPerson({ npc = false, characterPosition }, ref) {
  const directionClass = characterPosition ? ` is-facing-${characterPosition.direction}` : ''
  const movingClass = characterPosition?.isMoving ? ' is-moving' : ''
  const style = characterPosition ? {
    left: `${characterPosition.x}px`,
    top: `${characterPosition.y}px`,
  } : undefined

  return (
    <div ref={ref} className={`pixel-person ${npc ? 'pixel-npc' : 'pixel-character'}${directionClass}${movingClass}`} style={style} aria-label={npc ? '마을 주민 모아' : '마을을 걷는 나'}>
      <i className="person-shadow" />
      <i className="person-leg person-leg--left" />
      <i className="person-leg person-leg--right" />
      <i className="person-shoe person-shoe--left" />
      <i className="person-shoe person-shoe--right" />
      <i className="person-arm person-arm--left" />
      <i className="person-arm person-arm--right" />
      <i className="person-shirt" />
      <i className="person-face" />
      <i className="person-hair" />
      <i className="person-bangs" />
    </div>
  )
})

function NpcWithDialogue({ npcPosition, showNpcDialogue, message, dialogueVariant, dialogueKey }) {
  return (
    <div
      className={`npc-wrapper${showNpcDialogue ? ' is-dialogue-visible' : ''}`}
      style={{
        left: `${npcPosition.x}px`,
        top: `${npcPosition.y}px`,
      }}
    >
      {showNpcDialogue && <NpcDialogue message={message} variant={dialogueVariant} dialogueKey={dialogueKey} />}
      <PixelPerson npc />
    </div>
  )
}

function toClassToken(value, fallback) {
  return String(value || fallback).toLowerCase().replaceAll('_', '-')
}

function coordinateKey(x, y) {
  return `${x}:${y}`
}

function objectTileKey(object) {
  if (!Number.isFinite(object?.x) || !Number.isFinite(object?.y)) return null
  return coordinateKey(Math.floor(object.x / 48), Math.floor(object.y / 48))
}

function displayToken(value) {
  return String(value || '').replaceAll('_', ' ')
}

function VillageChangeReveal({ revealState }) {
  const isRevealActive = Boolean(revealState?.isPending || revealState?.isPlaying)

  if (!isRevealActive) return null

  const changeToken = toClassToken(revealState.changeType, 'general-memory')
  const objectToken = toClassToken(revealState.objectType, 'quiet-place')

  return (
    <div className={`village-reveal-layer reveal-${changeToken} object-${objectToken}`} aria-hidden="true">
      <span className="reveal-glow" />
      <span className="reveal-object">
        <i />
        <i />
        <i />
      </span>
      <span className="reveal-spark reveal-spark--one" />
      <span className="reveal-spark reveal-spark--two" />
      <span className="reveal-spark reveal-spark--three" />
      <span className="reveal-leaf reveal-leaf--one" />
      <span className="reveal-leaf reveal-leaf--two" />
      <span className="reveal-ripple reveal-ripple--one" />
      <span className="reveal-ripple reveal-ripple--two" />
      <span className="reveal-footprint reveal-footprint--one" />
      <span className="reveal-footprint reveal-footprint--two" />
      <span className="reveal-aroma reveal-aroma--one" />
      <span className="reveal-aroma reveal-aroma--two" />
    </div>
  )
}

function WorldChangeCluster({ revealState }) {
  const focus = revealState?.focusPosition
  if (!focus) return null

  const asset = toClassToken(revealState.objectType, 'memory-spark')
  return (
    <div
      className={`world-change-cluster world-change-cluster--${asset}`}
      style={{ left: `${focus.x}px`, top: `${focus.y}px` }}
      aria-label={revealState.message}
    >
      <i /><i /><i /><i /><i />
    </div>
  )
}

function TileInteractions({ interactions = [], selectedInteraction, onSelect }) {
  return <div className="tile-interactions">{interactions.map((interaction) => {
    const isSelected = selectedInteraction?.x === interaction.x
      && selectedInteraction?.y === interaction.y
      && selectedInteraction?.type === interaction.type

    return (
    <button key={`${interaction.x}-${interaction.y}-${interaction.type}`} type="button" className={`tile-interaction${isSelected ? ' is-selected' : ''}`} style={{ left: `${interaction.x * 48}px`, top: `${interaction.y * 48}px` }} aria-label={`좌표 ${interaction.x}, ${interaction.y} 살펴보기`} aria-pressed={isSelected} onClick={(event) => onSelect(interaction, event.currentTarget)}>
      <span aria-hidden="true">✦</span>
    </button>
    )
  })}</div>
}

function TileInspectPanel({ details, onClose, onPlantMemory }) {
  if (!details) return null

  const { interaction, tile, objects } = details
  const isEmptyFarm = objects.some((object) => object.assetType === 'FARM_PLOT_EMPTY')
  return (
    <aside className="tile-inspect-panel" aria-label="타일 살펴보기">
      <div className="tile-inspect-panel__heading">
        <div>
          <p>INSPECT</p>
          <h2>타일 살펴보기</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="타일 정보 닫기">닫기</button>
      </div>
      <dl>
        <div><dt>좌표</dt><dd>{interaction.x}, {interaction.y}</dd></div>
        {tile?.terrainType && <div><dt>지형</dt><dd>{displayToken(tile.terrainType)}</dd></div>}
      </dl>
      <section className="tile-inspect-panel__objects" aria-labelledby="tile-inspect-objects">
        <h3 id="tile-inspect-objects">오브젝트</h3>
        {objects.length === 0 ? <p>이 위치에는 아직 특별한 오브젝트가 없습니다.</p> : (
          <ul>
            {objects.map((object) => (
              <li key={object.id}>
                <strong>{displayToken(object.assetType)}</strong>
                {object.worldCategory && <span>카테고리 · {displayToken(object.worldCategory)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
      {isEmptyFarm && <section className="tile-inspect-panel__farm"><h3>비어 있는 밭</h3><p>아직 이 밭에는 특별한 기억이 심어지지 않았어요.<br />심고 싶은 식물이나 채소를 촬영하거나 사진에서 골라 직접 심어보세요!</p><button type="button" onClick={() => { onClose(); onPlantMemory?.() }}>사진으로 기억 심기</button></section>}
    </aside>
  )
}

function VillageScene({ compact = false, characterPosition, npcPosition, showNpcDialogue = false, hasMemory = false, apiTheme, revealState, tutorialStep, npcMessage = '', npcDialogueVariant = 'message', npcDialogueKey, worldState, characterElementRef, worldElementRef, onPlantMemory, activePanel = 'NONE', onOpenInspect, onCloseInspect }) {
  const [selectedInteraction, setSelectedInteraction] = useState(null)
  const lastInteractionButtonRef = useRef(null)
  const terrainTiles = worldState?.terrainTiles || EMPTY_ARRAY
  const persistentObjects = worldState?.placedObjects || EMPTY_ARRAY
  const availableInteractions = useMemo(() => (worldState?.availableInteractions || EMPTY_ARRAY).filter((interaction) => (
    interaction?.available === true
      && interaction.type === 'INSPECT'
      && Number.isInteger(interaction.x)
      && Number.isInteger(interaction.y)
  )), [worldState?.availableInteractions])
  const tileByCoordinate = useMemo(() => new Map(
    terrainTiles
      .filter((tile) => Number.isInteger(tile?.x) && Number.isInteger(tile?.y))
      .map((tile) => [coordinateKey(tile.x, tile.y), tile]),
  ), [terrainTiles])
  const objectsByCoordinate = useMemo(() => {
    const objects = new Map()
    persistentObjects.forEach((object) => {
      const key = objectTileKey(object)
      if (!key) return
      const existing = objects.get(key) || []
      objects.set(key, [...existing, object])
    })
    return objects
  }, [persistentObjects])
  const selectedDetails = useMemo(() => {
    if (!selectedInteraction) return null
    const key = coordinateKey(selectedInteraction.x, selectedInteraction.y)
    return {
      interaction: selectedInteraction,
      tile: tileByCoordinate.get(key) || null,
      objects: objectsByCoordinate.get(key) || [],
    }
  }, [objectsByCoordinate, selectedInteraction, tileByCoordinate])
  const closeSelection = useCallback(() => {
    setSelectedInteraction(null)
    onCloseInspect?.()
    window.requestAnimationFrame(() => lastInteractionButtonRef.current?.focus())
  }, [onCloseInspect])
  const selectInteraction = useCallback((interaction, button) => {
    lastInteractionButtonRef.current = button
    setSelectedInteraction({ x: interaction.x, y: interaction.y, type: interaction.type })
    onOpenInspect?.({ x: interaction.x, y: interaction.y, type: interaction.type })
  }, [onOpenInspect])

  useEffect(() => {
    if (activePanel !== 'INSPECT' && selectedInteraction) setSelectedInteraction(null)
  }, [activePanel, selectedInteraction])

  useEffect(() => {
    if (!selectedInteraction) return
    const stillAvailable = availableInteractions.some((interaction) => (
      interaction.x === selectedInteraction.x
        && interaction.y === selectedInteraction.y
        && interaction.type === selectedInteraction.type
    ))
    if (!stillAvailable || !selectedDetails?.tile) setSelectedInteraction(null)
  }, [availableInteractions, selectedDetails?.tile, selectedInteraction])

  useEffect(() => {
    if (!selectedInteraction) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || event.target?.matches?.('input,textarea,[contenteditable=true]')) return
      event.preventDefault()
      closeSelection()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [closeSelection, selectedInteraction])

  const isRevealActive = Boolean(revealState?.isPending || revealState?.isPlaying)
  const revealClass = isRevealActive
    ? ` is-reveal-active${revealState.isPlaying ? ' is-revealing' : ' is-reveal-pending'} reveal-${toClassToken(revealState.changeType, 'general-memory')}`
    : ''
  const tutorialClass = tutorialStep ? ` tutorial-step-${toClassToken(tutorialStep, 'none')}` : ''
  const worldStyle = useMemo(() => {
    if (!characterPosition) return undefined

    return {
      '--character-x': characterPosition.x,
      '--character-y': characterPosition.y,
      '--camera-character-x': `${characterPosition.x * CAMERA_ZOOM}px`,
      '--camera-character-y': `${characterPosition.y * CAMERA_ZOOM}px`,
      '--camera-world-width': `${WORLD_SIZE.width * CAMERA_ZOOM}px`,
      '--camera-world-height': `${WORLD_SIZE.height * CAMERA_ZOOM}px`,
      '--camera-zoom': CAMERA_ZOOM,
    }
  }, [characterPosition])

  return (
    <div className={`village-scene${compact ? ' village-scene--compact' : ''}`}>
      <div ref={worldElementRef} className={`village-world${hasMemory ? ' has-memory' : ''}${apiTheme ? ` theme-${String(apiTheme).toLowerCase()}` : ''}${revealClass}${tutorialClass}`} style={worldStyle}>
        <div className="pixel-sky"><span className="pixel-sun" /><span className="distant-hill distant-hill--one" /><span className="distant-hill distant-hill--two" /></div>
        <div className="grass-tiles" />
        <div className="persistent-terrain" aria-hidden="true">{(worldState?.terrainTiles || []).map((tile) => <i key={`${tile.x}-${tile.y}`} className={`terrain-tile terrain-${String(tile.terrainType).toLowerCase()}`} style={{ left: `${tile.x * 48}px`, top: `${tile.y * 48}px` }} />)}</div>
        <TileInteractions interactions={availableInteractions} selectedInteraction={selectedInteraction} onSelect={selectInteraction} />
        <div className="ground-flora" aria-hidden="true">
          {grassDetails.map((detail) => <span className={`grass-clump ${detail}`} key={detail} />)}
          {stoneDetails.map((detail) => <span className={`field-stone ${detail}`} key={detail} />)}
          {leafDetails.map((detail) => <span className={`fallen-leaf ${detail}`} key={detail} />)}
        </div>
        <div className="pixel-path pixel-path--main" /><div className="pixel-path pixel-path--branch" />
        <div className="pixel-water"><i /><i /><i /></div>
        <div className="pond-edge-detail" aria-hidden="true"><i /><i /><i /><span /></div>
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
        <div className="small-environment" aria-hidden="true">
          <span className="village-sign" />
          <span className="tree-stump" />
          <span className="butterfly" />
          <span className="far-bird" />
          <span className="pet-bowl" />
          <span className="tiny-footprints" />
        </div>
        <div className="persistent-world-objects">{persistentObjects.map((object) => <i key={object.id} className={`persistent-object asset-${String(object.assetType).toLowerCase()}`} style={{ left: `${object.x}px`, top: `${object.y}px`, zIndex: 8 + object.y }} />)}</div>
        {hasMemory && (
          <>
            <div className="memory-flower">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>
            <div className="memory-glow" />
            <div className="memory-sparkle sparkle--one" />
            <div className="memory-sparkle sparkle--two" />
            <div className="memory-leaf" />
          </>
        )}
        {apiTheme === 'ANIMAL_FRIENDLY_VILLAGE' && <div className="pixel-cat" aria-label="작은 고양이 발자국" />}
        {apiTheme === 'QUIET_VILLAGE' && <div className="quiet-mist" />}
        <WorldChangeCluster revealState={revealState} />
        <VillageChangeReveal revealState={revealState} />
        <div className="pixel-lamp"><i /><span /></div>
        <PixelPerson ref={characterElementRef} characterPosition={characterPosition} />
        {npcPosition ? (
          <NpcWithDialogue
            npcPosition={npcPosition}
            showNpcDialogue={showNpcDialogue}
            message={npcMessage}
            dialogueVariant={npcDialogueVariant}
            dialogueKey={npcDialogueKey}
          />
        ) : <PixelPerson npc />}
        <div className="ground-details detail--one">· ·</div><div className="ground-details detail--two">· ˚ ·</div><div className="ground-details detail--three">˙ ·</div>
      </div>
      <div className="scene-vignette" />
      {activePanel === 'INSPECT' && <TileInspectPanel details={selectedDetails} onClose={closeSelection} onPlantMemory={onPlantMemory} />}
    </div>
  )
}

export default VillageScene
