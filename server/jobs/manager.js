import { spawnClaude } from "./runner.js";
import { getNotificationDispatcher } from "../notifications/dispatcher.js";
import * as jobsRepo from "../db/repositories/jobs.js";
import * as messagesRepo from "../db/repositories/messages.js";
import * as conversationsRepo from "../db/repositories/conversations.js";
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
class JobManager {
  currentHandle = null;
  currentJobId = null;
  subscribers = /* @__PURE__ */ new Map();
  init() {
    const cleaned = jobsRepo.cleanupStaleJobs();
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} stale jobs from previous run`);
    }
  }
  createJob(params) {
    const id = generateId();
    const job = jobsRepo.createJob({
      id,
      conversationId: params.conversationId,
      prompt: params.prompt,
      source: params.source || "web"
    });
    if (params.history && params.history.length > 0) {
      jobsRepo.createJobEvent({
        jobId: id,
        eventType: "context",
        data: JSON.stringify(params.history)
      });
    }
    this.emitEvent(id, {
      type: "status_change",
      data: JSON.stringify({ status: "queued", jobId: id })
    });
    this.processNext();
    return job;
  }
  getJob(id) {
    return jobsRepo.getJob(id);
  }
  listJobs(filters) {
    return jobsRepo.listJobs(filters);
  }
  getJobEvents(jobId, since) {
    return jobsRepo.getJobEvents(jobId, since);
  }
  cancelJob(id) {
    const job = jobsRepo.getJob(id);
    if (!job) return false;
    if (job.status === "queued") {
      jobsRepo.updateJob(id, { status: "cancelled", completed_at: Date.now() });
      this.emitEvent(id, {
        type: "status_change",
        data: JSON.stringify({ status: "cancelled" })
      });
      return true;
    }
    if (job.status === "running" && this.currentJobId === id && this.currentHandle) {
      this.currentHandle.kill();
      jobsRepo.updateJob(id, { status: "cancelled", completed_at: Date.now() });
      this.emitEvent(id, {
        type: "status_change",
        data: JSON.stringify({ status: "cancelled" })
      });
      this.currentHandle = null;
      this.currentJobId = null;
      this.processNext();
      return true;
    }
    return false;
  }
  subscribe(jobId, callback) {
    if (!this.subscribers.has(jobId)) {
      this.subscribers.set(jobId, /* @__PURE__ */ new Set());
    }
    this.subscribers.get(jobId).add(callback);
    return () => {
      const subs = this.subscribers.get(jobId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(jobId);
        }
      }
    };
  }
  emitEvent(jobId, event) {
    const subs = this.subscribers.get(jobId);
    if (subs) {
      for (const callback of subs) {
        try {
          callback(event);
        } catch (e) {
          console.error("Job event subscriber error:", e);
        }
      }
    }
  }
  processNext() {
    if (this.currentHandle) return;
    const queued = jobsRepo.listJobs({ status: "queued" });
    if (queued.length === 0) return;
    queued.sort((a, b) => a.created_at - b.created_at);
    const job = queued[0];
    this.runJob(job);
  }
  async runJob(job) {
    const jobId = job.id;
    this.currentJobId = jobId;
    jobsRepo.updateJob(jobId, { status: "running", started_at: Date.now() });
    this.emitEvent(jobId, {
      type: "status_change",
      data: JSON.stringify({ status: "running" })
    });
    let history = [];
    const events = jobsRepo.getJobEvents(jobId);
    const contextEvent = events.find((e) => e.event_type === "context");
    if (contextEvent?.data) {
      try {
        history = JSON.parse(contextEvent.data);
      } catch {
      }
    }
    let fullResponse = "";
    const handle = spawnClaude({
      prompt: job.prompt,
      history,
      callbacks: {
        onText: (text) => {
          fullResponse += text;
          jobsRepo.createJobEvent({
            jobId,
            eventType: "text",
            data: text
          });
          this.emitEvent(jobId, {
            type: "text",
            data: JSON.stringify({ text })
          });
        },
        onActivity: (event) => {
          jobsRepo.createJobEvent({
            jobId,
            eventType: event.type,
            data: JSON.stringify(event)
          });
          this.emitEvent(jobId, {
            type: "activity",
            data: JSON.stringify(event)
          });
        },
        onError: (error) => {
          jobsRepo.createJobEvent({
            jobId,
            eventType: "error",
            data: error
          });
          this.emitEvent(jobId, {
            type: "error",
            data: JSON.stringify({ error })
          });
        },
        onComplete: (code) => {
          const currentJob = jobsRepo.getJob(jobId);
          if (currentJob?.status === "cancelled") return;
          const now = Date.now();
          const status = code === 0 ? "completed" : "failed";
          const error = code !== 0 ? `Process exited with code ${code}` : void 0;
          jobsRepo.updateJob(jobId, {
            status,
            result: fullResponse || null,
            error: error || void 0,
            completed_at: now
          });
          if (fullResponse.trim()) {
            try {
              const msgId = generateId();
              messagesRepo.createMessage({
                id: msgId,
                conversationId: job.conversation_id,
                role: "assistant",
                content: fullResponse,
                source: "job"
              });
              conversationsRepo.touchConversation(job.conversation_id);
            } catch (e) {
              console.error("Failed to save job response as message:", e);
            }
          }
          this.emitEvent(jobId, {
            type: "status_change",
            data: JSON.stringify({ status, result: fullResponse, error })
          });
          const dispatcher = getNotificationDispatcher();
          const notification = status === "completed" ? {
            type: "job_completed",
            jobId,
            title: "Talkie: Task complete",
            body: fullResponse.slice(0, 80) || "Done."
          } : {
            type: "job_failed",
            jobId,
            title: "Talkie: Task failed",
            body: error || "Unknown error"
          };
          dispatcher.dispatch(notification).catch((e) => {
            console.error("Notification dispatch failed:", e);
          });
          this.currentHandle = null;
          this.currentJobId = null;
          this.processNext();
        }
      }
    });
    this.currentHandle = handle;
    jobsRepo.updateJob(jobId, { pid: handle.pid });
  }
}
let manager = null;
function getJobManager() {
  if (!manager) {
    manager = new JobManager();
  }
  return manager;
}
export {
  getJobManager
};
