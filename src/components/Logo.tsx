import { useTheme } from '../contexts/ThemeContext'

export function Logo({ className }: { className?: string }) {
  const { theme } = useTheme()

  return (
    <span className={`app__text-logo app__text-logo--${theme} ${className || ''}`}>
      Talkie
    </span>
  )
}
