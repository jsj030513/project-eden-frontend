export async function configureResourceStableRendering(page) {
  // These suites validate state, persistence, accessibility and interaction
  // contracts, not animation timing. Respect reduced motion and pause decorative
  // infinite animations so two real Chromium workers cannot starve localhost
  // API and React hydration work on constrained development machines.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const install = () => {
      if (document.getElementById('eden-e2e-resource-stable-rendering')) return
      const style = document.createElement('style')
      style.id = 'eden-e2e-resource-stable-rendering'
      style.textContent = '*,*::before,*::after{animation:none!important;transition:none!important}'
      document.head.append(style)
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', install, { once: true })
    } else {
      install()
    }
  })
}
