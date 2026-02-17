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

const execAsync = promisify(exec);
const __dirname = dirname(fileURLToPath(import.meta.url));
const TALKIE_DIR = join(__dirname, '..');
const TALKIE_PORT = parseInt(process.env.TALKIE_PORT || '5173', 10);
const TALKIE_URL = `https://localhost:${TALKIE_PORT}`;

// Allow self-signed certificates for local dev
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let talkieProcess = null;

// ============================================
// Helper: JSON response wrapper
// ============================================
function jsonResult(data) {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

async function apiGet(path) {
  const response = await fetch(`${TALKIE_URL}${path}`);
  if (response.ok) return await response.json();
  const text = await response.text();
  return { error: `API error (${response.status}): ${text}` };
}

async function apiPost(path, body) {
  const response = await fetch(`${TALKIE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (response.ok) return await response.json();
  const text = await response.text();
  return { error: `API error (${response.status}): ${text}` };
}

async function apiPatch(path, body) {
  const response = await fetch(`${TALKIE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (response.ok) return await response.json();
  const text = await response.text();
  return { error: `API error (${response.status}): ${text}` };
}

async function apiPut(path, body) {
  const response = await fetch(`${TALKIE_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (response.ok) return await response.json();
  const text = await response.text();
  return { error: `API error (${response.status}): ${text}` };
}

async function apiDelete(path) {
  const response = await fetch(`${TALKIE_URL}${path}`, { method: 'DELETE' });
  if (response.ok) return await response.json();
  const text = await response.text();
  return { error: `API error (${response.status}): ${text}` };
}

// ============================================
// Core: Launch & Status
// ============================================

async function isTalkieRunning() {
  try {
    const response = await fetch(`${TALKIE_URL}/api/status`);
    return response.ok;
  } catch {
    return false;
  }
}

async function launchTalkie() {
  if (await isTalkieRunning()) {
    exec(`open -a "Google Chrome" ${TALKIE_URL} 2>/dev/null || open ${TALKIE_URL}`);
    return { success: true, message: 'Talkie is already running (use Chrome/Edge for voice)', url: TALKIE_URL };
  }

  return new Promise((resolve) => {
    talkieProcess = spawn('npx', ['talkie'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, TALKIE_PORT: String(TALKIE_PORT) },
    });

    talkieProcess.unref();

    let attempts = 0;
    const checkReady = setInterval(async () => {
      attempts++;
      if (await isTalkieRunning()) {
        clearInterval(checkReady);
        resolve({ success: true, message: 'Talkie launched', url: TALKIE_URL });
      } else if (attempts > 30) {
        clearInterval(checkReady);
        resolve({ success: false, message: 'Talkie failed to start' });
      }
    }, 500);
  });
}

// ============================================
// Export: format conversation as markdown/JSON
// ============================================

function formatConversationMarkdown(conv) {
  let md = `# ${conv.title || 'Untitled'}\n\n`;
  if (conv.createdAt) md += `*Created: ${new Date(conv.createdAt).toLocaleString()}*\n\n`;
  md += '---\n\n';

  for (const msg of conv.messages || []) {
    const role = msg.role === 'user' ? 'You' : 'Assistant';
    md += `**${role}:**\n\n${msg.content}\n\n`;
    if (msg.images?.length) {
      md += `*[${msg.images.length} image(s) attached]*\n\n`;
    }
    md += '---\n\n';
  }

  if (conv.activities?.length) {
    md += '## Tool Activity\n\n';
    for (const a of conv.activities) {
      md += `- **${a.tool}** (${a.status})${a.duration ? ` ${a.duration}ms` : ''}\n`;
    }
  }

  return md;
}

// ============================================
// MCP Server
// ============================================

const server = new Server(
  { name: 'talkie', version: '0.2.0' },
  { capabilities: { tools: {} } }
);

// ============================================
// Tool Definitions (30 tools)
// ============================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ── Core ──
      {
        name: 'launch_talkie',
        description: 'Launch the Talkie voice interface in a browser. Use this when the user wants to interact with voice.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_talkie_status',
        description: 'Check if Talkie is running and get its current state (idle, listening, thinking, speaking).',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_transcript',
        description: 'Get the latest voice transcript from Talkie. Use after user has spoken.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'get_conversation_history',
        description: 'Get the full conversation history from the current tape/conversation in Talkie.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },

      // ── Session Management ──
      {
        name: 'get_claude_session',
        description: 'Get the current Claude Code session ID if one is connected.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'set_claude_session',
        description: 'Set the Claude Code session ID to connect Talkie to your session.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'The Claude Code session ID to connect to' },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'disconnect_claude_session',
        description: 'Disconnect the current Claude Code session.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },

      // ── IPC ──
      {
        name: 'get_pending_message',
        description: 'Check if there is a pending message from Talkie waiting for a response. Use this to poll for user messages in IPC mode.',
        inputSchema: { type: 'object', properties: {}, required: [] },
      },
      {
        name: 'respond_to_talkie',
        description: 'Send a response back to Talkie. Use this in IPC mode to respond to a pending message.',
        inputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'The response content to send to Talkie' },
          },
          required: ['content'],
        },
      },

      // ── State ──
      {
        name: 'update_talkie_state',
        description: 'Update Talkie state (avatar state, transcript, messages, etc.).',
        inputSchema: {
          type: 'object',
          properties: {
            avatarState: {
              type: 'string',
              enum: ['idle', 'listening', 'thinking', 'speaking'],
              description: 'The avatar state to set',
            },
            transcript: { type: 'string', description: 'Set the current transcript text' },
          },
          required: [],
        },
      },

      // ── Media ──
      {
        name: 'analyze_image',
        description: 'Analyze an image using Claude vision API. Returns a description of the image content.',
        inputSchema: {
          type: 'object',
          properties: {
            dataUrl: { type: 'string', description: 'Base64 data URL of the image (e.g., data:image/png;base64,...)' },
            fileName: { type: 'string', description: 'Optional filename for the image' },
            apiKey: { type: 'string', description: 'Optional Anthropic API key (uses ANTHROPIC_API_KEY env var if not provided)' },
          },
          required: ['dataUrl'],
        },
      },
      {
        name: 'open_url',
        description: 'Open a URL in the default browser.',
        inputSchema: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'The URL to open (must be http or https)' },
          },
          required: ['url'],
        },
      },

      // ── Jobs ──
      {
        name: 'create_talkie_job',
        description: 'Create a background job in Talkie. The task runs asynchronously and you get a job ID back immediately. Use get_talkie_job to check on progress.',
        inputSchema: {
          type: 'object',
          properties: {
            conversationId: { type: 'string', description: 'The conversation ID to run the job in' },
            prompt: { type: 'string', description: 'The task/prompt to execute' },
          },
          required: ['conversationId', 'prompt'],
        },
      },
      {
        name: 'get_talkie_job',
        description: 'Get the status and result of a background job.',
        inputSchema: {
          type: 'object',
          properties: {
            jobId: { type: 'string', description: 'The job ID to check' },
          },
          required: ['jobId'],
        },
      },
      {
        name: 'list_talkie_jobs',
        description: 'List background jobs, optionally filtered by status.',
        inputSchema: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
              description: 'Filter by job status',
            },
          },
          required: [],
        },
      },

      // ── Conversations (NEW) ──
      {
        name: 'list_conversations',
        description: 'List all saved conversations (cassette tapes) in Talkie. Returns titles, IDs, and timestamps. Supports pagination.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max conversations to return (default 50)' },
            offset: { type: 'number', description: 'Offset for pagination (default 0)' },
          },
          required: [],
        },
      },
      {
        name: 'get_conversation',
        description: 'Get a full conversation by ID, including all messages, images, and tool activity. Use this to read past conversations for context.',
        inputSchema: {
          type: 'object',
          properties: {
            conversationId: { type: 'string', description: 'The conversation ID to retrieve' },
          },
          required: ['conversationId'],
        },
      },
      {
        name: 'create_conversation',
        description: 'Create a new conversation (cassette tape) in Talkie.',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Title for the new conversation' },
            id: { type: 'string', description: 'Optional custom ID (auto-generated if omitted)' },
          },
          required: [],
        },
      },
      {
        name: 'rename_conversation',
        description: 'Rename an existing conversation.',
        inputSchema: {
          type: 'object',
          properties: {
            conversationId: { type: 'string', description: 'The conversation ID to rename' },
            title: { type: 'string', description: 'The new title' },
          },
          required: ['conversationId', 'title'],
        },
      },
      {
        name: 'delete_conversation',
        description: 'Delete a conversation and all its messages permanently.',
        inputSchema: {
          type: 'object',
          properties: {
            conversationId: { type: 'string', description: 'The conversation ID to delete' },
          },
          required: ['conversationId'],
        },
      },

      // ── Search (NEW) ──
      {
        name: 'search_conversations',
        description: 'Full-text search across all conversations in Talkie. Uses FTS5 for fast, ranked results with highlighted snippets.',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query text' },
            limit: { type: 'number', description: 'Max results to return (default 50)' },
          },
          required: ['query'],
        },
      },

      // ── Messages (NEW) ──
      {
        name: 'add_message',
        description: 'Add a message to an existing conversation. Use this to programmatically append user or assistant messages to a tape.',
        inputSchema: {
          type: 'object',
          properties: {
            conversationId: { type: 'string', description: 'The conversation to add the message to' },
            role: {
              type: 'string',
              enum: ['user', 'assistant'],
              description: 'Message role',
            },
            content: { type: 'string', description: 'The message content' },
            source: { type: 'string', description: 'Message source (default "mcp")' },
          },
          required: ['conversationId', 'role', 'content'],
        },
      },

      // ── Plans (NEW) ──
      {
        name: 'list_plans',
        description: 'List all plans in Talkie. Plans are auto-detected from Claude responses and track implementation status.',
        inputSchema: {
          type: 'object',
          properties: {
            limit: { type: 'number', description: 'Max plans to return (default 50)' },
            offset: { type: 'number', description: 'Offset for pagination (default 0)' },
          },
          required: [],
        },
      },
      {
        name: 'get_plan',
        description: 'Get a plan by ID with full content and status.',
        inputSchema: {
          type: 'object',
          properties: {
            planId: { type: 'string', description: 'The plan ID to retrieve' },
          },
          required: ['planId'],
        },
      },
      {
        name: 'create_plan',
        description: 'Create a new plan in Talkie. Plans can be linked to conversations and have a status workflow (draft > approved > in_progress > completed > archived).',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Plan title' },
            content: { type: 'string', description: 'Plan content (markdown)' },
            status: {
              type: 'string',
              enum: ['draft', 'approved', 'in_progress', 'completed', 'archived'],
              description: 'Initial status (default "draft")',
            },
            conversationId: { type: 'string', description: 'Link to a conversation ID' },
          },
          required: ['title', 'content'],
        },
      },
      {
        name: 'update_plan',
        description: 'Update a plan\'s title, content, or status. Use this to advance plans through the workflow.',
        inputSchema: {
          type: 'object',
          properties: {
            planId: { type: 'string', description: 'The plan ID to update' },
            title: { type: 'string', description: 'New title' },
            content: { type: 'string', description: 'New content (markdown)' },
            status: {
              type: 'string',
              enum: ['draft', 'approved', 'in_progress', 'completed', 'archived'],
              description: 'New status',
            },
          },
          required: ['planId'],
        },
      },
      {
        name: 'delete_plan',
        description: 'Delete a plan permanently.',
        inputSchema: {
          type: 'object',
          properties: {
            planId: { type: 'string', description: 'The plan ID to delete' },
          },
          required: ['planId'],
        },
      },

      // ── Liner Notes (NEW) ──
      {
        name: 'get_liner_notes',
        description: 'Get the liner notes (markdown annotations) for a conversation. Liner notes are per-conversation notes written by the user.',
        inputSchema: {
          type: 'object',
          properties: {
            conversationId: { type: 'string', description: 'The conversation ID' },
          },
          required: ['conversationId'],
        },
      },
      {
        name: 'set_liner_notes',
        description: 'Set or update the liner notes for a conversation. Pass null to clear them.',
        inputSchema: {
          type: 'object',
          properties: {
            conversationId: { type: 'string', description: 'The conversation ID' },
            linerNotes: { type: 'string', description: 'Markdown content for the liner notes (or null to clear)' },
          },
          required: ['conversationId'],
        },
      },

      // ── Export (NEW) ──
      {
        name: 'export_conversation',
        description: 'Export a conversation as markdown or JSON. Returns the formatted content as a string.',
        inputSchema: {
          type: 'object',
          properties: {
            conversationId: { type: 'string', description: 'The conversation ID to export' },
            format: {
              type: 'string',
              enum: ['markdown', 'json'],
              description: 'Export format (default "markdown")',
            },
          },
          required: ['conversationId'],
        },
      },
    ],
  };
});

