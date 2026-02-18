#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const TALKIE_PORT = parseInt(process.env.TALKIE_PORT || '5173', 10);
const TALKIE_URL = `https://localhost:${TALKIE_PORT}`;

// ─── Anonymous telemetry (opt out: TALKIE_TELEMETRY=0) ───
const POSTHOG_KEY = 'POSTHOG_API_KEY';
const TELEMETRY = process.env.TALKIE_TELEMETRY !== '0' && POSTHOG_KEY !== 'POSTHOG_API_KEY';
function trackTool(toolName, category, ok) {
  if (!TELEMETRY) return;
  fetch('https://us.i.posthog.com/capture/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_KEY,
      event: 'mcp_tool_called',
      distinct_id: 'anon',
      properties: { tool: toolName, category, success: ok },
    }),
  }).catch(() => {}); // fire-and-forget
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let talkieProcess = null;

// ─── JSON response wrapper ───
function jsonResult(data) {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

// ─── HTTP helpers (for server-dependent tools) ───
async function apiGet(path) {
  const r = await fetch(`${TALKIE_URL}${path}`);
  return r.ok ? await r.json() : { error: `API error (${r.status}): ${await r.text()}` };
}
async function apiPost(path, body) {
  const r = await fetch(`${TALKIE_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.ok ? await r.json() : { error: `API error (${r.status}): ${await r.text()}` };
}
async function apiPatch(path, body) {
  const r = await fetch(`${TALKIE_URL}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.ok ? await r.json() : { error: `API error (${r.status}): ${await r.text()}` };
}
async function apiPut(path, body) {
  const r = await fetch(`${TALKIE_URL}${path}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return r.ok ? await r.json() : { error: `API error (${r.status}): ${await r.text()}` };
}
async function apiDelete(path) {
  const r = await fetch(`${TALKIE_URL}${path}`, { method: 'DELETE' });
  return r.ok ? await r.json() : { error: `API error (${r.status}): ${await r.text()}` };
}

// ─── Database layer (lazy-loaded, for data tools) ───
let db = null;

async function getDb() {
  if (db) return db;
  try {
    const dbIndex = await import(join(__dirname, '..', 'server', 'db', 'index.js'));
    dbIndex.initDb();
    db = {
      convos: await import(join(__dirname, '..', 'server', 'db', 'repositories', 'conversations.js')),
      msgs: await import(join(__dirname, '..', 'server', 'db', 'repositories', 'messages.js')),
      plans: await import(join(__dirname, '..', 'server', 'db', 'repositories', 'plans.js')),
      search: await import(join(__dirname, '..', 'server', 'db', 'repositories', 'search.js')),
      activities: await import(join(__dirname, '..', 'server', 'db', 'repositories', 'activities.js')),
    };
    return db;
  } catch (err) {
    console.error('DB init failed, falling back to HTTP:', err.message);
    return null;
  }
}

// ─── Server detection ───
async function isTalkieRunning() {
  try { return (await fetch(`${TALKIE_URL}/api/status`)).ok; }
  catch { return false; }
}

function serverNotRunning() {
  return { error: 'Talkie server not running. Data tools work offline. Start server with: npx talkiebot' };
}

async function serverCall(fn) {
  try { return await fn(); }
  catch { return serverNotRunning(); }
}

// ─── Launch ───
async function launchTalkie() {
  if (await isTalkieRunning()) {
    exec(`open -a "Google Chrome" ${TALKIE_URL} 2>/dev/null || open ${TALKIE_URL}`);
    return { success: true, message: 'Talkie is already running', url: TALKIE_URL };
  }
  return new Promise((resolve) => {
    talkieProcess = spawn('npx', ['talkie'], { detached: true, stdio: 'ignore', env: { ...process.env, TALKIE_PORT: String(TALKIE_PORT) } });
    talkieProcess.unref();
    let attempts = 0;
    const check = setInterval(async () => {
      if (await isTalkieRunning()) { clearInterval(check); resolve({ success: true, message: 'Talkie launched', url: TALKIE_URL }); }
      else if (++attempts > 30) { clearInterval(check); resolve({ success: false, message: 'Talkie failed to start' }); }
    }, 500);
  });
}

// ─── Export formatter ───
function formatMarkdown(conv, messages, activities) {
  let md = `# ${conv.title || 'Untitled'}\n\n`;
  if (conv.created_at) md += `*Created: ${new Date(conv.created_at).toLocaleString()}*\n\n---\n\n`;
  for (const msg of messages) {
    md += `**${msg.role === 'user' ? 'You' : 'Assistant'}:**\n\n${msg.content}\n\n---\n\n`;
  }
  if (activities.length) {
    md += '## Tool Activity\n\n';
    for (const a of activities) md += `- **${a.tool}** (${a.status})${a.duration ? ` ${a.duration}ms` : ''}\n`;
  }
  return md;
}

// ─── MCP Server ───
const server = new Server(
  { name: 'talkie', version: '0.3.0' },
  { capabilities: { tools: {} } }
);

// ─── Tool Definitions (30 tools) ───
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    // ── Server tools (require running Talkie server) ──
    { name: 'launch_talkie', description: 'Launch the Talkie voice interface in a browser.', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'get_talkie_status', description: 'Check if Talkie is running and get its current state.', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'get_transcript', description: 'Get the latest voice transcript from Talkie.', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'get_conversation_history', description: 'Get the full conversation history from the current tape in Talkie.', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'get_claude_session', description: 'Get the current Claude Code session ID.', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'set_claude_session', description: 'Connect Talkie to a Claude Code session.', inputSchema: { type: 'object', properties: { sessionId: { type: 'string', description: 'Session ID to connect to' } }, required: ['sessionId'] } },
    { name: 'disconnect_claude_session', description: 'Disconnect the current Claude Code session.', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'get_pending_message', description: 'Poll for a pending user message in IPC mode.', inputSchema: { type: 'object', properties: {}, required: [] } },
    { name: 'respond_to_talkie', description: 'Send a response back to Talkie in IPC mode.', inputSchema: { type: 'object', properties: { content: { type: 'string', description: 'Response content' } }, required: ['content'] } },
    { name: 'update_talkie_state', description: 'Update Talkie UI state (avatar state, transcript).', inputSchema: { type: 'object', properties: { avatarState: { type: 'string', enum: ['idle', 'listening', 'thinking', 'speaking'], description: 'Avatar state' }, transcript: { type: 'string', description: 'Transcript text' } }, required: [] } },
    { name: 'analyze_image', description: 'Analyze an image using Claude vision API.', inputSchema: { type: 'object', properties: { dataUrl: { type: 'string', description: 'Base64 data URL of the image' }, fileName: { type: 'string', description: 'Optional filename' }, apiKey: { type: 'string', description: 'Optional Anthropic API key' } }, required: ['dataUrl'] } },
    { name: 'open_url', description: 'Open a URL in the default browser.', inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'URL to open' } }, required: ['url'] } },
    { name: 'create_talkie_job', description: 'Create a background job in Talkie.', inputSchema: { type: 'object', properties: { conversationId: { type: 'string', description: 'Conversation ID' }, prompt: { type: 'string', description: 'Task/prompt to execute' } }, required: ['conversationId', 'prompt'] } },
    { name: 'get_talkie_job', description: 'Get the status and result of a background job.', inputSchema: { type: 'object', properties: { jobId: { type: 'string', description: 'Job ID' } }, required: ['jobId'] } },
    { name: 'list_talkie_jobs', description: 'List background jobs, optionally filtered by status.', inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'cancelled'], description: 'Filter by status' } }, required: [] } },

    // ── Data tools (work offline via direct SQLite) ──
    { name: 'list_conversations', description: 'List all saved conversations (cassette tapes). Works offline.', inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Max results (default 50)' }, offset: { type: 'number', description: 'Pagination offset (default 0)' } }, required: [] } },
    { name: 'get_conversation', description: 'Get a full conversation by ID with messages, images, and tool activity. Works offline.', inputSchema: { type: 'object', properties: { conversationId: { type: 'string', description: 'Conversation ID' } }, required: ['conversationId'] } },
    { name: 'create_conversation', description: 'Create a new conversation (cassette tape). Works offline.', inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'Conversation title' }, id: { type: 'string', description: 'Optional custom ID' } }, required: [] } },
    { name: 'rename_conversation', description: 'Rename an existing conversation. Works offline.', inputSchema: { type: 'object', properties: { conversationId: { type: 'string', description: 'Conversation ID' }, title: { type: 'string', description: 'New title' } }, required: ['conversationId', 'title'] } },
    { name: 'delete_conversation', description: 'Delete a conversation permanently. Works offline.', inputSchema: { type: 'object', properties: { conversationId: { type: 'string', description: 'Conversation ID' } }, required: ['conversationId'] } },
    { name: 'search_conversations', description: 'Full-text search across all conversations. Uses FTS5 for ranked results. Works offline.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, limit: { type: 'number', description: 'Max results (default 50)' } }, required: ['query'] } },
    { name: 'add_message', description: 'Add a message to a conversation. Works offline.', inputSchema: { type: 'object', properties: { conversationId: { type: 'string', description: 'Conversation ID' }, role: { type: 'string', enum: ['user', 'assistant'], description: 'Message role' }, content: { type: 'string', description: 'Message content' }, source: { type: 'string', description: 'Source (default "mcp")' } }, required: ['conversationId', 'role', 'content'] } },
    { name: 'list_plans', description: 'List all plans. Works offline.', inputSchema: { type: 'object', properties: { limit: { type: 'number', description: 'Max results (default 50)' }, offset: { type: 'number', description: 'Pagination offset (default 0)' } }, required: [] } },
    { name: 'get_plan', description: 'Get a plan by ID with full content. Works offline.', inputSchema: { type: 'object', properties: { planId: { type: 'string', description: 'Plan ID' } }, required: ['planId'] } },
    { name: 'create_plan', description: 'Create a new plan with status workflow (draft > approved > in_progress > completed > archived). Works offline.', inputSchema: { type: 'object', properties: { title: { type: 'string', description: 'Plan title' }, content: { type: 'string', description: 'Plan content (markdown)' }, status: { type: 'string', enum: ['draft', 'approved', 'in_progress', 'completed', 'archived'], description: 'Initial status (default "draft")' }, conversationId: { type: 'string', description: 'Link to conversation' } }, required: ['title', 'content'] } },
    { name: 'update_plan', description: 'Update a plan\'s title, content, or status. Works offline.', inputSchema: { type: 'object', properties: { planId: { type: 'string', description: 'Plan ID' }, title: { type: 'string', description: 'New title' }, content: { type: 'string', description: 'New content' }, status: { type: 'string', enum: ['draft', 'approved', 'in_progress', 'completed', 'archived'], description: 'New status' } }, required: ['planId'] } },
    { name: 'delete_plan', description: 'Delete a plan permanently. Works offline.', inputSchema: { type: 'object', properties: { planId: { type: 'string', description: 'Plan ID' } }, required: ['planId'] } },
    { name: 'get_liner_notes', description: 'Get liner notes (markdown annotations) for a conversation. Works offline.', inputSchema: { type: 'object', properties: { conversationId: { type: 'string', description: 'Conversation ID' } }, required: ['conversationId'] } },
    { name: 'set_liner_notes', description: 'Set or clear liner notes for a conversation. Works offline.', inputSchema: { type: 'object', properties: { conversationId: { type: 'string', description: 'Conversation ID' }, linerNotes: { type: 'string', description: 'Markdown content (or null to clear)' } }, required: ['conversationId'] } },
    { name: 'export_conversation', description: 'Export a conversation as markdown or JSON. Works offline.', inputSchema: { type: 'object', properties: { conversationId: { type: 'string', description: 'Conversation ID' }, format: { type: 'string', enum: ['markdown', 'json'], description: 'Export format (default "markdown")' } }, required: ['conversationId'] } },
  ],
}));

