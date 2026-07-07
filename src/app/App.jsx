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

  const renderPage = () => {
    switch (page) {
      case PAGES.VILLAGE:
        return <VillagePage onCapture={() => setPage(PAGES.CAPTURE)} />
      case PAGES.CAPTURE:
        return <CapturePage onBack={() => setPage(PAGES.VILLAGE)} />
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
