import Database from "better-sqlite3";
import { existsSync, mkdirSync, renameSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { initSchema } from "./schema.js";
function migrateDataDir() {
  const wtbDir = join(homedir(), ".wtb");
  const oldDir2 = join(homedir(), ".talkie");
  const oldDir1 = join(homedir(), ".talkboy");
  if (existsSync(oldDir2) && !existsSync(wtbDir)) {
    console.log(`Migrating ${oldDir2} \u2192 ${wtbDir}`);
    renameSync(oldDir2, wtbDir);
  } else if (existsSync(oldDir1) && !existsSync(wtbDir)) {
    console.log(`Migrating ${oldDir1} \u2192 ${wtbDir}`);
    renameSync(oldDir1, wtbDir);
  }
}
let db = null;
function getDbPath() {
  return join(homedir(), ".wtb", "wtb.db");
}
function getDb() {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}
function initDb() {
  if (db) {
    return db;
  }
  migrateDataDir();
  const dbPath = getDbPath();
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  console.log(`Database initialized at ${dbPath}`);
  return db;
}
function closeDb() {
  if (db) {
    db.close();
    db = null;
    console.log("Database closed");
  }
}
function isDbConnected() {
  return db !== null;
}
function initDbForTesting(testDb) {
  testDb.pragma("foreign_keys = ON");
  initSchema(testDb);
  db = testDb;
}
export {
  closeDb,
  getDb,
  getDbPath,
  initDb,
  initDbForTesting,
  isDbConnected
};
