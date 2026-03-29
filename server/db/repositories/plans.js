import { getDb } from "../index.js";
function listPlans(limit = 50, offset = 0, conversationId) {
  const db = getDb();
  const query = `SELECT p.*, c.title as conversation_title FROM plans p LEFT JOIN conversations c ON p.conversation_id = c.id${conversationId ? " WHERE p.conversation_id = ?" : ""} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`;
  if (conversationId) {
    return db.prepare(query).all(conversationId, limit, offset);
  }
  return db.prepare(query).all(limit, offset);
}
function countPlansByConversation() {
  const db = getDb();
  const rows = db.prepare(
    "SELECT conversation_id, COUNT(*) as count FROM plans WHERE conversation_id IS NOT NULL AND status != 'archived' GROUP BY conversation_id"
  ).all();
  const result = {};
  for (const row of rows) {
    result[row.conversation_id] = row.count;
  }
  return result;
}
function getPlan(id) {
  const db = getDb();
  return db.prepare("SELECT * FROM plans WHERE id = ?").get(id);
}
function createPlan(plan) {
  const db = getDb();
  const now = Date.now();
  db.prepare(
    "INSERT INTO plans (id, title, content, status, conversation_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(
    plan.id,
    plan.title,
    plan.content,
    plan.status || "draft",
    plan.conversationId || null,
    now,
    now
  );
  return getPlan(plan.id);
}
function updatePlan(id, updates) {
  const db = getDb();
  const sets = ["updated_at = ?"];
  const values = [Date.now()];
  if (updates.title !== void 0) {
    sets.push("title = ?");
    values.push(updates.title);
  }
  if (updates.content !== void 0) {
    sets.push("content = ?");
    values.push(updates.content);
  }
  if (updates.status !== void 0) {
    sets.push("status = ?");
    values.push(updates.status);
  }
  values.push(id);
  db.prepare(`UPDATE plans SET ${sets.join(", ")} WHERE id = ?`).run(...values);
}
function deletePlan(id) {
  const db = getDb();
  db.prepare("DELETE FROM plans WHERE id = ?").run(id);
}
export {
  countPlansByConversation,
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  updatePlan
};
