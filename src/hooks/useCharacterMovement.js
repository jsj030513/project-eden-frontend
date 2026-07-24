import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const TILE_SIZE = 48
// A request is never sent before the prior server response is accepted. The
// cadence starts when its visual transition starts so a held input does not add
// a fixed idle gap after every tile.
const MOVE_REQUEST_CADENCE_MS = 120
const MOVE_ANIMATION_MS = 150
const NPC_POSITION = { x: 850, y: 482 }
const NPC_INTERACTION_DISTANCE = 116

function directionFor(vector) {
  if (Math.abs(vector.x) < 0.12 && Math.abs(vector.y) < 0.12) return null
  if (Math.abs(vector.x) >= Math.abs(vector.y)) return vector.x > 0 ? 'right' : 'left'
  return vector.y > 0 ? 'down' : 'up'
}

export function useCharacterMovement({ worldState, onMove, onMovementEnd, characterElementRef, worldElementRef } = {}) {
  const [characterPosition, setCharacterPosition] = useState({ x: 590, y: 536, direction: 'down', isMoving: false })
  const moveLockRef = useRef(false)
  const serverPositionRef = useRef(null)
  const keyboardDirectionsRef = useRef([])
  const joystickDirectionRef = useRef(null)
  const schedulerRef = useRef(null)
  const schedulerActiveRef = useRef(false)
  const animationFrameRef = useRef(null)
  const movementEndTimerRef = useRef(null)
  const movementEndPendingRef = useRef(false)
  const renderPositionRef = useRef({ x: 590, y: 536 })
  const initializedRef = useRef(false)
  const terrainTiles = useMemo(() => worldState?.terrainTiles || [], [worldState?.terrainTiles])
  const bounds = worldState?.mapBounds
  const playerPosition = worldState?.playerPosition

  const paintPosition = useCallback((position, direction, isMoving) => {
    const character = characterElementRef?.current
    if (character) {
      character.style.left = `${position.x}px`
      character.style.top = `${position.y}px`
      character.classList.toggle('is-moving', Boolean(isMoving))
      ;['up', 'down', 'left', 'right'].forEach((value) => character.classList.toggle(`is-facing-${value}`, value === direction))
    }
    const world = worldElementRef?.current
    if (world) {
      world.style.setProperty('--character-x', position.x)
      world.style.setProperty('--character-y', position.y)
      world.style.setProperty('--camera-character-x', `${position.x * 0.66}px`)
      world.style.setProperty('--camera-character-y', `${position.y * 0.66}px`)
    }
  }, [characterElementRef, worldElementRef])

  useEffect(() => {
    const position = playerPosition
    if (!position) return
    serverPositionRef.current = { x: position.x, y: position.y }
    if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current)
    const next = { x: position.x * TILE_SIZE, y: position.y * TILE_SIZE }
    renderPositionRef.current = next
    initializedRef.current = true
    paintPosition(next, undefined, false)
    setCharacterPosition((current) => ({ ...current, ...next, isMoving: false }))
  }, [paintPosition, playerPosition])

  const syncAfterMovement = useCallback(() => {
    if (!movementEndPendingRef.current || moveLockRef.current || animationFrameRef.current) return
    movementEndPendingRef.current = false
    if (!onMovementEnd) return
    Promise.resolve(onMovementEnd()).catch(() => {})
  }, [onMovementEnd])

  const requestMovementEndSync = useCallback(() => {
    if (!onMovementEnd || movementEndPendingRef.current) return
    movementEndPendingRef.current = true
    const check = () => {
      movementEndTimerRef.current = null
      if (moveLockRef.current || animationFrameRef.current) {
        movementEndTimerRef.current = window.setTimeout(check, 16)
        return
      }
      syncAfterMovement()
    }
    check()
  }, [onMovementEnd, syncAfterMovement])

  const requestMove = useCallback(async (direction) => {
    if (!onMove || moveLockRef.current || !serverPositionRef.current) return null
    const delta = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[direction]
    if (!delta) return null
    const targetX = serverPositionRef.current.x + delta[0]
    const targetY = serverPositionRef.current.y + delta[1]
    if (bounds && (targetX < bounds.minX || targetX > bounds.maxX || targetY < bounds.minY || targetY > bounds.maxY)) return null
    const tile = terrainTiles.find((value) => value.x === targetX && value.y === targetY)
    if (!tile?.walkable) return null
    moveLockRef.current = true
    try {
      const result = await onMove(targetX, targetY)
      if (!Number.isInteger(result?.currentX) || !Number.isInteger(result?.currentY) || !result.accepted) {
        const approved = serverPositionRef.current
        if (approved) {
          if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current)
          const restored = { x: approved.x * TILE_SIZE, y: approved.y * TILE_SIZE }
          renderPositionRef.current = restored
          paintPosition(restored, direction, false)
          setCharacterPosition((current) => ({ ...current, ...restored, isMoving: false }))
        }
        return null
      }
      serverPositionRef.current = { x: result.currentX, y: result.currentY }
      if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current)
      const start = renderPositionRef.current
      const target = { x: result.currentX * TILE_SIZE, y: result.currentY * TILE_SIZE }
      const startedAt = performance.now()
      const animate = (now) => {
        const progress = Math.min((now - startedAt) / MOVE_ANIMATION_MS, 1)
        const next = { x: start.x + (target.x - start.x) * progress, y: start.y + (target.y - start.y) * progress }
        renderPositionRef.current = next
        paintPosition(next, direction, progress < 1)
        if (progress < 1) animationFrameRef.current = window.requestAnimationFrame(animate)
        else {
          animationFrameRef.current = null
          setCharacterPosition((current) => ({ ...current, ...target, direction, isMoving: false }))
          syncAfterMovement()
        }
      }
      animationFrameRef.current = window.requestAnimationFrame(animate)
      return startedAt
    } catch {
      const approved = serverPositionRef.current
      if (approved) {
        if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current)
        const restored = { x: approved.x * TILE_SIZE, y: approved.y * TILE_SIZE }
        renderPositionRef.current = restored
        paintPosition(restored, direction, false)
        setCharacterPosition((current) => ({ ...current, ...restored, isMoving: false }))
      }
      return null
    } finally {
      moveLockRef.current = false
      syncAfterMovement()
    }
  }, [bounds, onMove, paintPosition, syncAfterMovement, terrainTiles])

  const activeDirection = useCallback(() => joystickDirectionRef.current || keyboardDirectionsRef.current.at(-1) || null, [])
  const scheduleMovement = useCallback(() => {
    if (schedulerActiveRef.current) return
    schedulerActiveRef.current = true
    const run = async () => {
      const direction = activeDirection()
      if (!direction) { schedulerRef.current = null; schedulerActiveRef.current = false; return }
      const animationStartedAt = await requestMove(direction)
      const elapsed = animationStartedAt == null ? 0 : performance.now() - animationStartedAt
      const delay = animationStartedAt == null
        ? MOVE_REQUEST_CADENCE_MS
        : Math.max(0, MOVE_REQUEST_CADENCE_MS - elapsed)
      schedulerRef.current = window.setTimeout(run, delay)
    }
    run()
  }, [activeDirection, requestMove])
  const cancelMovement = useCallback(() => {
    if (schedulerRef.current) { window.clearTimeout(schedulerRef.current); schedulerRef.current = null }
    if (movementEndTimerRef.current) { window.clearTimeout(movementEndTimerRef.current); movementEndTimerRef.current = null }
    schedulerActiveRef.current = false
    movementEndPendingRef.current = false
    if (animationFrameRef.current) { window.cancelAnimationFrame(animationFrameRef.current); animationFrameRef.current = null }
  }, [])

  const setJoystickVector = useCallback((vector) => { joystickDirectionRef.current = directionFor(vector); if (joystickDirectionRef.current) scheduleMovement() }, [scheduleMovement])
  const stopJoystick = useCallback(() => {
    joystickDirectionRef.current = null
    if (keyboardDirectionsRef.current.length === 0) requestMovementEndSync()
  }, [requestMovementEndSync])

  useEffect(() => {
    const keys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', W: 'up', s: 'down', S: 'down', a: 'left', A: 'left', d: 'right', D: 'right' }
    const onKeyDown = (event) => { const direction = keys[event.key]; if (!direction || event.repeat || event.target?.matches?.('input,textarea,[contenteditable=true]')) return; event.preventDefault(); keyboardDirectionsRef.current = [...keyboardDirectionsRef.current.filter((value) => value !== direction), direction]; scheduleMovement() }
    const onKeyUp = (event) => {
      const direction = keys[event.key]
      if (!direction) return
      keyboardDirectionsRef.current = keyboardDirectionsRef.current.filter((value) => value !== direction)
      if (!joystickDirectionRef.current && keyboardDirectionsRef.current.length === 0) requestMovementEndSync()
    }
    const onBlur = () => {
      keyboardDirectionsRef.current = []
      joystickDirectionRef.current = null
      requestMovementEndSync()
    }
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', onBlur)
    return () => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur); cancelMovement() }
  }, [cancelMovement, requestMovementEndSync, scheduleMovement])

  const showNpcDialogue = useMemo(() => Math.hypot(characterPosition.x - NPC_POSITION.x, characterPosition.y - NPC_POSITION.y) < NPC_INTERACTION_DISTANCE, [characterPosition.x, characterPosition.y])
  return { characterPosition, npcPosition: NPC_POSITION, showNpcDialogue, setJoystickVector, stopJoystick, requestMove }
}