// ============================================
// Tool Call Handler
// ============================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      // ── Core ──
      case 'launch_talkie':
        return jsonResult(await launchTalkie());

      case 'get_talkie_status':
        return jsonResult(await (async () => {
          try { return await apiGet('/api/status'); }
          catch { return { running: false }; }
        })());

      case 'get_transcript':
        return jsonResult(await (async () => {
          try { return await apiGet('/api/transcript'); }
          catch { return { transcript: null, error: 'Talkie not running' }; }
        })());

      case 'get_conversation_history':
        return jsonResult(await (async () => {
          try { return await apiGet('/api/history'); }
          catch { return { messages: [], error: 'Talkie not running' }; }
        })());

      // ── Session ──
      case 'get_claude_session':
        return jsonResult(await (async () => {
          try { return await apiGet('/api/session'); }
          catch { return { sessionId: null, error: 'Talkie not running' }; }
        })());

      case 'set_claude_session':
        return jsonResult(await (async () => {
          try { return await apiPost('/api/session', { sessionId: args.sessionId }); }
          catch { return { success: false, error: 'Talkie not running' }; }
        })());

      case 'disconnect_claude_session':
        return jsonResult(await (async () => {
          try { return await apiDelete('/api/session'); }
          catch { return { success: false, error: 'Talkie not running' }; }
        })());

      // ── IPC ──
      case 'get_pending_message':
        return jsonResult(await (async () => {
          try { return await apiGet('/api/pending'); }
          catch { return { pending: null, error: 'Talkie not running' }; }
        })());

      case 'respond_to_talkie':
        return jsonResult(await (async () => {
          try { return await apiPost('/api/respond', { content: args.content }); }
          catch { return { success: false, error: 'Talkie not running' }; }
        })());

      // ── State ──
      case 'update_talkie_state':
        return jsonResult(await (async () => {
          try { return await apiPost('/api/state', args); }
          catch { return { success: false, error: 'Talkie not running' }; }
        })());

      // ── Media ──
      case 'analyze_image':
        return jsonResult(await (async () => {
          try {
            return await apiPost('/api/analyze-image', {
              dataUrl: args.dataUrl,
              fileName: args.fileName,
              apiKey: args.apiKey,
            });
          } catch { return { error: 'Talkie not running' }; }
        })());

      case 'open_url':
        return jsonResult(await (async () => {
          try { return await apiPost('/api/open-url', { url: args.url }); }
          catch { return { success: false, error: 'Talkie not running' }; }
        })());

      // ── Jobs ──
      case 'create_talkie_job':
        return jsonResult(await (async () => {
          try {
            return await apiPost('/api/jobs', {
              conversationId: args.conversationId,
              prompt: args.prompt,
              source: 'mcp',
            });
          } catch { return { error: 'Talkie not running' }; }
        })());

      case 'get_talkie_job':
        return jsonResult(await (async () => {
          try { return await apiGet(`/api/jobs/${args.jobId}`); }
          catch { return { error: 'Talkie not running' }; }
        })());

      case 'list_talkie_jobs':
        return jsonResult(await (async () => {
          try {
            const params = args.status ? `?status=${args.status}` : '';
            return await apiGet(`/api/jobs${params}`);
          } catch { return { jobs: [], error: 'Talkie not running' }; }
        })());

      // ── Conversations (NEW) ──
      case 'list_conversations':
        return jsonResult(await (async () => {
          try {
            const limit = args.limit || 50;
            const offset = args.offset || 0;
            return await apiGet(`/api/conversations?limit=${limit}&offset=${offset}`);
          } catch { return { conversations: [], error: 'Talkie not running' }; }
        })());

      case 'get_conversation':
        return jsonResult(await (async () => {
          try { return await apiGet(`/api/conversations/${args.conversationId}`); }
          catch { return { error: 'Talkie not running' }; }
        })());

      case 'create_conversation':
        return jsonResult(await (async () => {
          try {
            const body = { title: args.title || 'New conversation' };
            if (args.id) body.id = args.id;
            return await apiPost('/api/conversations', body);
          } catch { return { error: 'Talkie not running' }; }
        })());

      case 'rename_conversation':
        return jsonResult(await (async () => {
          try {
            return await apiPatch(`/api/conversations/${args.conversationId}`, {
              title: args.title,
            });
          } catch { return { error: 'Talkie not running' }; }
        })());

      case 'delete_conversation':
        return jsonResult(await (async () => {
          try { return await apiDelete(`/api/conversations/${args.conversationId}`); }
          catch { return { error: 'Talkie not running' }; }
        })());

      // ── Search (NEW) ──
      case 'search_conversations':
        return jsonResult(await (async () => {
          try {
            const limit = args.limit || 50;
            const q = encodeURIComponent(args.query);
            return await apiGet(`/api/search?q=${q}&limit=${limit}`);
          } catch { return { results: [], error: 'Talkie not running' }; }
        })());

      // ── Messages (NEW) ──
      case 'add_message':
        return jsonResult(await (async () => {
          try {
            return await apiPost(`/api/conversations/${args.conversationId}/messages`, {
              role: args.role,
              content: args.content,
              source: args.source || 'mcp',
            });
          } catch { return { error: 'Talkie not running' }; }
        })());

      // ── Plans (NEW) ──
      case 'list_plans':
        return jsonResult(await (async () => {
          try {
            const limit = args.limit || 50;
            const offset = args.offset || 0;
            return await apiGet(`/api/plans?limit=${limit}&offset=${offset}`);
          } catch { return { plans: [], error: 'Talkie not running' }; }
        })());

      case 'get_plan':
        return jsonResult(await (async () => {
          try { return await apiGet(`/api/plans/${args.planId}`); }
          catch { return { error: 'Talkie not running' }; }
        })());

      case 'create_plan':
        return jsonResult(await (async () => {
          try {
            return await apiPost('/api/plans', {
              title: args.title,
              content: args.content,
              status: args.status || 'draft',
              conversationId: args.conversationId,
            });
          } catch { return { error: 'Talkie not running' }; }
        })());

      case 'update_plan':
        return jsonResult(await (async () => {
          try {
            const body = {};
            if (args.title !== undefined) body.title = args.title;
            if (args.content !== undefined) body.content = args.content;
            if (args.status !== undefined) body.status = args.status;
            return await apiPut(`/api/plans/${args.planId}`, body);
          } catch { return { error: 'Talkie not running' }; }
        })());

      case 'delete_plan':
        return jsonResult(await (async () => {
          try { return await apiDelete(`/api/plans/${args.planId}`); }
          catch { return { error: 'Talkie not running' }; }
        })());

      // ── Liner Notes (NEW) ──
      case 'get_liner_notes':
        return jsonResult(await (async () => {
          try { return await apiGet(`/api/conversations/${args.conversationId}/liner-notes`); }
          catch { return { error: 'Talkie not running' }; }
        })());

      case 'set_liner_notes':
        return jsonResult(await (async () => {
          try {
            return await apiPut(`/api/conversations/${args.conversationId}/liner-notes`, {
              linerNotes: args.linerNotes ?? null,
            });
          } catch { return { error: 'Talkie not running' }; }
        })());

      // ── Export (NEW) ──
      case 'export_conversation':
        return jsonResult(await (async () => {
          try {
            const conv = await apiGet(`/api/conversations/${args.conversationId}`);
            if (conv.error) return conv;

            const format = args.format || 'markdown';

            if (format === 'json') {
              return { format: 'json', data: conv };
            }

            return { format: 'markdown', data: formatConversationMarkdown(conv) };
          } catch { return { error: 'Talkie not running' }; }
        })());

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return jsonResult({ error: err.message });
  }
});

// ============================================
// Start
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Talkie MCP server running (30 tools)');
}

main().catch(console.error);
