import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export type ThemeName = 'mccallister'

export interface Theme {
  name: ThemeName
  displayName: string
  description: string
}

export const themes: Theme[] = [
  {
    name: 'mccallister',
    displayName: 'Talkboy',
    description: 'Silver 90s cassette recorder aesthetic'
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
    const saved = localStorage.getItem('talkboy_theme')
    // Migrate old spelling to new spelling
    if (saved === 'mcallister') {
      localStorage.setItem('talkboy_theme', 'mccallister')
      return 'mccallister'
    }
    return (saved as ThemeName) || 'mccallister'
  })

  const setTheme = (newTheme: ThemeName) => {
    setThemeState(newTheme)
    localStorage.setItem('talkboy_theme', newTheme)
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
