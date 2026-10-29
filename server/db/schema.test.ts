import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { initSchema } from './schema.js'

describe('initSchema', () => {
  it('migrates a fresh database to the current version', () => {
    const db = new Database(':memory:')
    initSchema(db)
    const { version } = db.prepare('SELECT MAX(version) AS version FROM schema_version').get() as {
      version: number
    }
    expect(version).toBeGreaterThanOrEqual(6)
  })

  it('refuses a database written by a newer version instead of touching it', () => {
    const db = new Database(':memory:')
    db.exec('CREATE TABLE schema_version (version INTEGER PRIMARY KEY)')
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(999)
    expect(() => initSchema(db)).toThrow(/only understands up to/)
  })

  it('is idempotent', () => {
    const db = new Database(':memory:')
    initSchema(db)
    expect(() => initSchema(db)).not.toThrow()
  })
})
