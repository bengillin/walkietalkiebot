import './style.css'

type ThemeName = 'mccallister' | 'imessage' | 'aol' | 'classic-mac' | 'geocities' | 'apple-1984'

interface Theme {
  name: ThemeName
  displayName: string
  description: string
}

const themes: Theme[] = [
  { name: 'mccallister', displayName: 'TalkBoy', description: 'Silver cassette recorder with chunky buttons and red accents.' },
  { name: 'imessage', displayName: 'Bubble', description: 'Minimal and polished, inspired by modern Apple interfaces.' },
  { name: 'aol', displayName: 'Dial-Up', description: 'Beveled gray panels and buddy list energy from the 90s internet.' },
  { name: 'classic-mac', displayName: 'Finder', description: 'The elegant gray desktop of classic Mac OS.' },
  { name: 'geocities', displayName: 'Guestbook', description: 'Neon text on dark backgrounds, like a 90s homepage under construction.' },
  { name: 'apple-1984', displayName: '1984', description: 'Rainbow Apple warmth from the original Macintosh era.' },
]

const robotStates = ['idle', 'listening', 'thinking', 'speaking', 'happy'] as const

// ── Theme switching ──
function setTheme(name: ThemeName) {
  // Global page theming via class on <html>
  themes.forEach(t => document.documentElement.classList.remove(`theme-${t.name}`))
  document.documentElement.classList.add(`theme-${name}`)

  // Scoped robot theming on hero wrapper
  const heroScope = document.getElementById('hero-scope')
  if (heroScope) heroScope.setAttribute('data-theme', name)

  localStorage.setItem('talkie_theme', name)
}

function initTheme() {
  const saved = localStorage.getItem('talkie_theme') as ThemeName | null
  setTheme(saved && themes.some(t => t.name === saved) ? saved : 'mccallister')
}

// ── Robot animation cycling ──
function initRobotCycling() {
  const heroRobot = document.getElementById('hero-robot')
  if (!heroRobot) return

  let stateIndex = 0
  setInterval(() => {
    // Remove all state classes
    robotStates.forEach(s => heroRobot.classList.remove(`robot--${s}`))
    stateIndex = (stateIndex + 1) % robotStates.length
    heroRobot.classList.add(`robot--${robotStates[stateIndex]}`)
  }, 3000)
}

// ── Cassette reel spin ──
function initReelSpin() {
  const reels = document.querySelectorAll<HTMLElement>('.cassette__reel')
  if (reels.length === 0) return

  let rotation = 0
  function spin() {
    rotation = (rotation + 1.5) % 360
    reels.forEach(reel => {
      reel.style.transform = `rotate(${rotation}deg)`
    })
    requestAnimationFrame(spin)
  }
  requestAnimationFrame(spin)
}

// ── Copy to clipboard ──
function initCopy() {
  document.querySelectorAll<HTMLElement>('[data-copy]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation()
      const text = el.dataset.copy!
      const cmd = el.querySelector('.hero__install-cmd') as HTMLElement | null
      navigator.clipboard.writeText(text).then(() => {
        if (cmd) {
          const orig = cmd.textContent
          cmd.textContent = 'Copied!'
          setTimeout(() => { cmd.textContent = orig }, 1500)
        }
      })
    })
  })
}

// ── Theme card clicks ──
function initThemeCards() {
  document.querySelectorAll<HTMLElement>('.theme-card').forEach(card => {
    card.addEventListener('click', () => {
      const name = card.dataset.theme as ThemeName
      if (name) setTheme(name)
    })
  })
}

// ── Init ──
initTheme()
initRobotCycling()
initReelSpin()
initCopy()
initThemeCards()

