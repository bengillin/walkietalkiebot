import { existsSync, renameSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

import { createLogger } from './logger.js'

const log = createLogger('paths')

/**
 * The data directory: database, custom modes, logs, pid file and Tailscale certs.
 *
 * Defaults to `~/.wtb`. `WTB_DIR` overrides it, which is how tests and side-by-side
 * installs keep away from the user's real data. Read on every call (not cached) so
 * a test can set the variable before the first DB access.
 */
export function getWtbDir(): string {
  const override = process.env.WTB_DIR
  return override && override.length > 0 ? resolve(override) : join(homedir(), '.wtb')
}

/**
 * One-time rename of the legacy `~/.talkie` / `~/.talkboy` data dirs to `~/.wtb`.
 * Skipped when `WTB_DIR` is set: an explicit location must never adopt someone
 * else's data as a side effect.
 */
export function migrateLegacyDataDir(): void {
  if (process.env.WTB_DIR) return
  const wtbDir = getWtbDir()
  if (existsSync(wtbDir)) return
  for (const legacy of ['.talkie', '.talkboy']) {
    const dir = join(homedir(), legacy)
    if (existsSync(dir)) {
      log.info(`Migrating ${dir} → ${wtbDir}`)
      renameSync(dir, wtbDir)
      return
    }
  }
}
