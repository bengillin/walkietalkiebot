import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

export type ThemeName = 'imessage' | 'mcallister'

export interface Theme {
  name: ThemeName
  displayName: string
  description: string
}

export const themes: Theme[] = [
  {
    name: 'mcallister',
    displayName: 'Talkboy',
    description: 'Silver 90s cassette recorder aesthetic'
  },
  {
    name: 'imessage',
    displayName: 'iMessage',
    description: 'Clean, modern iOS-inspired design'
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
    return (saved as ThemeName) || 'mcallister'
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
