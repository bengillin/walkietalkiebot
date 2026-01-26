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

// Create MCP server
const server = new Server(
  {
    name: 'talkboy',
    version: '0.1.0',
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
        description: 'Get the full conversation history from Talkboy.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;

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
