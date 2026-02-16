import { getDb } from "../index.js";
function listPlans(limit = 50, offset = 0) {
  const db = getDb();
  return db.prepare(
    "SELECT * FROM plans ORDER BY updated_at DESC LIMIT ? OFFSET ?"
  ).all(limit, offset);
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
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  updatePlan
};
