import { useCallback, useEffect, useRef, useState } from 'react'

const MAX_RADIUS = 50
const DEAD_ZONE = 0.12
const EDGE_PADDING = 64
const TOP_EXCLUSION = 58
const CONTROL_AREA_RATIO = 0.5
const JOYSTICK_RADIUS = 50
const JOYSTICK_EDGE_GAP = 14
const BLOCKED_TARGET_SELECTOR = 'button, input, textarea, select, a, [role="button"], [data-no-joystick]'

function normalizeVector(vector) {
  const magnitude = Math.hypot(vector.x, vector.y)

  if (magnitude <= DEAD_ZONE) {
    return { x: 0, y: 0 }
  }

  if (magnitude <= 1) {
    return vector
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function getPointerVector(event, origin) {
  const rawX = event.clientX - origin.x
  const rawY = event.clientY - origin.y
  const distance = Math.hypot(rawX, rawY)
  const limitedDistance = Math.min(distance, MAX_RADIUS)
  const angle = Math.atan2(rawY, rawX)
  const handleX = distance === 0 ? 0 : Math.cos(angle) * limitedDistance
  const handleY = distance === 0 ? 0 : Math.sin(angle) * limitedDistance

  return {
    handle: { x: handleX, y: handleY },
    vector: normalizeVector({
      x: handleX / MAX_RADIUS,
      y: handleY / MAX_RADIUS,
    }),
  }
}

function getClampedOrigin(event) {
  const minimumX = EDGE_PADDING + JOYSTICK_EDGE_GAP
  const maximumX = Math.max(minimumX, window.innerWidth * CONTROL_AREA_RATIO - JOYSTICK_RADIUS)
  const minimumY = TOP_EXCLUSION + JOYSTICK_RADIUS + JOYSTICK_EDGE_GAP
  const maximumY = Math.max(minimumY, window.innerHeight - JOYSTICK_RADIUS - JOYSTICK_EDGE_GAP)

  return {
    x: clamp(event.clientX, minimumX, maximumX),
    y: clamp(event.clientY, minimumY, maximumY),
  }
}

function canStartJoystick(event) {
  if (event.button !== undefined && event.button !== 0) return false
  if (event.target?.closest?.(BLOCKED_TARGET_SELECTOR)) return false
  if (event.clientY < TOP_EXCLUSION) return false
  return event.clientX <= window.innerWidth * CONTROL_AREA_RATIO
}

function VirtualJoystick({ onMove, onStop, disabled = false }) {
  const activePointerRef = useRef(null)
  const originRef = useRef({ x: 0, y: 0 })
  const [handlePosition, setHandlePosition] = useState({ x: 0, y: 0 })
  const [joystickState, setJoystickState] = useState({
    isActive: false,
    originX: 0,
    originY: 0,
  })

  const updateFromPointer = useCallback((event) => {
    const { handle, vector } = getPointerVector(event, originRef.current)
    setHandlePosition(handle)
    onMove(vector)
  }, [onMove])

  const handlePointerDown = (event) => {
    if (disabled) return
    if (activePointerRef.current !== null || !canStartJoystick(event)) return

    event.preventDefault()
    event.stopPropagation()

    const origin = getClampedOrigin(event)
    originRef.current = origin
    activePointerRef.current = event.pointerId

    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId)
    }

    setHandlePosition({ x: 0, y: 0 })
    setJoystickState({
      isActive: true,
      originX: origin.x,
      originY: origin.y,
    })
    onMove({ x: 0, y: 0 })
  }

  const handlePointerMove = (event) => {
    if (disabled) return
    if (activePointerRef.current !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    updateFromPointer(event)
  }

  const resetJoystick = useCallback((event) => {
    if (event?.currentTarget?.releasePointerCapture && activePointerRef.current === event.pointerId) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    activePointerRef.current = null
    setJoystickState((current) => ({ ...current, isActive: false }))
    setHandlePosition({ x: 0, y: 0 })
    onStop()
  }, [onStop])

  useEffect(() => {
    if (disabled && activePointerRef.current !== null) {
      resetJoystick()
    }
  }, [disabled, resetJoystick])

  const handlePointerUp = (event) => {
    if (activePointerRef.current !== event.pointerId) return
    event.preventDefault()
    resetJoystick(event)
  }

  return (
    <div
      className={`virtual-joystick${joystickState.isActive ? ' is-active' : ''}${disabled ? ' is-disabled' : ''}`}
      aria-label="캐릭터 이동 조이스틱"
      aria-disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={resetJoystick}
      onLostPointerCapture={resetJoystick}
    >
      <div
        className={`virtual-joystick__pad${joystickState.isActive ? ' is-active' : ''}`}
        role="application"
        aria-roledescription="가상 조이스틱"
        aria-label="드래그해서 캐릭터를 천천히 이동"
        style={{
          left: `${joystickState.originX}px`,
          top: `${joystickState.originY}px`,
        }}
      >
        <span
          className="virtual-joystick__handle"
          style={{
            transform: `translate(${handlePosition.x}px, ${handlePosition.y}px)`,
          }}
        />
      </div>
    </div>
  )
}

export default VirtualJoystick
