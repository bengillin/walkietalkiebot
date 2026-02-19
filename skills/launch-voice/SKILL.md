---
name: launch-voice
description: Launch Walkie Talkie Bot's voice interface in the browser. Use when the user wants to switch to voice interaction.
allowed-tools: launch_wtb, get_wtb_status
---

# Launch Voice UI

Start the Walkie Talkie Bot web server and open the voice interface in the browser.

## Steps

1. Check if WTB is already running with `get_wtb_status`
2. If not running, use `launch_wtb` to start the server and open the browser
3. Tell the user the URL (typically https://localhost:5173)

## Requirements

- The `walkietalkiebot` npm package must be installed globally or available via npx
- Chrome or Edge is recommended (Web Speech API support)
- The browser will show a certificate warning on first visit (self-signed cert)

## If Not Installed

Tell the user to install with: `npm install -g walkietalkiebot`
