---
name: launch-voice
description: Launch Walkie Talkie Bot's voice interface in the browser. Use when the user wants to switch to voice interaction.
allowed-tools: mcp__plugin_wtb_wtb__launch_wtb, mcp__plugin_wtb_wtb__get_wtb_status
---

# Launch Voice UI

Start the Walkie Talkie Bot web server and open the voice interface in the browser.

## Steps

1. Use `launch_wtb`. It checks whether the server is already running: if so it just opens the browser, otherwise it starts the server (from the installed `walkietalkiebot` package) and waits for it to answer.
2. Tell the user the URL it returns (typically http://localhost:5173).
3. If `launch_wtb` reports a failure, show the user the error and the server output it includes. Use `get_wtb_status` to confirm whether a server is reachable.

## Requirements

- Node.js 20+ (the server comes from the `walkietalkiebot` npm package, which the plugin already uses for its MCP server)
- Chrome or Edge is recommended (Web Speech API support)

## Starting it manually

If launching from the tool fails, the user can start the server themselves with:

```
npx -y walkietalkiebot
```

Do not suggest `npx wtb`: `wtb` on npm is an unrelated package.
