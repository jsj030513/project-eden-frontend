import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { recordHydrationDiagnostic } from './phase3cDiagnostics'
import {
  cameraVariables,
  cameraScaleForViewport,
  calculateRenderBounds,
  filterVisibleInteractions,
  filterVisibleObjects,
  pixelToTile,
  rectIsVisible,
  tileIsVisible,
  tileToPixel,
} from './worldViewport'
import { bridgeVisualStyle, communityHouseVisualStyle } from './worldHubLayout'

const EMPTY_ARRAY = []

const grassDetails = ['grass-clump--a', 'grass-clump--b', 'grass-clump--c', 'grass-clump--d', 'grass-clump--e', 'grass-clump--f', 'grass-clump--g', 'grass-clump--h']
const stoneDetails = ['stone--a', 'stone--b', 'stone--c', 'stone--d', 'stone--e']
const leafDetails = ['leaf--a', 'leaf--b', 'leaf--c', 'leaf--d']
const visualTrees = [
  ['tree-a', 24, 30, 'large'],
  ['tree-b', 92, 58, 'medium'],
  ['tree-c', 448, 28, 'medium'],
  ['tree-d', 710, 26, 'large'],
  ['tree-e', 862, 42, 'medium'],
  ['tree-f', 1034, 54, 'large'],
  ['tree-g', 26, 320, 'medium'],
  ['tree-h', 1060, 338, 'medium'],
  ['tree-i', 42, 650, 'large'],
  ['tree-j', 322, 650, 'medium'],
  ['tree-k', 716, 674, 'medium'],
  ['tree-l', 1082, 646, 'large'],
]
const visualFlowerClusters = [
  ['flower-a', 62, 286, 'pink'],
  ['flower-b', 378, 118, 'yellow'],
  ['flower-c', 684, 180, 'purple'],
  ['flower-d', 920, 182, 'pink'],
  ['flower-e', 1010, 320, 'yellow'],
  ['flower-f', 302, 584, 'purple'],
  ['flower-g', 682, 602, 'pink'],
  ['flower-h', 770, 462, 'yellow'],
]
const objectLabels = {
  PLAZA: '분수',
  COMMUNITY_HOUSE: '커뮤니티 하우스',
  DEFAULT_NPC_GUIDE: '마을 안내자',
  DEFAULT_NPC_GARDENER: '정원 관리인',
  DEFAULT_NPC_MEMORY_KEEPER: '기억 보관인',
  DEFAULT_NPC_ANIMAL_CARETAKER: '동물 돌봄이',
  DEFAULT_DOG: '강아지',
  DEFAULT_CAT: '고양이',
  DEFAULT_BIRD: '새',
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

function toClassToken(value, fallback) {
  return String(value || fallback).toLowerCase().replaceAll('_', '-')
}

function coordinateKey(x, y) {
  return `${x}:${y}`
}

function objectTileKey(object) {
  if (!Number.isFinite(object?.x) || !Number.isFinite(object?.y)) return null
  return coordinateKey(pixelToTile(object.x), pixelToTile(object.y))
}

function displayToken(value) {
  return String(value || '').replaceAll('_', ' ')
}

function PersistentWorldObject({ object, runtimeNpc = null }) {
  const assetType = String(object.assetType || 'MEMORY_SPARK')
  const token = assetType.toLowerCase()
  const isAnimal = assetType === 'DEFAULT_DOG' || assetType === 'DEFAULT_CAT' || assetType === 'DEFAULT_BIRD'
  const isNpc = assetType.startsWith('DEFAULT_NPC_')
  const label = objectLabels[assetType]
  const landmarkStyle = assetType === 'COMMUNITY_HOUSE' ? communityHouseVisualStyle() : {}
  return (
    <span
      className={`persistent-object asset-${token}${isAnimal ? ' is-world-animal' : ''}${isNpc ? ' is-world-npc' : ''}`}
      data-world-object-id={object.id}
      data-world-change-id={object.worldChangeId}
      data-npc-key={runtimeNpc?.npcKey}
      data-npc-activity={runtimeNpc?.activity}
      data-npc-state-version={runtimeNpc?.stateVersion}
      style={{
        left: `${object.x}px`,
        top: `${object.y}px`,
        zIndex: 8 + object.y,
        '--label-offset': `${Number(object.id) % 2 === 0 ? 8 : -8}px`,
        ...landmarkStyle,
      }}
      aria-label={displayToken(assetType)}
    >
      <i aria-hidden="true" />
      {label && <b className="world-object-label" aria-hidden="true">{label}</b>}
      {runtimeNpc?.activity && (
        <small className="world-npc-activity">{displayToken(runtimeNpc.activity)}</small>
      )}
    </span>
  )
}

function VillageVisualDecor({ renderBounds }) {
  if (renderBounds.maxX < 0 || renderBounds.minX > 23 || renderBounds.maxY < 0 || renderBounds.minY > 15) {
    return null
  }
  const showRoad = rectIsVisible({ x: 245, y: 220, width: 670, height: 548 }, renderBounds)
  const showFarm = rectIsVisible({ x: 70, y: 160, width: 480, height: 548 }, renderBounds)
  const showPlaza = rectIsVisible({ x: 380, y: 220, width: 310, height: 250 }, renderBounds)
  const showPond = rectIsVisible({ x: 730, y: 480, width: 410, height: 280 }, renderBounds)
  const showCommunity = rectIsVisible({ x: 370, y: 230, width: 120, height: 150 }, renderBounds)
  return (
    <div className="village-visual-decor hub-decoration" data-decoration-scope="hub" aria-hidden="true">
      {showRoad && <div className="hub-road-decoration">
      <div className="visual-path visual-path--northwest" />
      <div className="visual-path visual-path--west" />
      <div className="visual-path visual-path--east" />
      <div className="visual-path visual-path--southeast" />
      <div className="visual-path visual-path--south" />
      </div>}

      {showFarm && <div className="hub-farm-decoration">
      <section className="visual-farm visual-farm--flowers"><b>꽃밭</b><i /><i /></section>
      <section className="visual-farm visual-farm--empty"><b>빈 밭</b><i /><i /></section>
      <section className="visual-farm visual-farm--carrots"><b>당근밭</b><i /><i /></section>
      <section className="visual-farm visual-farm--vegetables"><b>혼합 채소밭</b><i /><i /></section>
      <div className="visual-fence visual-fence--farm" />
      </div>}

      {showPlaza && <div className="hub-plaza-decoration">
      <div className="visual-plaza">
        <i className="visual-bench visual-bench--left" />
        <i className="visual-bench visual-bench--right" />
        <i className="visual-lamp visual-lamp--left" />
        <i className="visual-lamp visual-lamp--right" />
      </div>
      </div>}

      {showPond && <div className="hub-pond-decoration">
      <div className="visual-pond">
        <i className="pond-ripple pond-ripple--one" />
        <i className="pond-ripple pond-ripple--two" />
        <i className="pond-lotus pond-lotus--one" />
        <i className="pond-lotus pond-lotus--two" />
        <i className="pond-reeds pond-reeds--one" />
        <i className="pond-reeds pond-reeds--two" />
        <i className="pond-stone pond-stone--one" />
        <i className="pond-stone pond-stone--two" />
      </div>
      <i className="visual-bridge" style={bridgeVisualStyle()} />
      </div>}

      {showCommunity && <div className="hub-community-decoration">
      <div className="visual-garden">
        <i /><i /><i /><i /><i />
      </div>
      <div className="visual-fence visual-fence--animals" />
      <div className="visual-sign visual-sign--community" />
      <div className="visual-mailbox" />
      </div>}

      {visualTrees.filter(([, x, y]) => rectIsVisible({ x, y, width: 70, height: 90 }, renderBounds)).map(([key, x, y, size]) => (
        <span key={key} className={`visual-tree visual-tree--${size}`} style={{ left: `${x}px`, top: `${y}px` }}><i /></span>
      ))}
      {visualFlowerClusters.filter(([, x, y]) => rectIsVisible({ x, y, width: 48, height: 36 }, renderBounds)).map(([key, x, y, color]) => (
        <span key={key} className={`visual-flower-cluster visual-flower-cluster--${color}`} style={{ left: `${x}px`, top: `${y}px` }} />
      ))}
    </div>
  )
}

function RegionDecorations({ chunks = [] }) {
  return (
    <div className="region-decorations" aria-hidden="true">
      {chunks.flatMap((chunk) => (chunk.decorations || []).map((decoration, index) => {
        const x = (chunk.chunkX * 8 + decoration.localX) * 48
        const y = (chunk.chunkY * 8 + decoration.localY) * 48
        return (
          <i
            key={`${chunk.chunkX}:${chunk.chunkY}:${decoration.type}:${index}`}
            className={`region-decoration region-${String(chunk.regionType).toLowerCase()} decoration-${String(decoration.type).toLowerCase()}`}
            style={{ left: `${x}px`, top: `${y}px` }}
          />
        )
      }))}
    </div>
  )
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
    <button key={interaction.targetId || `${interaction.x}-${interaction.y}-${interaction.type}`} type="button" className={`tile-interaction${isSelected ? ' is-selected' : ''}`} style={{ left: `${tileToPixel(interaction.x)}px`, top: `${tileToPixel(interaction.y)}px` }} aria-label={`좌표 ${interaction.x}, ${interaction.y} 살펴보기`} aria-pressed={isSelected} onClick={(event) => onSelect(interaction, event.currentTarget)}>
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

function VillageScene({ compact = false, characterPosition, hasMemory = false, apiTheme, revealState, tutorialStep, worldState, characterElementRef, worldElementRef, onPlantMemory, activePanel = 'NONE', pinnedInteraction = null, onOpenInspect, onCloseInspect }) {
  const [selectedInteraction, setSelectedInteraction] = useState(null)
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === 'undefined' ? 1440 : window.innerWidth,
    height: typeof window === 'undefined' ? 900 : window.innerHeight,
  }))
  const lastInteractionButtonRef = useRef(null)
  const terrainZeroTimerRef = useRef(null)
  const terrainTiles = worldState?.terrainTiles || EMPTY_ARRAY
  const allPersistentObjects = worldState?.placedObjects || EMPTY_ARRAY
  const persistentObjects = useMemo(
    () => allPersistentObjects.filter((object) => !String(object.assetType || '').startsWith('DEFAULT_NPC_')),
    [allPersistentObjects],
  )
  const runtimeNpcs = worldState?.npcPositions || EMPTY_ARRAY
  const availableInteractions = useMemo(() => (worldState?.availableInteractions || EMPTY_ARRAY).filter((interaction) => (
    interaction?.available === true
      && interaction.type === 'INSPECT'
      && Number.isInteger(interaction.x)
      && Number.isInteger(interaction.y)
  )), [worldState?.availableInteractions])
  const cameraScale = useMemo(
    () => cameraScaleForViewport(viewport.width, viewport.height),
    [viewport.height, viewport.width],
  )
  const renderBounds = useMemo(() => calculateRenderBounds({
    playerPixelX: characterPosition?.x ?? 0,
    playerPixelY: characterPosition?.y ?? 0,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    worldBounds: worldState?.mapBounds,
    cameraScale,
  }), [cameraScale, characterPosition?.x, characterPosition?.y, viewport.height, viewport.width, worldState?.mapBounds])
  const visibleTerrain = useMemo(
    () => terrainTiles.filter((tile) => tileIsVisible(tile.x, tile.y, renderBounds)),
    [renderBounds, terrainTiles],
  )
  const pinnedTargetId = pinnedInteraction?.targetId ?? null
  const visibleObjects = useMemo(
    () => filterVisibleObjects(persistentObjects, renderBounds, pinnedTargetId),
    [persistentObjects, pinnedTargetId, renderBounds],
  )
  const visibleNpcs = useMemo(
    () => runtimeNpcs.filter((npc) => tileIsVisible(npc.x, npc.y, renderBounds)),
    [renderBounds, runtimeNpcs],
  )
  const visibleInteractions = useMemo(
    () => filterVisibleInteractions(availableInteractions, renderBounds, pinnedTargetId, selectedInteraction),
    [availableInteractions, pinnedTargetId, renderBounds, selectedInteraction],
  )
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
    if (!stillAvailable || !selectedDetails?.tile) {
      setSelectedInteraction(null)
      onCloseInspect?.()
    }
  }, [availableInteractions, onCloseInspect, selectedDetails?.tile, selectedInteraction])

  useEffect(() => {
    const onResize = () => setViewport({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (compact) return undefined
    recordHydrationDiagnostic('VILLAGE_SCENE_RENDER', {
      worldId: worldState?.worldId ?? null,
      villageSceneTerrainCount: terrainTiles.length,
      filteredTerrainCount: visibleTerrain.length,
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
      renderMinX: renderBounds.minX,
      renderMaxX: renderBounds.maxX,
      renderMinY: renderBounds.minY,
      renderMaxY: renderBounds.maxY,
    })
    recordHydrationDiagnostic('TERRAIN_RENDER_WINDOW', {
      worldId: worldState?.worldId ?? null,
      stateTerrainCount: terrainTiles.length,
      filteredTerrainCount: visibleTerrain.length,
      renderMinX: renderBounds.minX,
      renderMaxX: renderBounds.maxX,
      renderMinY: renderBounds.minY,
      renderMaxY: renderBounds.maxY,
    })
    recordHydrationDiagnostic('PERSISTENT_TERRAIN_COMMIT', {
      worldId: worldState?.worldId ?? null,
      villageSceneTerrainCount: terrainTiles.length,
      filteredTerrainCount: visibleTerrain.length,
    })
    window.clearTimeout(terrainZeroTimerRef.current)
    if (worldState && terrainTiles.length === 0) {
      terrainZeroTimerRef.current = window.setTimeout(() => {
        recordHydrationDiagnostic('PERSISTENT_TERRAIN_ZERO', {
          worldId: worldState.worldId ?? null,
          stateTerrainCount: worldState.terrainTiles?.length ?? 0,
          stateObjectCount: worldState.placedObjects?.length ?? 0,
          villageSceneTerrainCount: terrainTiles.length,
          filteredTerrainCount: visibleTerrain.length,
          currentPlayerX: worldState.playerPosition?.x ?? null,
          currentPlayerY: worldState.playerPosition?.y ?? null,
          renderMinX: renderBounds.minX,
          renderMaxX: renderBounds.maxX,
          renderMinY: renderBounds.minY,
          renderMaxY: renderBounds.maxY,
        })
      }, 1000)
    }
    return () => window.clearTimeout(terrainZeroTimerRef.current)
  }, [compact, renderBounds, terrainTiles, viewport.height, viewport.width, visibleTerrain.length, worldState])

  const isRevealActive = Boolean(revealState?.isPending || revealState?.isPlaying)
  const revealClass = isRevealActive
    ? ` is-reveal-active${revealState.isPlaying ? ' is-revealing' : ' is-reveal-pending'} reveal-${toClassToken(revealState.changeType, 'general-memory')}`
    : ''
  const tutorialClass = tutorialStep ? ` tutorial-step-${toClassToken(tutorialStep, 'none')}` : ''
  const worldStyle = useMemo(() => {
    if (!characterPosition) return undefined

    return cameraVariables(characterPosition, worldState?.mapBounds, cameraScale)
  }, [cameraScale, characterPosition, worldState?.mapBounds])

  return (
    <div className={`village-scene${compact ? ' village-scene--compact' : ''}`}>
      <div ref={worldElementRef} className={`village-world${hasMemory ? ' has-memory' : ''}${apiTheme ? ` theme-${String(apiTheme).toLowerCase()}` : ''}${revealClass}${tutorialClass}`} style={worldStyle}>
        <div className="pixel-sky"><span className="pixel-sun" /><span className="distant-hill distant-hill--one" /><span className="distant-hill distant-hill--two" /></div>
        <div className="grass-tiles" />
        <div className="world-coordinate-layer">
          <div className="persistent-terrain" aria-hidden="true" data-total-count={terrainTiles.length} data-rendered-count={visibleTerrain.length}>{visibleTerrain.map((tile) => <i key={`${tile.x}-${tile.y}`} className={`terrain-tile terrain-${String(tile.terrainType).toLowerCase()}`} style={{ left: `${tileToPixel(tile.x)}px`, top: `${tileToPixel(tile.y)}px` }} />)}</div>
          <RegionDecorations chunks={worldState?.worldChunks} />
          <VillageVisualDecor renderBounds={renderBounds} />
          <TileInteractions interactions={visibleInteractions} selectedInteraction={selectedInteraction} onSelect={selectInteraction} />
          <div className="ground-flora" aria-hidden="true">
          {grassDetails.map((detail) => <span className={`grass-clump ${detail}`} key={detail} />)}
          {stoneDetails.map((detail) => <span className={`field-stone ${detail}`} key={detail} />)}
          {leafDetails.map((detail) => <span className={`fallen-leaf ${detail}`} key={detail} />)}
        </div>
          <div className="persistent-world-objects" data-total-count={persistentObjects.length + runtimeNpcs.length} data-rendered-count={visibleObjects.length + visibleNpcs.length}>
            {visibleObjects.map((object) => <PersistentWorldObject key={object.id} object={object} />)}
            {visibleNpcs.map((npc) => (
              <PersistentWorldObject
                key={`npc-${npc.objectId ?? npc.id}`}
                runtimeNpc={npc}
                object={{
                  id: npc.objectId ?? npc.id,
                  assetType: npc.assetType,
                  x: npc.pixelX ?? tileToPixel(npc.x),
                  y: npc.pixelY ?? tileToPixel(npc.y),
                  worldChangeId: null,
                }}
              />
            ))}
          </div>
        {hasMemory && (
          <>
            <div className="memory-flower">{Array.from({ length: 8 }, (_, i) => <i key={i} />)}</div>
            <div className="memory-glow" />
            <div className="memory-sparkle sparkle--one" />
            <div className="memory-sparkle sparkle--two" />
            <div className="memory-leaf" />
          </>
        )}
        {apiTheme === 'QUIET_VILLAGE' && <div className="quiet-mist" />}
          <WorldChangeCluster revealState={revealState} />
          <VillageChangeReveal revealState={revealState} />
          <PixelPerson ref={characterElementRef} characterPosition={characterPosition} />
          <div className="ground-details detail--one">· ·</div><div className="ground-details detail--two">· ˚ ·</div><div className="ground-details detail--three">˙ ·</div>
        </div>
      </div>
      <div className="scene-vignette" />
      {activePanel === 'INSPECT' && <TileInspectPanel details={selectedDetails} onClose={closeSelection} onPlantMemory={onPlantMemory} />}
    </div>
  )
}

export default VillageScene
