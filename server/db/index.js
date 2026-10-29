import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { initSchema } from "./schema.js";
import { getWtbDir, migrateLegacyDataDir } from "../paths.js";
import { createLogger } from "../logger.js";
const log = createLogger("db");
let db = null;
function getDbPath() {
  return join(getWtbDir(), "wtb.db");
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
  migrateLegacyDataDir();
  const dbPath = getDbPath();
  const dbDir = dirname(dbPath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  initSchema(db);
  log.debug(`Database initialized at ${dbPath}`);
  return db;
}
function closeDb() {
  if (db) {
    db.close();
    db = null;
    log.debug("Database closed");
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
