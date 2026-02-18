---
name: launch-voice
description: Launch Talkie's voice interface in the browser. Use when the user wants to switch to voice interaction.
allowed-tools: launch_talkie, get_talkie_status
---

# Launch Talkie Voice UI

Start the full Talkie web server and open the voice interface in the browser.

## Steps

1. Check if Talkie is already running with `get_talkie_status`
2. If not running, use `launch_talkie` to start the server and open the browser
3. Tell the user the URL (typically https://localhost:5173)

## Requirements

- The `talkiebot` npm package must be installed globally or available via npx
- Chrome or Edge is recommended (Web Speech API support)
- The browser will show a certificate warning on first visit (self-signed cert)

## If Not Installed

Tell the user to install with: `npm install -g talkiebot`
