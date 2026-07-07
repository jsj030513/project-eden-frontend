function AppShell({ children, onLogoClick }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" type="button" onClick={onLogoClick} aria-label="Project Eden 시작 화면">
          <span className="brand__mark" aria-hidden="true">E</span>
          <span>PROJECT EDEN</span>
        </button>
        <p>당신의 하루가 자라는 곳</p>
      </header>
      {children}
      <footer className="app-footer">PROJECT EDEN <span>·</span> A VILLAGE THAT REMEMBERS</footer>
    </div>
  )
}

export default AppShell
