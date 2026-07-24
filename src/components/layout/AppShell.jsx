function AppShell({ children, onLogoClick, currentPage }) {
  return (
    <div className={`app-shell${currentPage ? ` app-shell--${currentPage}` : ''}`}>
      <header className="app-header">
        <button className="brand" type="button" onClick={onLogoClick} aria-label="Project Eden 시작 화면">
          <span className="brand__mark" aria-hidden="true">E</span>
          <span>PROJECT EDEN</span>
        </button>
      </header>
      {children}
    </div>
  )
}

export default AppShell
