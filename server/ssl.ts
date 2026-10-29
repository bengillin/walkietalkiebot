import { existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'

import { createLogger } from './logger.js'
import { getWtbDir, migrateLegacyDataDir } from './paths.js'

const log = createLogger('ssl')

export interface SSLCerts {
  cert: string
  key: string
}

/**
 * Ensure the data directory (see getWtbDir) exists, migrating from legacy paths if needed.
 */
export function ensureWtbDir(): void {
  migrateLegacyDataDir()
  const wtbDir = getWtbDir()
  if (!existsSync(wtbDir)) {
    mkdirSync(wtbDir, { recursive: true })
  }
  // Ensure modes directory exists for custom mode definitions
  const modesDir = join(wtbDir, 'modes')
  if (!existsSync(modesDir)) {
    mkdirSync(modesDir, { recursive: true })
  }
}

/**
 * Returns Tailscale HTTPS certs if available, otherwise null.
 * Localhost is already a secure context in browsers, so HTTPS is only
 * needed for remote access (e.g., via Tailscale).
 */
export function getSSLCerts(): SSLCerts | null {
  ensureWtbDir()

  const certPath = join(getWtbDir(), 'tailscale.crt')
  const keyPath = join(getWtbDir(), 'tailscale.key')
  if (existsSync(certPath) && existsSync(keyPath)) {
    log.debug('Using Tailscale HTTPS certificates')
    return {
      cert: readFileSync(certPath, 'utf-8'),
      key: readFileSync(keyPath, 'utf-8'),
    }
  }

  // No HTTPS needed for localhost — it's a secure context in all browsers
  return null
}
