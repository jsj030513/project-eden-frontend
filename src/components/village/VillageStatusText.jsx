import { useEffect, useState } from 'react'

function VillageStatusText({ message, isLoading }) {
  const displayMessage = isLoading ? '마을을 불러오고 있습니다...' : message || '아직 마을은 조용히 당신의 첫 순간을 기다리고 있습니다.'
  const [isVisible, setIsVisible] = useState(Boolean(displayMessage))

  useEffect(() => {
    if (!displayMessage) {
      setIsVisible(false)
      return undefined
    }

    setIsVisible(true)
    const hideTimer = window.setTimeout(() => setIsVisible(false), 2800)

    return () => window.clearTimeout(hideTimer)
  }, [displayMessage])

  if (!isVisible) return null

  return (
    <div className="village-status village-status--transient" role="status" aria-live="polite">
      <span aria-hidden="true">✦</span>
      <p>{displayMessage}</p>
    </div>
  )
}

export default VillageStatusText
