import Database from 'better-sqlite3'
import { existsSync, mkdirSync, renameSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { initSchema } from './schema.js'

// One-time migration: rename ~/.talkboy/ or ~/.talkie/ → ~/.wtb/
function migrateDataDir() {
  const wtbDir = join(homedir(), '.wtb')
  const oldDir2 = join(homedir(), '.talkie')
  const oldDir1 = join(homedir(), '.talkboy')
  if (existsSync(oldDir2) && !existsSync(wtbDir)) {
    console.log(`Migrating ${oldDir2} → ${wtbDir}`)
    renameSync(oldDir2, wtbDir)
  } else if (existsSync(oldDir1) && !existsSync(wtbDir)) {
    console.log(`Migrating ${oldDir1} → ${wtbDir}`)
    renameSync(oldDir1, wtbDir)
  }
}

let db: Database.Database | null = null

export function getDbPath(): string {
  return join(homedir(), '.wtb', 'wtb.db')
}

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.')
  }
  return db
}

export function initDb(): Database.Database {
  if (db) {
    return db
  }

  migrateDataDir()

  const dbPath = getDbPath()
  const dbDir = dirname(dbPath)

  // Ensure directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  // Open database with WAL mode for better concurrency
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Initialize schema
  initSchema(db)

  console.log(`Database initialized at ${dbPath}`)
  return db
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
    console.log('Database closed')
  }
}

export function isDbConnected(): boolean {
  return db !== null
}

export function initDbForTesting(testDb: Database.Database): void {
  testDb.pragma('foreign_keys = ON')
  initSchema(testDb)
  db = testDb
}
