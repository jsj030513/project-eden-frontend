import PrimaryButton from '../components/common/PrimaryButton'
import NpcDialogue from '../components/village/NpcDialogue'
import VillageScene from '../components/village/VillageScene'
import VillageStatusText from '../components/village/VillageStatusText'

function VillagePage({ onCapture }) {
  return (
    <main className="village-page page-enter">
      <header className="page-heading">
        <p className="eyebrow">MY EDEN · DAY 1</p>
        <h1>아침빛 마을</h1>
        <VillageStatusText />
      </header>

      <section className="village-stage" aria-label="아직 조용한 아침빛 마을">
        <VillageScene />
        <NpcDialogue />
      </section>

      <div className="village-actions">
        <PrimaryButton onClick={onCapture}>오늘의 순간 남기기 <span aria-hidden="true">✦</span></PrimaryButton>
        <p>한 장의 순간이 마을에 작은 변화를 만들어요.</p>
      </div>
    </main>
  )
}

export default VillagePage
