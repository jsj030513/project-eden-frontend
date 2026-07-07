import NpcDialogue from '../components/village/NpcDialogue'
import VillageScene from '../components/village/VillageScene'
import VillageStatusText from '../components/village/VillageStatusText'

function VillagePage({ hasCaptured, onCapture }) {
  return (
    <main className="village-page page-enter">
      <section className="village-stage" aria-label="노을빛이 머무는 에덴 마을">
        <VillageScene />
        <NpcDialogue />
        <aside className="weather-panel" aria-label="마을 시간과 날씨">
          <span className="weather-panel__sun" aria-hidden="true">☀</span>
          <span><strong>늦은 오후</strong><small>따뜻한 바람 · 18°</small></span>
        </aside>
        <VillageStatusText hasCaptured={hasCaptured} />
        <div className="village-action-bar">
          <span><i aria-hidden="true">WASD</i> 천천히 마을 둘러보기</span>
          <button type="button" onClick={onCapture}><span aria-hidden="true">▣</span> 오늘의 순간 남기기</button>
        </div>
      </section>
    </main>
  )
}

export default VillagePage
