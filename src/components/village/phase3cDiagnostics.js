const DEFAULTS = Object.freeze({
  activeMovementSchedulers: 0,
  maxActiveMovementSchedulers: 0,
  movementSchedulerStarts: 0,
  activeRafLoops: 0,
  maxActiveRafLoops: 0,
  rafStarts: 0,
  rafStops: 0,
  activeChunkRequests: 0,
  maxActiveChunkRequests: 0,
  revealTimersCreated: 0,
  activeRevealTimers: 0,
  maxActiveRevealTimers: 0,
  keyboardHandlers: 0,
  maxKeyboardHandlers: 0,
  hydrationTimeline: [],
  hydrationSnapshot: null,
})

export function phase3cDiagnostics() {
  if (typeof window === 'undefined') return null
  const environment = import.meta.env || {}
  if (!environment.DEV) return null
  if (!window.__edenPhase3cDiagnostics) {
    window.__edenPhase3cDiagnostics = { ...DEFAULTS }
  }
  return window.__edenPhase3cDiagnostics
}

export function incrementDiagnostic(name, maximumName) {
  const diagnostics = phase3cDiagnostics()
  if (!diagnostics) return
  diagnostics[name] = (diagnostics[name] || 0) + 1
  if (maximumName) {
    diagnostics[maximumName] = Math.max(diagnostics[maximumName] || 0, diagnostics[name])
  }
}

export function decrementDiagnostic(name) {
  const diagnostics = phase3cDiagnostics()
  if (!diagnostics) return
  diagnostics[name] = Math.max(0, (diagnostics[name] || 0) - 1)
}

export function recordHydrationDiagnostic(event, details = {}) {
  const diagnostics = phase3cDiagnostics()
  if (!diagnostics) return
  // Older runtime tests reset every diagnostic field numerically. Keep the
  // additive hydration timeline resilient to that legacy reset contract.
  if (!Array.isArray(diagnostics.hydrationTimeline)) diagnostics.hydrationTimeline = []
  const entry = {
    event,
    timestamp: performance.now(),
    ...details,
  }
  diagnostics.hydrationTimeline.push(entry)
  if (diagnostics.hydrationTimeline.length > 300) diagnostics.hydrationTimeline.shift()
  diagnostics.hydrationSnapshot = entry
}
