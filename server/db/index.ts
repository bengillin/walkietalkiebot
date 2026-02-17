import Database from 'better-sqlite3'
import { existsSync, mkdirSync, renameSync } from 'fs'
import { dirname, join } from 'path'
import { homedir } from 'os'
import { initSchema } from './schema.js'

// One-time migration: rename ~/.talkboy/ → ~/.talkie/
function migrateDataDir() {
  const oldDir = join(homedir(), '.talkboy')
  const newDir = join(homedir(), '.talkie')
  if (existsSync(oldDir) && !existsSync(newDir)) {
    console.log(`Migrating ${oldDir} → ${newDir}`)
    renameSync(oldDir, newDir)
  }
}

let db: Database.Database | null = null

export function getDbPath(): string {
  return join(homedir(), '.talkie', 'talkie.db')
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
