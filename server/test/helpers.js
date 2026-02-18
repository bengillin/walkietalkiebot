import Database from "better-sqlite3";
import { initDbForTesting } from "../db/index.js";
function createTestDb() {
  const db = new Database(":memory:");
  initDbForTesting(db);
  return db;
}
function resetTestDb() {
  return createTestDb();
}
export {
  createTestDb,
  resetTestDb
};
