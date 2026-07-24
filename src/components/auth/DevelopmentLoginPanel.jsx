import { useEffect, useState } from 'react'

function DevelopmentLoginPanel({ mode, error, isLoading, onLogin, onSignup, onModeChange, onCreateCharacter }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nickname, setNickname] = useState('')
  const isSignupMode = mode === 'signup'

  useEffect(() => {
    if (mode === 'login') {
      setPassword('')
      setNickname('')
    }
  }, [mode])

  const submitLogin = (event) => {
    event.preventDefault()
    onLogin({ email, password })
  }

  const submitSignup = (event) => {
    event.preventDefault()
    onSignup({ email, password, nickname })
  }

  const switchToSignup = () => {
    setPassword('')
    setNickname('')
    onModeChange('signup')
  }

  const switchToLogin = () => {
    setPassword('')
    setNickname('')
    onModeChange('login')
  }

  return (
    <main className="auth-page page-enter">
      <section className="auth-panel">
        <p className="eyebrow">PROJECT EDEN · DEV ACCESS</p>
        <h1>마을에 들어가기</h1>
        <p className="auth-panel__copy">
          지금은 개발 중이라 작은 문을 먼저 지나가요.
          <br />이 문은 실제 백엔드 로그인 API와 연결되어 있습니다.
        </p>

        {mode === 'character' ? (
          <div className="auth-character">
            <p>아직 이 계정에는 마을을 걷는 캐릭터가 없어요.</p>
            <button type="button" onClick={onCreateCharacter} disabled={isLoading}>
              캐릭터 준비하기
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={isSignupMode ? submitSignup : submitLogin}>
            <label>
              <span>이메일</span>
              <input
                value={email}
                type="email"
                autoComplete="username"
                placeholder="example@gmail.com"
                required
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              <span>비밀번호</span>
              <input
                value={password}
                type="password"
                autoComplete={isSignupMode ? 'new-password' : 'current-password'}
                placeholder="비밀번호"
                required
                minLength={8}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {isSignupMode && (
              <label>
                <span>닉네임</span>
                <input
                  value={nickname}
                  type="text"
                  autoComplete="nickname"
                  placeholder="마을에서 불릴 이름"
                  required
                  minLength={2}
                  maxLength={20}
                  onChange={(event) => setNickname(event.target.value)}
                />
              </label>
            )}
            <div className="auth-actions">
              <button type="submit" disabled={isLoading}>{isSignupMode ? '시작 준비하기' : '들어가기'}</button>
              {isSignupMode ? (
                <button type="button" disabled={isLoading} onClick={switchToLogin}>이미 계정이 있어요</button>
              ) : (
                <button type="button" disabled={isLoading} onClick={switchToSignup}>처음이라면 시작하기</button>
              )}
            </div>
          </form>
        )}

        {isLoading && <p className="auth-panel__hint">마을 문이 천천히 열리고 있습니다.</p>}
        {error && <p className="auth-panel__error" role="alert">{error}</p>}
      </section>
    </main>
  )
}

export default DevelopmentLoginPanel
