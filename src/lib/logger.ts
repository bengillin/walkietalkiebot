/**
 * Small leveled logger for the browser.
 *
 * Replaces scattered `console.*` calls so that noisy diagnostics can be turned
 * down in production without deleting them, and so every line carries the scope
 * it came from.
 *
 * Level resolution, highest priority first:
 *   1. `localStorage['wtb:logLevel']` — set at runtime, survives reloads
 *   2. `debug` in a dev build, `warn` in a production build
 *
 * From the console: `localStorage.setItem('wtb:logLevel', 'debug')`, reload.
 */

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

const RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
}

const STORAGE_KEY = 'wtb:logLevel'

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value)
}

function defaultLevel(): LogLevel {
  return import.meta.env.DEV ? 'debug' : 'warn'
}

function storedLevel(): LogLevel | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isLogLevel(stored) ? stored : null
  } catch {
    // Private mode / disabled storage — fall back to the build default.
    return null
  }
}

let currentLevel: LogLevel = storedLevel() ?? defaultLevel()

export function getLogLevel(): LogLevel {
  return currentLevel
}

/** Change the level for this session, and remember it for future ones. */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level
  try {
    localStorage.setItem(STORAGE_KEY, level)
  } catch {
    // Non-fatal: the level still applies to this session.
  }
}

export interface Logger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/**
 * A logger tagged with its origin, e.g. `createLogger('voice')` emits
 * `[voice] …`. Prefer one per module over ad-hoc string prefixes.
 */
export function createLogger(scope: string): Logger {
  const tag = `[${scope}]`
  const at =
    (level: Exclude<LogLevel, 'silent'>, method: 'log' | 'warn' | 'error') =>
    (...args: unknown[]) => {
      if (RANK[level] < RANK[currentLevel]) return
      console[method](tag, ...args)
    }

  return {
    debug: at('debug', 'log'),
    info: at('info', 'log'),
    warn: at('warn', 'warn'),
    error: at('error', 'error'),
  }
}

// Expose a handle for interactive debugging without importing anything.
if (typeof window !== 'undefined') {
  ;(window as unknown as { wtbLogLevel: typeof setLogLevel }).wtbLogLevel = setLogLevel
}
