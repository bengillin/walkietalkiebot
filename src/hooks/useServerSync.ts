import { useEffect } from 'react'
import * as api from '../lib/api'
import { enableServerSync } from '../lib/store'

export function useServerSync(
  migrateToServer: () => Promise<boolean>,
  syncFromServer: () => Promise<void>
) {
  useEffect(() => {
    const initServerSync = async () => {
      try {
        const dbAvailable = await api.isDatabaseAvailable()
        if (dbAvailable) {
          enableServerSync()

          if (api.needsMigration()) {
            console.log('Migrating localStorage data to server...')
            const success = await migrateToServer()
            if (success) {
              console.log('Migration complete')
              await syncFromServer()
            }
          } else {
            await syncFromServer()
          }
        }
      } catch (err) {
        console.warn('Server sync unavailable:', err)
      }
    }

    initServerSync()
  }, [migrateToServer, syncFromServer])
}
