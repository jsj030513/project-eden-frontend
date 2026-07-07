function CapturePage({ onBack }) {
  return (
    <main className="capture-page page-enter">
      <div className="capture-view" aria-label="따뜻한 숲과 노을을 담는 카메라 화면">
        <div className="capture-sun" />
        <div className="capture-ridge capture-ridge--back" />
        <div className="capture-ridge capture-ridge--front" />
        <div className="capture-tree capture-tree--left" /><div className="capture-tree capture-tree--right" />
        <div className="capture-frame"><i /><i /><i /><i /></div>
        <div className="capture-focus" aria-hidden="true"><span /></div>
        <section className="capture-copy">
          <p className="eyebrow">TODAY'S MOMENT</p>
          <h1>오늘의 순간을<br />하나 남겨볼까요?</h1>
          <p>빛과 바람, 그리고 지금의 마음까지.<br />마을이 조용히 기억해 둘 거예요.</p>
          <button type="button" onClick={onBack}>마을로 돌아가기</button>
        </section>
        <div className="capture-hud">
          <span>EDEN CAM · 01</span><span>NO CAMERA · PROTOTYPE</span>
        </div>
      </div>
    </main>
  )
}

export default CapturePage
