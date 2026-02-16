import { getDb } from "../index.js";
function createJob(input) {
  const db = getDb();
  const now = Date.now();
  db.prepare(`
    INSERT INTO jobs (id, conversation_id, prompt, status, source, created_at, updated_at)
    VALUES (?, ?, ?, 'queued', ?, ?, ?)
  `).run(input.id, input.conversationId, input.prompt, input.source || "web", now, now);
  return getJob(input.id);
}
function getJob(id) {
  const db = getDb();
  const row = db.prepare(`
    SELECT id, conversation_id, prompt, status, source, result, error, pid,
           created_at, updated_at, started_at, completed_at
    FROM jobs WHERE id = ?
  `).get(id);
  return row || null;
}
function listJobs(filters, limit = 50) {
  const db = getDb();
  const conditions = [];
  const params = [];
  if (filters?.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  if (filters?.conversationId) {
    conditions.push("conversation_id = ?");
    params.push(filters.conversationId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(limit);
  return db.prepare(`
    SELECT id, conversation_id, prompt, status, source, result, error, pid,
           created_at, updated_at, started_at, completed_at
    FROM jobs ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...params);
}
function updateJob(id, input) {
  const db = getDb();
  const updates = ["updated_at = ?"];
  const values = [Date.now()];
  if (input.status !== void 0) {
    updates.push("status = ?");
    values.push(input.status);
  }
  if (input.result !== void 0) {
    updates.push("result = ?");
    values.push(input.result);
  }
  if (input.error !== void 0) {
    updates.push("error = ?");
    values.push(input.error);
  }
  if (input.pid !== void 0) {
    updates.push("pid = ?");
    values.push(input.pid);
  }
  if (input.started_at !== void 0) {
    updates.push("started_at = ?");
    values.push(input.started_at);
  }
  if (input.completed_at !== void 0) {
    updates.push("completed_at = ?");
    values.push(input.completed_at);
  }
  values.push(id);
  db.prepare(`UPDATE jobs SET ${updates.join(", ")} WHERE id = ?`).run(...values);
  return getJob(id);
}
function createJobEvent(input) {
  const db = getDb();
  const timestamp = Date.now();
  const result = db.prepare(`
    INSERT INTO job_events (job_id, event_type, data, timestamp)
    VALUES (?, ?, ?, ?)
  `).run(input.jobId, input.eventType, input.data || null, timestamp);
  return {
    id: Number(result.lastInsertRowid),
    job_id: input.jobId,
    event_type: input.eventType,
    data: input.data || null,
    timestamp
  };
}
function getJobEvents(jobId, since) {
  const db = getDb();
  if (since) {
    return db.prepare(`
      SELECT id, job_id, event_type, data, timestamp
      FROM job_events
      WHERE job_id = ? AND timestamp > ?
      ORDER BY timestamp ASC
    `).all(jobId, since);
  }
  return db.prepare(`
    SELECT id, job_id, event_type, data, timestamp
    FROM job_events
    WHERE job_id = ?
    ORDER BY timestamp ASC
  `).all(jobId);
}
function cleanupStaleJobs() {
  const db = getDb();
  const result = db.prepare(`
    UPDATE jobs SET status = 'failed', error = 'Server restarted', updated_at = ?, completed_at = ?
    WHERE status IN ('queued', 'running')
  `).run(Date.now(), Date.now());
  return result.changes;
}
function deleteJob(id) {
  const db = getDb();
  const result = db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
  return result.changes > 0;
}
export {
  cleanupStaleJobs,
  createJob,
  createJobEvent,
  deleteJob,
  getJob,
  getJobEvents,
  listJobs,
  updateJob
};
