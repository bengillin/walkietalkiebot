import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export type ThemeName = 'mccallister' | 'imessage' | 'aol' | 'classic-mac' | 'geocities'

export interface Theme {
  name: ThemeName
  displayName: string
  description: string
}

export const themes: Theme[] = [
  {
    name: 'mccallister',
    displayName: 'Talkie',
    description: 'Silver 90s cassette recorder aesthetic'
  },
  {
    name: 'imessage',
    displayName: 'iMessage',
    description: 'Clean Apple-style light theme'
  },
  {
    name: 'aol',
    displayName: 'AOL 90s',
    description: 'Windows 95 / AOL Instant Messenger nostalgia'
  },
  {
    name: 'classic-mac',
    displayName: 'Classic Mac',
    description: 'Mac OS 7/8/9 Platinum appearance'
  },
  {
    name: 'geocities',
    displayName: 'Geocities',
    description: 'Neon-on-dark 90s personal homepage chaos'
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
