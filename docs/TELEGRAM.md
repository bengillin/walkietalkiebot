# Talkie Telegram Bot

Chat with Claude Code from your phone via Telegram.

## Overview

The Telegram bot provides a mobile-friendly text interface to Talkie. You can send text messages and photos to Claude Code, manage conversations, and check server status -- all from the Telegram app on your phone.

The bot is built with the [grammY](https://grammy.dev/) framework and connects to the Talkie server's existing HTTP API to process messages.

## Setup

### 1. Create a bot with BotFather

Open Telegram and message [@BotFather](https://t.me/BotFather):

1. Send `/newbot`
2. Choose a display name (e.g., "Talkie")
3. Choose a username (e.g., "my_talkie_bot")
4. Copy the token BotFather gives you

### 2. Configure the token

Provide the token using either method:

**Environment variable:**

```bash
export TELEGRAM_BOT_TOKEN="123456:ABC-DEF..."
```

**Token file:**

```bash
mkdir -p ~/.talkie
echo "123456:ABC-DEF..." > ~/.talkie/telegram.token
```

The bot checks the environment variable first, then falls back to the token file.

### 3. Start Talkie

The Telegram bot starts automatically when the Talkie server launches (assuming a valid token is found). No additional configuration is needed.

The bot connects to the Talkie server at the URL specified by the `TALKIE_URL` environment variable, defaulting to `https://localhost:5173`.

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message with command list and web UI link |
| `/help` | Show available commands |
| `/conversations` | List the 5 most recent conversations with inline keyboard buttons to select one |
| `/new <name>` | Create a new conversation with the given name (defaults to "New conversation") |
| `/current` | Show the currently active conversation with its title, creation date, and last update time |
| `/status` | Check server status, database connection, and Claude's current avatar state |

## Message Handling

### Text Messages

Any text message that is not a command is routed to Claude Code:

1. The bot looks up or creates a conversation for the user.
2. The user's message is stored in SQLite with `source: "telegram"`.
3. A typing indicator is shown while processing.
4. The bot calls `POST /api/claude-code` with the message and recent conversation history.
5. The SSE response stream is read to completion (no streaming to the user -- it waits for the full response).
6. The assistant response and any tool activities are stored in the database.
7. The response is sent back to the user.

If the response exceeds Telegram's 4096-character message limit, it is split into multiple messages at 4096-character boundaries.

### Photos

Photos sent to the bot are analyzed using Claude's vision capability:

1. The bot downloads the highest-resolution version of the photo from Telegram's servers.
2. The image is converted to a base64 data URL.
3. The bot calls `POST /api/analyze-image` to get a text description of the image.
4. The description is combined with any caption the user attached to the photo.
5. This combined message is sent to `POST /api/claude-code` for a conversational response.
6. Both the user message (with image attachment) and assistant response are stored in SQLite.

## Conversation State

Each Telegram user has their own conversation state tracked in the `telegram_state` database table. This maps a Telegram user ID to a Talkie conversation ID.

- When a user sends their first message, a new conversation is automatically created.
- Users can switch conversations using the inline keyboard buttons shown by `/conversations`.
- The `/new` command creates a conversation and immediately sets it as the active one.
- If a user's current conversation is deleted, the bot detects this on the next message and creates a new conversation automatically.

Conversation switching uses Telegram's inline keyboard feature. The `/conversations` command shows up to 5 recent conversations as buttons, plus a "+ Create new" button.

## Unsupported Message Types

The bot responds with a helpful message for unsupported input types:

| Type | Response |
|------|----------|
| Voice messages | Not supported; suggests typing or using the web UI for voice input |
| Videos | Not supported; suggests describing the content or using the web UI |
| Video notes (circles) | Not supported; suggests typing instead |
| Documents/files | Not supported; suggests using the web UI |
| Stickers | Replies with a smiley |

## Limitations

- **No streaming**: The bot waits for the complete Claude Code response before sending it to the user. There is no incremental delivery.
- **No voice message transcription**: Voice messages are not transcribed. Use the web UI for voice input.
- **No document support**: Files and documents cannot be processed through Telegram.
- **Message length**: Responses longer than 4096 characters are split into multiple messages at fixed boundaries (not at sentence or word boundaries).
- **No inline mode**: The bot only works in direct messages, not inline in other chats.
- **Single conversation per user**: Each user can only have one active conversation at a time (though they can switch between existing ones).

## Technical Details

- **Framework**: grammY (`grammy` npm package)
- **API communication**: The bot calls the Talkie HTTPS API using `undici` with `rejectUnauthorized: false` to support the self-signed TLS certificate.
- **Database**: Conversation state is persisted in the `telegram_state` SQLite table. Messages and activities use the same tables as the web UI.
- **Message source**: All messages created by the Telegram bot have `source: "telegram"` to distinguish them from web UI messages (`source: "web"`).
- **SSE parsing**: The bot manually parses Server-Sent Events from the `/api/claude-code` response stream using a line-by-line buffer approach.
- **Error handling**: On API errors, the bot shows an error message with a "Try again" inline keyboard button that deletes the error message when pressed.
