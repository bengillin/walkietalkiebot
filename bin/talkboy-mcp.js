#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const TALKBOY_PORT = parseInt(process.env.TALKBOY_PORT || '5173', 10);
const TALKBOY_URL = `https://localhost:${TALKBOY_PORT}`;

// Allow self-signed certificates for local dev
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let talkboyProcess = null;

// Check if Talkboy is running
async function isTalkboyRunning() {
  try {
    const response = await fetch(`${TALKBOY_URL}/api/status`);
    return response.ok;
  } catch {
    return false;
  }
}

// Launch Talkboy using npx
async function launchTalkboy() {
  if (await isTalkboyRunning()) {
    // Already running, just open the browser (prefer Chrome for Web Speech API)
    exec(`open -a "Google Chrome" ${TALKBOY_URL} 2>/dev/null || open ${TALKBOY_URL}`);
    return { success: true, message: 'Talkboy is already running (use Chrome/Edge for voice)', url: TALKBOY_URL };
  }

  return new Promise((resolve) => {
    // Use npx talkboy to start the server
    talkboyProcess = spawn('npx', ['talkboy'], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env, TALKBOY_PORT: String(TALKBOY_PORT) },
    });

    talkboyProcess.unref();

    // Wait for server to be ready
    let attempts = 0;
    const checkReady = setInterval(async () => {
      attempts++;
      if (await isTalkboyRunning()) {
        clearInterval(checkReady);
        resolve({ success: true, message: 'Talkboy launched', url: TALKBOY_URL });
      } else if (attempts > 30) {
        clearInterval(checkReady);
        resolve({ success: false, message: 'Talkboy failed to start' });
      }
    }, 500);
  });
}

// Get status from Talkboy
async function getStatus() {
  try {
    const response = await fetch(`${TALKBOY_URL}/api/status`);
    if (response.ok) {
      return await response.json();
    }
    return { running: false };
  } catch {
    return { running: false };
  }
}

// Get latest transcript
async function getTranscript() {
  try {
    const response = await fetch(`${TALKBOY_URL}/api/transcript`);
    if (response.ok) {
      return await response.json();
    }
    return { transcript: null, error: 'Failed to get transcript' };
  } catch {
    return { transcript: null, error: 'Talkboy not running' };
  }
}

// Get conversation history
async function getHistory() {
  try {
    const response = await fetch(`${TALKBOY_URL}/api/history`);
    if (response.ok) {
      return await response.json();
    }
    return { messages: [], error: 'Failed to get history' };
  } catch {
    return { messages: [], error: 'Talkboy not running' };
  }
}

// Get Claude Code session info
async function getSession() {
  try {
    const response = await fetch(`${TALKBOY_URL}/api/session`);
    if (response.ok) {
      return await response.json();
    }
    return { sessionId: null, error: 'Failed to get session' };
  } catch {
    return { sessionId: null, error: 'Talkboy not running' };
  }
}

// Set Claude Code session ID
async function setSession(sessionId) {
  try {
    const response = await fetch(`${TALKBOY_URL}/api/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    if (response.ok) {
      return await response.json();
    }
    return { success: false, error: 'Failed to set session' };
  } catch {
    return { success: false, error: 'Talkboy not running' };
  }
}

// Disconnect Claude Code session
async function disconnectSession() {
  try {
    const response = await fetch(`${TALKBOY_URL}/api/session`, {
      method: 'DELETE',
    });
    if (response.ok) {
      return await response.json();
    }
    return { success: false, error: 'Failed to disconnect session' };
  } catch {
    return { success: false, error: 'Talkboy not running' };
  }
}

// Get pending message (for IPC mode)
async function getPendingMessage() {
  try {
    const response = await fetch(`${TALKBOY_URL}/api/pending`);
    if (response.ok) {
      return await response.json();
    }
    return { pending: null, error: 'Failed to get pending message' };
  } catch {
    return { pending: null, error: 'Talkboy not running' };
  }
}

// Respond to pending message (for IPC mode)
async function respondToMessage(content) {
  try {
    const response = await fetch(`${TALKBOY_URL}/api/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    if (response.ok) {
      return await response.json();
    }
    return { success: false, error: 'Failed to respond' };
  } catch {
    return { success: false, error: 'Talkboy not running' };
  }
}

// Update state
async function updateState(stateUpdate) {
  try {
    const response = await fetch(`${TALKBOY_URL}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stateUpdate),
    });
    if (response.ok) {
      return await response.json();
    }
    return { success: false, error: 'Failed to update state' };
  } catch {
    return { success: false, error: 'Talkboy not running' };
  }
}

// Analyze an image
async function analyzeImage(dataUrl, fileName, apiKey) {
  try {
    const response = await fetch(`${TALKBOY_URL}/api/analyze-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl, fileName, apiKey }),
    });
    if (response.ok) {
      return await response.json();
    }
    const error = await response.text();
    return { error: `Failed to analyze image: ${error}` };
  } catch {
    return { error: 'Talkboy not running' };
  }
}

