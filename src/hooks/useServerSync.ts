import { useEffect } from 'react'
import * as api from '../lib/api'
import { enableServerSync, setProjectId } from '../lib/store'

import { createLogger } from '../lib/logger'

const log = createLogger('sync')

// While the server is unreachable (not started yet, restarting), keep checking:
// messages written meanwhile are cached as unsynced and posted once it is up.
const RETRY_BASE_MS = 2000
const RETRY_MAX_MS = 60_000

export function useServerSync(
  migrateToServer: () => Promise<boolean>,
  syncFromServer: () => Promise<void>,
) {
  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempt = 0

    const initServerSync = async () => {
      let dbAvailable = false
      try {
        dbAvailable = await api.isDatabaseAvailable()
      } catch (err) {
        log.debug('Server not reachable yet:', err)
      }
      if (cancelled) return
      if (!dbAvailable) {
        const delay = Math.min(RETRY_BASE_MS * 2 ** attempt++, RETRY_MAX_MS)
        timer = setTimeout(initServerSync, delay)
        return
      }

      try {
        enableServerSync()

        // Capture project ID from server's working directory
        try {
          const status = await api.getStatus()
          if (status.cwd) setProjectId(status.cwd)
        } catch {
          /* non-critical */
        }

        if (api.needsMigration()) {
          log.debug('Migrating localStorage data to server...')
          // Tapes that failed to upload are retried next load; sync regardless
          if (await migrateToServer()) log.debug('Migration complete')
        }
        await syncFromServer()
      } catch (err) {
        log.warn('Server sync unavailable:', err)
      }
    }

    initServerSync()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [migrateToServer, syncFromServer])
}
