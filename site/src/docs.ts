import './style.css'
import './nav.css'
import './docs.css'

type ThemeName = 'mccallister' | 'imessage' | 'aol' | 'classic-mac' | 'geocities' | 'apple-1984'

const themes: ThemeName[] = ['mccallister', 'imessage', 'aol', 'classic-mac', 'geocities', 'apple-1984']

// ── Theme switching ──
function setTheme(name: ThemeName) {
  themes.forEach(t => document.documentElement.classList.remove(`theme-${t}`))
  document.documentElement.classList.add(`theme-${name}`)
  localStorage.setItem('talkie_theme', name)
}

function initTheme() {
  const saved = localStorage.getItem('talkie_theme') as ThemeName | null
  setTheme(saved && themes.includes(saved) ? saved : 'apple-1984')
}

// ── Mobile nav toggle ──
function initNavToggle() {
  const toggle = document.querySelector('.site-nav__toggle')
  const links = document.querySelector('.site-nav__links')
  if (!toggle || !links) return

  toggle.addEventListener('click', () => {
    links.classList.toggle('site-nav__links--open')
  })
}

// ── Sidebar scroll spy ──
function initScrollSpy() {
  const headings = document.querySelectorAll<HTMLElement>('.docs-content h2[id], .docs-content h3[id]')
  const sidebarLinks = document.querySelectorAll<HTMLAnchorElement>('.docs-sidebar__item a')
  if (headings.length === 0 || sidebarLinks.length === 0) return

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          sidebarLinks.forEach(link => link.classList.remove('active'))
          const activeLink = document.querySelector(`.docs-sidebar__item a[href="#${entry.target.id}"]`)
          if (activeLink) activeLink.classList.add('active')
        }
      })
    },
    { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
  )

  headings.forEach(h => observer.observe(h))
}

// ── Code copy buttons ──
function initCodeCopy() {
  document.querySelectorAll('.docs-content pre').forEach(pre => {
    const btn = document.createElement('button')
    btn.className = 'code-copy'
    btn.textContent = 'Copy'
    btn.addEventListener('click', () => {
      const code = pre.querySelector('code')
      if (code) {
        navigator.clipboard.writeText(code.textContent || '').then(() => {
          btn.textContent = 'Copied!'
          setTimeout(() => { btn.textContent = 'Copy' }, 1500)
        })
      }
    })
    pre.appendChild(btn)
  })
}

// ── Mobile sidebar toggle ──
function initSidebarToggle() {
  const toggle = document.querySelector('.docs-sidebar-toggle')
  const sidebar = document.querySelector('.docs-sidebar')
  if (!toggle || !sidebar) return

  toggle.addEventListener('click', () => {
    sidebar.classList.toggle('docs-sidebar--open')
  })
}

// ── Init ──
initTheme()
initNavToggle()
initScrollSpy()
initCodeCopy()
initSidebarToggle()