// ─── Tool Call Handler ───
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ════════════════════════════════════════
    // SERVER TOOLS (require Talkie running)
    // ════════════════════════════════════════
    const serverTools = {
      launch_talkie: () => launchTalkie(),
      get_talkie_status: () => serverCall(() => apiGet('/api/status')),
      get_transcript: () => serverCall(() => apiGet('/api/transcript')),
      get_conversation_history: () => serverCall(() => apiGet('/api/history')),
      get_claude_session: () => serverCall(() => apiGet('/api/session')),
      set_claude_session: () => serverCall(() => apiPost('/api/session', { sessionId: args.sessionId })),
      disconnect_claude_session: () => serverCall(() => apiDelete('/api/session')),
      get_pending_message: () => serverCall(() => apiGet('/api/pending')),
      respond_to_talkie: () => serverCall(() => apiPost('/api/respond', { content: args.content })),
      update_talkie_state: () => serverCall(() => apiPost('/api/state', args)),
      analyze_image: () => serverCall(() => apiPost('/api/analyze-image', { dataUrl: args.dataUrl, fileName: args.fileName, apiKey: args.apiKey })),
      open_url: () => serverCall(() => apiPost('/api/open-url', { url: args.url })),
      create_talkie_job: () => serverCall(() => apiPost('/api/jobs', { conversationId: args.conversationId, prompt: args.prompt, source: 'mcp' })),
      get_talkie_job: () => serverCall(() => apiGet(`/api/jobs/${args.jobId}`)),
      list_talkie_jobs: () => serverCall(() => apiGet(`/api/jobs${args.status ? `?status=${args.status}` : ''}`)),
    };
    if (serverTools[name]) {
      const result = await serverTools[name]();
      trackTool(name, 'server', !result?.error);
      return jsonResult(result);
    }

    // ════════════════════════════════════════
    // DATA TOOLS (direct SQLite, work offline)
    // ════════════════════════════════════════
    const d = await getDb();
    if (!d) {
      // DB unavailable — fall back to HTTP proxy
      return jsonResult(await serverCall(async () => {
        switch (name) {
          case 'list_conversations': return await apiGet(`/api/conversations?limit=${args.limit || 50}&offset=${args.offset || 0}`);
          case 'get_conversation': return await apiGet(`/api/conversations/${args.conversationId}`);
          case 'create_conversation': return await apiPost('/api/conversations', { title: args.title || 'New conversation', ...(args.id && { id: args.id }) });
          case 'rename_conversation': return await apiPatch(`/api/conversations/${args.conversationId}`, { title: args.title });
          case 'delete_conversation': return await apiDelete(`/api/conversations/${args.conversationId}`);
          case 'search_conversations': return await apiGet(`/api/search?q=${encodeURIComponent(args.query)}&limit=${args.limit || 50}`);
          case 'add_message': return await apiPost(`/api/conversations/${args.conversationId}/messages`, { role: args.role, content: args.content, source: args.source || 'mcp' });
          case 'list_plans': return await apiGet(`/api/plans?limit=${args.limit || 50}&offset=${args.offset || 0}`);
          case 'get_plan': return await apiGet(`/api/plans/${args.planId}`);
          case 'create_plan': return await apiPost('/api/plans', { title: args.title, content: args.content, status: args.status || 'draft', conversationId: args.conversationId });
          case 'update_plan': { const b = {}; if (args.title !== undefined) b.title = args.title; if (args.content !== undefined) b.content = args.content; if (args.status !== undefined) b.status = args.status; return await apiPut(`/api/plans/${args.planId}`, b); }
          case 'delete_plan': return await apiDelete(`/api/plans/${args.planId}`);
          case 'get_liner_notes': return await apiGet(`/api/conversations/${args.conversationId}/liner-notes`);
          case 'set_liner_notes': return await apiPut(`/api/conversations/${args.conversationId}/liner-notes`, { linerNotes: args.linerNotes ?? null });
          case 'export_conversation': {
            const conv = await apiGet(`/api/conversations/${args.conversationId}`);
            if (conv.error) return conv;
            return args.format === 'json' ? { format: 'json', data: conv } : { format: 'markdown', data: formatMarkdown(conv, conv.messages || [], conv.activities || []) };
          }
          default: throw new Error(`Unknown tool: ${name}`);
        }
      }));
    }

    // Direct SQLite calls
    trackTool(name, 'data', true);
    switch (name) {
      case 'list_conversations': {
        const convos = d.convos.listConversations(args.limit || 50, args.offset || 0);
        const total = d.convos.countConversations();
        return jsonResult({ conversations: convos, total });
      }
      case 'get_conversation': {
        const conv = d.convos.getConversation(args.conversationId);
        if (!conv) return jsonResult({ error: 'Conversation not found' });
        const messages = d.msgs.getMessagesForConversation(args.conversationId);
        const imageMap = d.msgs.getImagesForMessages(messages.map(m => m.id));
        const messagesWithImages = messages.map(m => ({ ...m, images: imageMap.get(m.id) || [] }));
        const activities = d.activities.getActivitiesForConversation(args.conversationId);
        const linerNotes = d.convos.getLinerNotes(args.conversationId);
        return jsonResult({ ...conv, messages: messagesWithImages, activities, liner_notes: linerNotes });
      }
      case 'create_conversation': {
        const id = args.id || randomUUID();
        const conv = d.convos.createConversation({ id, title: args.title });
        return jsonResult(conv);
      }
      case 'rename_conversation': {
        const conv = d.convos.updateConversation(args.conversationId, { title: args.title });
        return jsonResult(conv || { error: 'Conversation not found' });
      }
      case 'delete_conversation': {
        const ok = d.convos.deleteConversation(args.conversationId);
        return jsonResult({ success: ok });
      }
      case 'search_conversations': {
        const results = d.search.searchMessages(args.query, args.limit || 50);
        return jsonResult({ results });
      }
      case 'add_message': {
        const msg = d.msgs.createMessage({
          id: randomUUID(),
          conversationId: args.conversationId,
          role: args.role,
          content: args.content,
          source: args.source || 'mcp',
        });
        return jsonResult(msg);
      }
      case 'list_plans': {
        const plans = d.plans.listPlans(args.limit || 50, args.offset || 0);
        return jsonResult({ plans });
      }
      case 'get_plan': {
        const plan = d.plans.getPlan(args.planId);
        return jsonResult(plan || { error: 'Plan not found' });
      }
      case 'create_plan': {
        const plan = d.plans.createPlan({
          id: randomUUID(),
          title: args.title,
          content: args.content,
          status: args.status || 'draft',
          conversationId: args.conversationId || null,
        });
        return jsonResult(plan);
      }
      case 'update_plan': {
        const updates = {};
        if (args.title !== undefined) updates.title = args.title;
        if (args.content !== undefined) updates.content = args.content;
        if (args.status !== undefined) updates.status = args.status;
        const plan = d.plans.updatePlan(args.planId, updates);
        return jsonResult(plan || { error: 'Plan not found' });
      }
      case 'delete_plan': {
        const ok = d.plans.deletePlan(args.planId);
        return jsonResult({ success: ok });
      }
      case 'get_liner_notes': {
        const notes = d.convos.getLinerNotes(args.conversationId);
        return jsonResult({ conversationId: args.conversationId, linerNotes: notes });
      }
      case 'set_liner_notes': {
        d.convos.updateLinerNotes(args.conversationId, args.linerNotes ?? null);
        return jsonResult({ success: true });
      }
      case 'export_conversation': {
        const conv = d.convos.getConversation(args.conversationId);
        if (!conv) return jsonResult({ error: 'Conversation not found' });
        const messages = d.msgs.getMessagesForConversation(args.conversationId);
        const activities = d.activities.getActivitiesForConversation(args.conversationId);
        if (args.format === 'json') {
          const imageMap = d.msgs.getImagesForMessages(messages.map(m => m.id));
          const msgsWithImages = messages.map(m => ({ ...m, images: imageMap.get(m.id) || [] }));
          return jsonResult({ format: 'json', data: { ...conv, messages: msgsWithImages, activities } });
        }
        return jsonResult({ format: 'markdown', data: formatMarkdown(conv, messages, activities) });
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    trackTool(name, 'data', false);
    return jsonResult({ error: err.message });
  }
});

// ─── Start ───
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Talkie MCP server running (30 tools — 15 data + 15 server)');
}

main().catch(console.error);
