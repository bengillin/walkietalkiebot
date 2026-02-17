import Database from "better-sqlite3";
import { existsSync, mkdirSync, renameSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";
import { initSchema } from "./schema.js";
function migrateDataDir() {
  const oldDir = join(homedir(), ".talkboy");
  const newDir = join(homedir(), ".talkie");
  if (existsSync(oldDir) && !existsSync(newDir)) {
    console.log(`Migrating ${oldDir} \u2192 ${newDir}`);
    renameSync(oldDir, newDir);
  }
}
let db = null;
function getDbPath() {
  return join(homedir(), ".talkie", "talkie.db");
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
export {
  closeDb,
  getDb,
  getDbPath,
  initDb,
  isDbConnected
};
