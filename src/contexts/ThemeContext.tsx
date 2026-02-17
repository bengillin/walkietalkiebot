import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export type ThemeName = 'mccallister' | 'imessage' | 'aol' | 'classic-mac' | 'geocities' | 'apple-1984'

export interface Theme {
  name: ThemeName
  displayName: string
  description: string
}

export const themes: Theme[] = [
  {
    name: 'mccallister',
    displayName: 'TalkBoy',
    description: 'Silver cassette recorder with chunky buttons and red accents.'
  },
  {
    name: 'imessage',
    displayName: 'Bubble',
    description: 'Minimal and polished, inspired by modern Apple interfaces.'
  },
  {
    name: 'aol',
    displayName: 'Dial-Up',
    description: 'Beveled gray panels and buddy list energy from the 90s internet.'
  },
  {
    name: 'classic-mac',
    displayName: 'Finder',
    description: 'The elegant gray desktop of classic Mac OS.'
  },
  {
    name: 'geocities',
    displayName: 'Guestbook',
    description: 'Neon text on dark backgrounds, like a 90s homepage under construction.'
  },
  {
    name: 'apple-1984',
    displayName: '1984',
    description: 'Rainbow Apple warmth from the original Macintosh era.'
  }
]

interface ThemeContextValue {
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
  themes: Theme[]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const saved = localStorage.getItem('talkie_theme')
    // Migrate old spelling to new spelling
    if (saved === 'mcallister') {
      localStorage.setItem('talkie_theme', 'mccallister')
      return 'mccallister'
    }
    return (saved as ThemeName) || 'mccallister'
  })

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme)
    localStorage.setItem('talkie_theme', newTheme)
  }

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
