/**
 * Small leveled logger for the server.
 *
 * Mirrors the browser logger in `src/lib/logger.ts` — deliberately duplicated
 * rather than shared, because the two live in separate TypeScript projects with
 * different runtimes and the module is small enough that a shared package would
 * cost more than it saves.
 *
 * Level comes from `WTB_LOG_LEVEL` (debug | info | warn | error | silent),
 * defaulting to `info`. Diagnostics go to stdout, warnings and errors to
 * stderr, so `wtb-server logs` can separate them.
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

function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value)
}

function resolveLevel(): LogLevel {
  const fromEnv = process.env.WTB_LOG_LEVEL?.toLowerCase()
  return isLogLevel(fromEnv) ? fromEnv : 'info'
}

let currentLevel: LogLevel = resolveLevel()

export function getLogLevel(): LogLevel {
  return currentLevel
}

export function setLogLevel(level: LogLevel): void {
  currentLevel = level
}

/** Re-read WTB_LOG_LEVEL. Test seam. */
export function _reloadLogLevel(): void {
  currentLevel = resolveLevel()
}

export interface Logger {
  debug: (...args: unknown[]) => void
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

/** A logger tagged with its origin, e.g. `createLogger('jobs')` emits `[jobs] …`. */
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
