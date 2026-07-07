import PrimaryButton from '../components/common/PrimaryButton'
import VillageScene from '../components/village/VillageScene'

function LandingPage({ onStart }) {
  return (
    <main className="landing page-enter">
      <section className="landing__copy">
        <p className="eyebrow">A LITTLE WORLD OF YOUR DAYS</p>
        <h1>세상이 당신을<br />기억합니다.</h1>
        <p className="landing__description">
          당신은 마을을 꾸미지 않습니다.<br />
          마을이 당신을 닮아갑니다.
        </p>
        <PrimaryButton onClick={onStart}>나의 마을 만나기 <span aria-hidden="true">→</span></PrimaryButton>
      </section>
      <div className="landing__visual" aria-hidden="true">
        <div className="sun-glow" />
        <VillageScene compact />
        <p className="visual-note">오늘의 기억이 내일의 풍경이 됩니다</p>
      </div>
    </main>
  )
}

export default LandingPage
