import { getDb } from "../index.js";
function listConversations(limit = 50, offset = 0) {
  const db = getDb();
  return db.prepare(`
    SELECT id, title, created_at, updated_at, project_id, parent_id
    FROM conversations
    ORDER BY updated_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}
function getConversation(id) {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, title, created_at, updated_at, project_id, parent_id
    FROM conversations
    WHERE id = ?
  `).get(id);
  return row || null;
}
function createConversation(input) {
  const db = getDb();
  const now = Date.now();
  const title = input.title || "New conversation";
  db.prepare(`
    INSERT INTO conversations (id, title, created_at, updated_at, project_id, parent_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(input.id, title, now, now, input.projectId || null, input.parentId || null);
  return {
    id: input.id,
    title,
    created_at: now,
    updated_at: now,
    project_id: input.projectId || null,
    parent_id: input.parentId || null
  };
}
function updateConversation(id, input) {
  const db = getDb();
  const existing = getConversation(id);
  if (!existing) return null;
  const now = Date.now();
  const updates = ["updated_at = ?"];
  const values = [now];
  if (input.title !== void 0) {
    updates.push("title = ?");
    values.push(input.title);
  }
  if (input.projectId !== void 0) {
    updates.push("project_id = ?");
    values.push(input.projectId);
  }
  if (input.parentId !== void 0) {
    updates.push("parent_id = ?");
    values.push(input.parentId);
  }
  values.push(id);
  db.prepare(`UPDATE conversations SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getConversation(id);
}
function deleteConversation(id) {
  const db = getDb();
  const result = db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
  return result.changes > 0;
}
function touchConversation(id) {
  const db = getDb();
  db.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(Date.now(), id);
}
function updateLinerNotes(id, linerNotes) {
  const db = getDb();
  db.prepare("UPDATE conversations SET liner_notes = ?, updated_at = ? WHERE id = ?").run(linerNotes, Date.now(), id);
}
function getLinerNotes(id) {
  const db = getDb();
  const row = db.prepare("SELECT liner_notes FROM conversations WHERE id = ?").get(id);
  return row?.liner_notes || null;
}
function countConversations() {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) as count FROM conversations").get();
  return row.count;
}
export {
  countConversations,
  createConversation,
  deleteConversation,
  getConversation,
  getLinerNotes,
  listConversations,
  touchConversation,
  updateConversation,
  updateLinerNotes
};
