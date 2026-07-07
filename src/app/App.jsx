import { useState } from 'react'
import AppShell from '../components/layout/AppShell'
import LandingPage from '../pages/LandingPage'
import VillagePage from '../pages/VillagePage'
import CapturePage from '../pages/CapturePage'

const PAGES = {
  LANDING: 'landing',
  VILLAGE: 'village',
  CAPTURE: 'capture',
}

function App() {
  const [page, setPage] = useState(PAGES.LANDING)
  const [hasCaptured, setHasCaptured] = useState(false)

  const returnToVillage = () => {
    setHasCaptured(true)
    setPage(PAGES.VILLAGE)
  }

  const renderPage = () => {
    switch (page) {
      case PAGES.VILLAGE:
        return <VillagePage hasCaptured={hasCaptured} onCapture={() => setPage(PAGES.CAPTURE)} />
      case PAGES.CAPTURE:
        return <CapturePage onBack={returnToVillage} />
      default:
        return <LandingPage onStart={() => setPage(PAGES.VILLAGE)} />
    }
  }

  return (
    <AppShell onLogoClick={() => setPage(PAGES.LANDING)}>
      {renderPage()}
    </AppShell>
  )
}

export default App
