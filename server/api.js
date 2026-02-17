import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { spawn } from "child_process";
import { state, updateState } from "./state.js";
import { isDbConnected } from "./db/index.js";
import * as conversations from "./db/repositories/conversations.js";
import * as messages from "./db/repositories/messages.js";
import * as activities from "./db/repositories/activities.js";
import * as search from "./db/repositories/search.js";
import * as plans from "./db/repositories/plans.js";
import { spawnClaude } from "./jobs/runner.js";
import { jobRoutes } from "./jobs/api.js";
const api = new Hono();
api.use("*", cors());
api.route("/jobs", jobRoutes);
api.get("/status", (c) => {
  return c.json({
    running: true,
    avatarState: state.avatarState,
    dbStatus: isDbConnected() ? "connected" : "unavailable"
  });
});
api.get("/conversations", (c) => {
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const convos = conversations.listConversations(limit, offset);
  const total = conversations.countConversations();
  return c.json({
    conversations: convos.map((conv) => ({
      id: conv.id,
      title: conv.title,
      createdAt: conv.created_at,
      updatedAt: conv.updated_at,
      projectId: conv.project_id,
      parentId: conv.parent_id
    })),
    total,
    limit,
    offset
  });
});
api.get("/conversations/:id", (c) => {
  const id = c.req.param("id");
  const conv = conversations.getConversation(id);
  if (!conv) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  const msgs = messages.getMessagesForConversation(id);
  const messageIds = msgs.map((m) => m.id);
  const imageMap = messages.getImagesForMessages(messageIds);
  const acts = activities.getActivitiesForConversation(id);
  return c.json({
    id: conv.id,
    title: conv.title,
    createdAt: conv.created_at,
    updatedAt: conv.updated_at,
    projectId: conv.project_id,
    parentId: conv.parent_id,
    messages: msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      source: m.source,
      images: (imageMap.get(m.id) || []).map((img) => ({
        id: img.id,
        dataUrl: img.data_url,
        fileName: img.file_name,
        description: img.description
      }))
    })),
    activities: acts.map((a) => ({
      id: a.id,
      tool: a.tool,
      input: a.input,
      status: a.status,
      timestamp: a.timestamp,
      duration: a.duration,
      error: a.error
    }))
  });
});
api.post("/conversations", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const id = body.id || crypto.randomUUID();
  const title = body.title || "New conversation";
  const conv = conversations.createConversation({ id, title });
  return c.json({
    id: conv.id,
    title: conv.title,
    createdAt: conv.created_at,
    updatedAt: conv.updated_at
  }, 201);
});
api.patch("/conversations/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const conv = conversations.updateConversation(id, {
    title: body.title,
    projectId: body.projectId,
    parentId: body.parentId
  });
  if (!conv) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  return c.json({
    id: conv.id,
    title: conv.title,
    createdAt: conv.created_at,
    updatedAt: conv.updated_at
  });
});
api.delete("/conversations/:id", (c) => {
  const id = c.req.param("id");
  const deleted = conversations.deleteConversation(id);
  if (!deleted) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  return c.json({ success: true });
});
api.get("/conversations/:id/liner-notes", (c) => {
  const id = c.req.param("id");
  const conv = conversations.getConversation(id);
  if (!conv) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  return c.json({
    linerNotes: conv.liner_notes || null
  });
});
api.put("/conversations/:id/liner-notes", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const conv = conversations.getConversation(id);
  if (!conv) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  conversations.updateLinerNotes(id, body.linerNotes || null);
  return c.json({ success: true });
});
api.post("/conversations/:id/messages", async (c) => {
  const conversationId = c.req.param("id");
  const body = await c.req.json();
  const conv = conversations.getConversation(conversationId);
  if (!conv) {
    return c.json({ error: "Conversation not found" }, 404);
  }
  const msg = messages.createMessage({
    id: body.id || crypto.randomUUID(),
    conversationId,
    role: body.role,
    content: body.content,
    timestamp: body.timestamp,
    source: body.source || "web",
    images: body.images
  });
  if (msg.role === "user" && msg.position === 0) {
    const title = msg.content.length > 40 ? msg.content.slice(0, 40) + "..." : msg.content;
    conversations.updateConversation(conversationId, { title });
  }
  if (body.activities && Array.isArray(body.activities)) {
    activities.createActivitiesBatch(
      body.activities.map((a) => ({
        id: a.id || crypto.randomUUID(),
        conversationId,
        messageId: msg.id,
        tool: a.tool,
        input: a.input,
        status: a.status,
        timestamp: a.timestamp,
        duration: a.duration,
        error: a.error
      }))
    );
  }
  return c.json({
    id: msg.id,
    role: msg.role,
    content: msg.content,
    timestamp: msg.timestamp,
    source: msg.source
  }, 201);
});
api.patch("/images/:id", async (c) => {
  const imageId = c.req.param("id");
  const { description } = await c.req.json();
  if (typeof description !== "string") {
    return c.json({ error: "description required" }, 400);
  }
  const updated = messages.updateImageDescription(imageId, description);
  if (!updated) {
    return c.json({ error: "Image not found" }, 404);
  }
  return c.json({ success: true });
});
api.get("/plans", (c) => {
  const limit = parseInt(c.req.query("limit") || "50", 10);
  const offset = parseInt(c.req.query("offset") || "0", 10);
  const planList = plans.listPlans(limit, offset);
  return c.json({
    plans: planList.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      status: p.status,
      conversationId: p.conversation_id,
      createdAt: p.created_at,
      updatedAt: p.updated_at
    }))
  });
});
api.get("/plans/:id", (c) => {
  const id = c.req.param("id");
  const plan = plans.getPlan(id);
  if (!plan) {
    return c.json({ error: "Plan not found" }, 404);
  }
  return c.json({
    id: plan.id,
    title: plan.title,
    content: plan.content,
    status: plan.status,
    conversationId: plan.conversation_id,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at
  });
});
api.post("/plans", async (c) => {
  const body = await c.req.json();
  const plan = plans.createPlan({
    id: body.id || crypto.randomUUID(),
    title: body.title || "Untitled Plan",
    content: body.content || "",
    status: body.status,
    conversationId: body.conversationId
  });
  return c.json({
    id: plan.id,
    title: plan.title,
    content: plan.content,
    status: plan.status,
    conversationId: plan.conversation_id,
    createdAt: plan.created_at,
    updatedAt: plan.updated_at
  }, 201);
});
api.put("/plans/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json();
  const existing = plans.getPlan(id);
  if (!existing) {
    return c.json({ error: "Plan not found" }, 404);
  }
  plans.updatePlan(id, {
    title: body.title,
    content: body.content,
    status: body.status
  });
  return c.json({ success: true });
});
api.delete("/plans/:id", (c) => {
  const id = c.req.param("id");
  plans.deletePlan(id);
  return c.json({ success: true });
});
api.get("/search", (c) => {
  const query = c.req.query("q") || "";
  const limit = parseInt(c.req.query("limit") || "50", 10);
  if (!query.trim()) {
    return c.json({ results: [] });
  }
  const results = search.searchMessages(query, limit);
  return c.json({
    query,
    results: results.map((r) => ({
      messageId: r.message_id,
      conversationId: r.conversation_id,
      conversationTitle: r.conversation_title,
      role: r.role,
      content: r.content,
      timestamp: r.timestamp,
      snippet: r.snippet
    }))
  });
});
api.post("/migrate", async (c) => {
  const body = await c.req.json();
  const localConversations = body.conversations;
  if (!localConversations || !Array.isArray(localConversations)) {
    return c.json({ error: "Invalid conversations data" }, 400);
  }
  let imported = 0;
  let skipped = 0;
  for (const conv of localConversations) {
    if (conversations.getConversation(conv.id)) {
      skipped++;
      continue;
    }
    conversations.createConversation({
      id: conv.id,
      title: conv.title
    });
    for (const msg of conv.messages || []) {
      messages.createMessage({
        id: msg.id,
        conversationId: conv.id,
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp,
        source: "web",
        images: msg.images
      });
    }
    if (conv.activities && conv.activities.length > 0) {
      activities.createActivitiesBatch(
        conv.activities.map((a) => ({
          id: a.id,
          conversationId: conv.id,
          tool: a.tool,
          input: a.input,
          status: a.status,
          timestamp: a.timestamp,
          duration: a.duration,
          error: a.error
        }))
      );
    }
    imported++;
  }
  return c.json({
    success: true,
    imported,
    skipped,
    total: localConversations.length
  });
});
api.get("/integrations", (c) => {
  let telegramConfigured = !!process.env.TELEGRAM_BOT_TOKEN;
  if (!telegramConfigured) {
    try {
      const { existsSync } = require("fs");
      const { join } = require("path");
      const { homedir } = require("os");
      const tokenPath = join(homedir(), ".talkie", "telegram.token");
      telegramConfigured = existsSync(tokenPath);
    } catch {
    }
  }
  return c.json({
    mcp: {
      configured: true,
      toolCount: 15,
      tools: [
        "launch_talkie",
        "get_talkie_status",
        "get_transcript",
        "get_conversation_history",
        "get_claude_session",
        "set_claude_session",
        "disconnect_claude_session",
        "get_pending_message",
        "respond_to_talkie",
        "update_talkie_state",
        "analyze_image",
        "open_url",
        "create_talkie_job",
        "get_talkie_job",
        "list_talkie_jobs"
      ],
      transport: "stdio"
    },
    telegram: {
      configured: telegramConfigured
    }
  });
});
api.get("/transcript", (c) => {
  return c.json({
    transcript: state.transcript,
    lastUserMessage: state.lastUserMessage,
    lastAssistantMessage: state.lastAssistantMessage
  });
});
api.get("/history", (c) => {
  return c.json({
    messages: state.messages
  });
});
api.post("/state", async (c) => {
  const update = await c.req.json();
  updateState(update);
  return c.json({ success: true });
});
api.get("/session", (c) => {
  return c.json({ sessionId: state.claudeSessionId });
});
api.post("/session", async (c) => {
  const { sessionId } = await c.req.json();
  updateState({ claudeSessionId: sessionId || null });
  console.log("Claude session ID set:", state.claudeSessionId);
  return c.json({ success: true, sessionId: state.claudeSessionId });
});
api.delete("/session", (c) => {
  updateState({ claudeSessionId: null });
  console.log("Claude session ID cleared");
  return c.json({ success: true });
});
api.get("/pending", (c) => {
  return c.json({
    pending: state.pendingMessage,
    sessionConnected: !!state.claudeSessionId
  });
});
api.post("/respond", async (c) => {
  const { content } = await c.req.json();
  if (!content) {
    return c.json({ error: "Content required" }, 400);
  }
  console.log("IPC response received:", content.slice(0, 100) + "...");
  updateState({ pendingMessage: null });
  for (const callback of state.responseCallbacks) {
    callback(content);
  }
  updateState({ responseCallbacks: [] });
  return c.json({ success: true });
});
api.post("/send", async (c) => {
  const { message } = await c.req.json();
  if (!message) {
    return c.json({ error: "Message required" }, 400);
  }
  console.log("IPC message received from frontend:", message.slice(0, 100));
  updateState({
    pendingMessage: {
      content: message,
      timestamp: Date.now()
    }
  });
  return streamSSE(c, async (stream) => {
    const timeout = setTimeout(() => {
      const callbacks = state.responseCallbacks.filter((cb) => cb !== callback);
      updateState({ responseCallbacks: callbacks });
      stream.writeSSE({ data: JSON.stringify({ error: "Timeout waiting for response" }) });
      stream.close();
    }, 12e4);
    const callback = (response) => {
      clearTimeout(timeout);
      stream.writeSSE({ data: JSON.stringify({ text: response }) });
      stream.writeSSE({ data: JSON.stringify({ done: true }) });
      stream.close();
    };
    state.responseCallbacks.push(callback);
    await new Promise((resolve) => {
      const checkClosed = setInterval(() => {
        if (!state.responseCallbacks.includes(callback)) {
          clearInterval(checkClosed);
          resolve();
        }
      }, 100);
    });
  });
});
api.post("/analyze-image", async (c) => {
  const { dataUrl, fileName, type, apiKey: clientApiKey } = await c.req.json();
  if (!dataUrl) {
    return c.json({ error: "Image data required" }, 400);
  }
  const apiKey = clientApiKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return c.json({ error: "API key required for image analysis - please add one in Settings even when using Claude Code mode" }, 400);
  }
  const base64Data = dataUrl.split(",")[1];
  const mediaType = type || "image/png";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: `You are analyzing images for a voice assistant app. Describe the image in detail, focusing on:
- If it's a UI mockup/wireframe: describe the layout, components, navigation, and user flow
- If it's a screenshot: describe what app/website it is, the state shown, and key elements
- If it's a hand-drawn sketch: interpret the drawing and describe what it represents
- For any image: note colors, text visible, key visual elements

Be thorough but concise. This description will be used as context for building or discussing the content.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Data
              }
            },
            {
              type: "text",
              text: "Describe this image in detail. If it appears to be a UI design, wireframe, or sketch, focus on the structure and components."
            }
          ]
        }
      ]
    })
  });
  if (!response.ok) {
    const error = await response.text();
    return c.json({ error: `API error: ${error}` }, response.status);
  }
  const data = await response.json();
  const description = data.content[0]?.text || "Unable to analyze image.";
  return c.json({ description, fileName });
});
api.post("/analyze-image-cc", async (c) => {
  const { dataUrl, fileName } = await c.req.json();
  if (!dataUrl) {
    return c.json({ error: "Image data required" }, 400);
  }
  return new Promise((resolve) => {
    let description = "";
    const handle = spawnClaude({
      prompt: "Describe this image in detail. If it appears to be a UI design, wireframe, or sketch, focus on the structure and components. Be thorough but concise. Output ONLY the description, no preamble.",
      images: [{ dataUrl, fileName: fileName || "image.png" }],
      rawMode: true,
      callbacks: {
        onText: (text) => {
          description += text;
        },
        onActivity: () => {
        },
        onError: (error) => {
          console.error("Image analysis via Claude Code failed:", error);
        },
        onComplete: () => {
          resolve(c.json({
            description: description.trim() || "Unable to analyze image.",
            fileName
          }));
        }
      }
    });
    setTimeout(() => {
      handle.kill();
      resolve(c.json({
        description: description.trim() || "Analysis timed out.",
        fileName
      }));
    }, 6e4);
  });
});
api.post("/open-url", async (c) => {
  const { url } = await c.req.json();
  if (!url || typeof url !== "string") {
    return c.json({ error: "URL required" }, 400);
  }
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return c.json({ error: "Only http/https URLs allowed" }, 400);
  }
  console.log("Opening URL in browser:", url);
  return new Promise((resolve) => {
    const open = spawn("open", [url]);
    open.on("error", (err) => {
      resolve(c.json({ error: err.message }, 500));
    });
    open.on("close", (code) => {
      if (code === 0) {
        resolve(c.json({ success: true }));
      } else {
        resolve(c.json({ error: `Failed to open URL (code ${code})` }, 500));
      }
    });
  });
});
api.post("/claude-code", async (c) => {
  const { message, history, images } = await c.req.json();
  if (!message) {
    return c.json({ error: "Message required" }, 400);
  }
  return streamSSE(c, async (stream) => {
    const handle = spawnClaude({
      prompt: message,
      history: history || state.messages || [],
      images,
      callbacks: {
        onText: (text) => {
          stream.writeSSE({ data: JSON.stringify({ text }) });
        },
        onActivity: (event) => {
          stream.writeSSE({ data: JSON.stringify({ activity: event }) });
        },
        onPlan: (plan) => {
          stream.writeSSE({ data: JSON.stringify({ plan }) });
        },
        onError: (error) => {
          stream.writeSSE({ data: JSON.stringify({ error }) });
        },
        onComplete: (code) => {
          stream.writeSSE({ data: JSON.stringify({ done: true, code }) });
        }
      }
    });
    await handle.promise;
  });
});
export {
  api
};
