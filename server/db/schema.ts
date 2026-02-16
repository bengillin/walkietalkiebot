import type Database from 'better-sqlite3'

const SCHEMA_VERSION = 2

export function initSchema(db: Database.Database): void {
  // Create schema version table
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )
  `)

  // Check current version
  const row = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number } | undefined
  const currentVersion = row?.version || 0

  if (currentVersion < SCHEMA_VERSION) {
    runMigrations(db, currentVersion)
  }
}

function runMigrations(db: Database.Database, fromVersion: number): void {
  const migrations: Array<(db: Database.Database) => void> = [
    migrateV1,
    migrateV2,
  ]

  for (let i = fromVersion; i < migrations.length; i++) {
    console.log(`Running migration to version ${i + 1}...`)
    migrations[i](db)
    db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(i + 1)
  }

  console.log(`Schema migrated to version ${SCHEMA_VERSION}`)
}

function migrateV1(db: Database.Database): void {
  db.exec(`
    -- Conversations
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL DEFAULT 'New conversation',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      project_id TEXT,
      parent_id TEXT
    );

    -- Messages
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      position INTEGER NOT NULL,
      source TEXT DEFAULT 'web'
    );

    -- Message images
    CREATE TABLE message_images (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      data_url TEXT NOT NULL,
      file_name TEXT NOT NULL,
      description TEXT,
      position INTEGER DEFAULT 0
    );

    -- Activities (tool usage)
    CREATE TABLE activities (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      tool TEXT NOT NULL,
      input TEXT,
      status TEXT NOT NULL CHECK (status IN ('complete', 'error')),
      timestamp INTEGER NOT NULL,
      duration INTEGER,
      error TEXT
    );

    -- Telegram user state
    CREATE TABLE telegram_state (
      user_id INTEGER PRIMARY KEY,
      current_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
      updated_at INTEGER NOT NULL
    );

    -- Full-text search
    CREATE VIRTUAL TABLE messages_fts USING fts5(
      content,
      content='messages',
      content_rowid='rowid'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER messages_ai AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
    END;

    CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
    END;

    CREATE TRIGGER messages_au AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
      INSERT INTO messages_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
    END;

    -- Indexes
    CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);
    CREATE INDEX idx_messages_conversation ON messages(conversation_id, position);
    CREATE INDEX idx_activities_conversation ON activities(conversation_id, timestamp DESC);
  `)
}

function migrateV2(db: Database.Database): void {
  db.exec(`
    -- Background jobs
    CREATE TABLE jobs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      prompt TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
      source TEXT NOT NULL DEFAULT 'web',
      result TEXT,
      error TEXT,
      pid INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER
    );

    -- Job event stream
    CREATE TABLE job_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      data TEXT,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX idx_jobs_status ON jobs(status);
    CREATE INDEX idx_jobs_conversation ON jobs(conversation_id);
    CREATE INDEX idx_job_events_job ON job_events(job_id, timestamp);
  `)
}
