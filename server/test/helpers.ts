import Database from 'better-sqlite3'
import { initDbForTesting } from '../db/index.js'

export function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  initDbForTesting(db)
  return db
}

export function resetTestDb(): Database.Database {
  return createTestDb()
}
