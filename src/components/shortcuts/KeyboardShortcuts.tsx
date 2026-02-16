import './KeyboardShortcuts.css'

interface KeyboardShortcutsProps {
  isOpen: boolean
  onClose: () => void
}

const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform)
const modKey = isMac ? 'Cmd' : 'Ctrl'

type ShortcutEntry =
  | { section: string }
  | { keys: string[]; desc: string }

const SHORTCUTS: ShortcutEntry[] = [
  { section: 'Voice' },
  { keys: ['Space'], desc: 'Hold to talk (push-to-talk mode)' },
  { keys: ['Esc'], desc: 'Cancel recording' },
  { section: 'Navigation' },
  { keys: [modKey, 'E'], desc: 'Export current tape as Markdown' },
  { keys: [modKey, 'K'], desc: 'Focus search' },
  { keys: ['?'], desc: 'Show keyboard shortcuts' },
]

export function KeyboardShortcuts({ isOpen, onClose }: KeyboardShortcutsProps) {
  if (!isOpen) return null

  return (
    <div className="shortcuts" onClick={onClose}>
      <div className="shortcuts__panel" onClick={e => e.stopPropagation()}>
        <div className="shortcuts__header">
          <h3 className="shortcuts__title">Keyboard Shortcuts</h3>
          <button className="shortcuts__close" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        </div>

        <div className="shortcuts__list">
          {SHORTCUTS.map((entry, i) => {
            if ('section' in entry) {
              return (
                <div key={i} className="shortcuts__section">
                  {entry.section}
                </div>
              )
            }
            return (
              <div key={i} className="shortcuts__row">
                <div className="shortcuts__keys">
                  {entry.keys.map((key, j) => (
                    <span key={j}>
                      <kbd className="shortcuts__key">{key}</kbd>
                      {j < entry.keys.length - 1 && <span className="shortcuts__plus">+</span>}
                    </span>
                  ))}
                </div>
                <span className="shortcuts__desc">{entry.desc}</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