// Open URL in browser
async function openUrl(url) {
  try {
    const response = await fetch(`${TALKBOY_URL}/api/open-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    if (response.ok) {
      return await response.json();
    }
    return { success: false, error: 'Failed to open URL' };
  } catch {
    return { success: false, error: 'Talkboy not running' };
  }
}

// Create MCP server
const server = new Server(
  {
    name: 'talkboy',
    version: '0.2.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // Core tools
      {
        name: 'launch_talkboy',
        description: 'Launch the Talkboy voice interface in a browser. Use this when the user wants to interact with voice.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_talkboy_status',
        description: 'Check if Talkboy is running and get its current state (idle, listening, thinking, speaking).',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_transcript',
        description: 'Get the latest voice transcript from Talkboy. Use after user has spoken.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'get_conversation_history',
        description: 'Get the full conversation history from the current tape/conversation in Talkboy.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      // Session management tools
      {
        name: 'get_claude_session',
        description: 'Get the current Claude Code session ID if one is connected.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'set_claude_session',
        description: 'Set the Claude Code session ID to connect Talkboy to your session.',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: {
              type: 'string',
              description: 'The Claude Code session ID to connect to',
            },
          },
          required: ['sessionId'],
        },
      },
      {
        name: 'disconnect_claude_session',
        description: 'Disconnect the current Claude Code session.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      // IPC tools for Claude Code integration
      {
        name: 'get_pending_message',
        description: 'Check if there is a pending message from Talkboy waiting for a response. Use this to poll for user messages in IPC mode.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
      {
        name: 'respond_to_talkboy',
        description: 'Send a response back to Talkboy. Use this in IPC mode to respond to a pending message.',
        inputSchema: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The response content to send to Talkboy',
            },
          },
          required: ['content'],
        },
      },
      // State management
      {
        name: 'update_talkboy_state',
        description: 'Update Talkboy state (avatar state, transcript, messages, etc.).',
        inputSchema: {
          type: 'object',
          properties: {
            avatarState: {
              type: 'string',
              enum: ['idle', 'listening', 'thinking', 'speaking'],
              description: 'The avatar state to set',
            },
            transcript: {
              type: 'string',
              description: 'Set the current transcript text',
            },
          },
          required: [],
        },
      },
      // Media tools
      {
        name: 'analyze_image',
        description: 'Analyze an image using Claude vision API. Returns a description of the image content.',
        inputSchema: {
          type: 'object',
          properties: {
            dataUrl: {
              type: 'string',
              description: 'Base64 data URL of the image (e.g., data:image/png;base64,...)',
            },
            fileName: {
              type: 'string',
              description: 'Optional filename for the image',
            },
            apiKey: {
              type: 'string',
              description: 'Optional Anthropic API key (uses ANTHROPIC_API_KEY env var if not provided)',
            },
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
            url: {
              type: 'string',
              description: 'The URL to open (must be http or https)',
            },
          },
          required: ['url'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'launch_talkboy': {
      const result = await launchTalkboy();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'get_talkboy_status': {
      const status = await getStatus();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(status, null, 2),
          },
        ],
      };
    }

    case 'get_transcript': {
      const transcript = await getTranscript();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(transcript, null, 2),
          },
        ],
      };
    }

    case 'get_conversation_history': {
      const history = await getHistory();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(history, null, 2),
          },
        ],
      };
    }

    case 'get_claude_session': {
      const session = await getSession();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(session, null, 2),
          },
        ],
      };
    }

    case 'set_claude_session': {
      const result = await setSession(args.sessionId);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'disconnect_claude_session': {
      const result = await disconnectSession();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'get_pending_message': {
      const pending = await getPendingMessage();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(pending, null, 2),
          },
        ],
      };
    }

    case 'respond_to_talkboy': {
      const result = await respondToMessage(args.content);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'update_talkboy_state': {
      const result = await updateState(args);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'analyze_image': {
      const result = await analyzeImage(args.dataUrl, args.fileName, args.apiKey);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    case 'open_url': {
      const result = await openUrl(args.url);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Talkboy MCP server running');
}

main().catch(console.error);
