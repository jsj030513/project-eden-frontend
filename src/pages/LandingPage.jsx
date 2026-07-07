import PrimaryButton from '../components/common/PrimaryButton'
import VillageScene from '../components/village/VillageScene'

function LandingPage({ onStart }) {
  return (
    <main className="landing page-enter">
      <div className="landing__world" aria-hidden="true">
        <VillageScene compact />
        <div className="landing__shade" />
      </div>
      <section className="landing__copy">
        <p className="eyebrow">PROJECT EDEN · DAY ONE</p>
        <h1>세상이 당신을<br />기억합니다.</h1>
        <p className="landing__description">
          당신은 마을을 꾸미지 않습니다.<br />
          마을이 당신을 닮아갑니다.
        </p>
        <PrimaryButton onClick={onStart}>마을로 들어가기 <span aria-hidden="true">›</span></PrimaryButton>
      </section>
      <p className="landing__hint">ENTER EDEN · YOUR LITTLE WORLD AWAITS</p>
    </main>
  )
}

export default LandingPage
