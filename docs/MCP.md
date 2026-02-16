# TalkBoy MCP Server

Model Context Protocol server that enables Claude Code to launch and interact with TalkBoy.

## Overview

The TalkBoy MCP server exposes 12 tools that let Claude Code control the TalkBoy voice interface, read transcripts and conversation history, manage sessions, handle IPC messaging, and work with media. All tools are thin proxies over the TalkBoy HTTPS API running at `https://localhost:5173`.

## Setup

Add the following to your `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "talkboy": {
      "command": "node",
      "args": ["/path/to/talkboy/mcp-server/index.js"]
    }
  }
}
```

Replace `/path/to/talkboy` with the actual path to your TalkBoy installation.

The server port defaults to `5173` and can be overridden with the `TALKBOY_PORT` environment variable.

## Tools

### Core

#### `launch_talkboy`

Launch the TalkBoy voice interface in a browser. If TalkBoy is already running, it opens the URL in the browser (preferring Google Chrome for Web Speech API support). If not running, it spawns `npx talkboy` as a detached process and polls until the server is ready (up to 15 seconds).

**Input**: None

**Output**: `{ "success": true, "message": "...", "url": "https://localhost:5173" }`

#### `get_talkboy_status`

Check if TalkBoy is running and get its current state.

**Input**: None

**Output**: `{ "running": true, "avatarState": "idle", "dbStatus": "connected" }`

The `avatarState` is one of: `idle`, `listening`, `thinking`, `speaking`.

#### `get_transcript`

Get the latest voice transcript from TalkBoy, including the last user and assistant messages.

**Input**: None

**Output**: `{ "transcript": "...", "lastUserMessage": "...", "lastAssistantMessage": "..." }`

#### `get_conversation_history`

Get the full conversation history from server memory.

**Input**: None

**Output**: `{ "messages": [{ "role": "user", "content": "..." }, ...] }`

### Session

#### `get_claude_session`

Get the current Claude Code session ID, if one is connected.

**Input**: None

**Output**: `{ "sessionId": "abc123" }` or `{ "sessionId": null }`

#### `set_claude_session`

Connect TalkBoy to a specific Claude Code session.

**Input**:

| Parameter   | Type   | Required | Description |
|-------------|--------|----------|-------------|
| `sessionId` | string | Yes      | The Claude Code session ID to connect to |

**Output**: `{ "success": true, "sessionId": "abc123" }`

#### `disconnect_claude_session`

Disconnect the current Claude Code session (clears the session ID).

**Input**: None

**Output**: `{ "success": true }`

### IPC

#### `get_pending_message`

Check if there is a pending message from the TalkBoy frontend waiting for a response. Use this to poll for user messages in IPC mode.

**Input**: None

**Output**: `{ "pending": { "content": "...", "timestamp": 1704067200000 }, "sessionConnected": true }`

`pending` is `null` when no message is waiting.

#### `respond_to_talkboy`

Send a response back to the TalkBoy frontend. Use this in IPC mode to respond to a pending message. The response is delivered to any waiting `/api/send` callers via their SSE streams.

**Input**:

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `content` | string | Yes      | The response content to send to TalkBoy |

**Output**: `{ "success": true }`

### State

#### `update_talkboy_state`

Update the TalkBoy UI state. Can set the avatar animation state and/or the current transcript text.

**Input**:

| Parameter     | Type   | Required | Description |
|---------------|--------|----------|-------------|
| `avatarState` | string | No       | One of: `idle`, `listening`, `thinking`, `speaking` |
| `transcript`  | string | No       | Set the current transcript text |

**Output**: `{ "success": true }`

### Media

#### `analyze_image`

Analyze an image using the Anthropic Claude vision API. Returns a text description of the image content.

**Input**:

| Parameter  | Type   | Required | Description |
|------------|--------|----------|-------------|
| `dataUrl`  | string | Yes      | Base64 data URL of the image (e.g., `data:image/png;base64,...`) |
| `fileName` | string | No       | Filename for the image |
| `apiKey`   | string | No       | Anthropic API key (uses `ANTHROPIC_API_KEY` env var if not provided) |

**Output**: `{ "description": "The image shows...", "fileName": "screenshot.png" }`

#### `open_url`

Open a URL in the default browser. Only `http://` and `https://` URLs are accepted.

**Input**:

| Parameter | Type   | Required | Description |
|-----------|--------|----------|-------------|
| `url`     | string | Yes      | The URL to open (must be http or https) |

**Output**: `{ "success": true }`

## Usage Patterns

### IPC Mode (Bidirectional Communication)

IPC mode lets Claude Code act as the "brain" behind TalkBoy's voice interface. The flow works as follows:

1. **Connect your session**: Use `set_claude_session` to register your Claude Code session with TalkBoy.

2. **Poll for messages**: Periodically call `get_pending_message` to check if the user has spoken through the TalkBoy UI.

3. **Process and respond**: When a pending message is found, process it however you like (run tools, search code, etc.), then call `respond_to_talkboy` with your response. This delivers the response back to the TalkBoy UI, which speaks it aloud.

4. **Update state**: Use `update_talkboy_state` to control the avatar animation (set to `thinking` while processing, `speaking` when responding, `idle` when done).

5. **Disconnect**: Call `disconnect_claude_session` when you are done.

Example sequence:

```
set_claude_session({ sessionId: "my-session" })
update_talkboy_state({ avatarState: "listening" })

# Poll loop:
get_pending_message()  -->  { pending: { content: "What files are in this project?" } }

update_talkboy_state({ avatarState: "thinking" })
# ... do work ...
respond_to_talkboy({ content: "There are 15 TypeScript files in the src directory." })
update_talkboy_state({ avatarState: "idle" })
```

### Quick Status Check

Use `get_talkboy_status` and `get_transcript` to check what the user has been saying without entering full IPC mode.

### Launch and Interact

Call `launch_talkboy` to start the server and open the browser, then use `get_conversation_history` to see what has been discussed.

## Technical Details

- **Transport**: stdio (standard input/output), as required by the MCP specification.
- **Protocol**: All tools make HTTPS requests to the TalkBoy API at `https://localhost:{TALKBOY_PORT}`.
- **TLS**: The server sets `NODE_TLS_REJECT_UNAUTHORIZED=0` to allow the self-signed certificate used by TalkBoy's local HTTPS server.
- **Server name**: `talkboy`
- **Server version**: `0.2.0`
- **Process management**: `launch_talkboy` spawns `npx talkboy` as a detached, unref'd child process so it survives after the MCP server exits.
