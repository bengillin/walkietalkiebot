import { useEffect } from 'react'
import * as api from '../lib/api'
import { enableServerSync, setProjectId } from '../lib/store'

import { createLogger } from '../lib/logger'

const log = createLogger('sync')

export function useServerSync(
  migrateToServer: () => Promise<boolean>,
  syncFromServer: () => Promise<void>,
) {
  useEffect(() => {
    const initServerSync = async () => {
      try {
        const dbAvailable = await api.isDatabaseAvailable()
        if (dbAvailable) {
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
            const success = await migrateToServer()
            if (success) {
              log.debug('Migration complete')
              await syncFromServer()
            }
          } else {
            await syncFromServer()
          }
        }
      } catch (err) {
        log.warn('Server sync unavailable:', err)
      }
    }

    initServerSync()
  }, [migrateToServer, syncFromServer])
}
