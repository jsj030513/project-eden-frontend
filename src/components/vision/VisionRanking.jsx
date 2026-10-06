function VisionRanking({ result }) {
  const ranking = result?.ranking
  const canDisplay = result?.status === 'ranked'
    && Array.isArray(ranking)
    && ranking.length > 0
    && ranking.every((item) => item && Number.isInteger(item.rank) && item.rank >= 1
      && typeof item.display_name === 'string' && item.display_name.trim())

  if (!canDisplay) {
    return <p className="vision-ranking-notice" role="alert">분석 결과를 표시할 수 없습니다.</p>
  }

  return (
    <section className="vision-ranking" aria-label="사진 분석 후보">
      <h2>사진과 가까운 후보</h2>
      <p className="vision-ranking-notice">확정된 식별 결과가 아닙니다.</p>
      <ol className="vision-ranking-list" role="list">
        {ranking.map((item, index) => (
          <li key={`${item.rank}-${index}`} value={item.rank} className={`vision-ranking-item${index === 0 ? ' vision-ranking-primary' : ''}`}>
            <span className="vision-ranking-rank">{item.rank}</span>
            <div>
              <p className="vision-ranking-label">{index === 0 ? '가장 가까운 후보' : '다른 후보'}</p>
              <h3>{item.display_name}</h3>
              {typeof item.broad_category === 'string' && item.broad_category.trim()
                && <p className="vision-ranking-category">분류: {item.broad_category}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default VisionRanking
