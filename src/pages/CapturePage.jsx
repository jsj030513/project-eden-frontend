import PrimaryButton from '../components/common/PrimaryButton'

function CapturePage({ onBack }) {
  return (
    <main className="capture-page page-enter">
      <button className="text-button" type="button" onClick={onBack}>← 마을로 돌아가기</button>
      <section className="capture-card">
        <div className="capture-frame" aria-label="카메라가 들어갈 자리">
          <div className="capture-corners" />
          <div className="camera-icon" aria-hidden="true"><span /></div>
          <p>오늘의 순간을 바라보는 창</p>
          <small>카메라는 다음 여정에서 만나요</small>
        </div>
        <div className="capture-copy">
          <p className="eyebrow">TODAY'S MOMENT</p>
          <h1>어떤 하루를<br />보내고 있나요?</h1>
          <p>지금은 UX 프로토타입입니다.<br />당신의 순간을 남기는 경험을 준비하고 있어요.</p>
          <PrimaryButton onClick={onBack}>마을로 돌아가기</PrimaryButton>
        </div>
      </section>
    </main>
  )
}

export default CapturePage
