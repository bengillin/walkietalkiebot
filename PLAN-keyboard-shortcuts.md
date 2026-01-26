# Keyboard Shortcuts Implementation Plan

## Overview
Add keyboard shortcuts to complement the voice-first interface, focusing on shortcuts that enhance hands-free workflows.

## Shortcuts to Implement

| Shortcut | Action | Context |
|----------|--------|---------|
| Escape | Cancel recording | While recording |
| Cmd+K | Open search modal | Global |
| Cmd+E | Export conversation | Global |
| ↑/↓ | Navigate conversation history | When search modal is open |

Note: Space bar push-to-talk already exists in the codebase.

## Implementation Steps

### 1. Create a keyboard shortcuts hook
- Create `src/hooks/useKeyboardShortcuts.ts`
- Use `useEffect` to register global keyboard event listeners
- Handle modifier keys (Cmd/Ctrl) for cross-platform support

### 2. Wire up Escape to cancel recording
- In the hook, detect Escape key press
- Check if currently recording via `isRecording` state
- Call `stopRecording()` from the audio store

### 3. Wire up Cmd+K for search
- Detect Cmd+K (or Ctrl+K on Windows/Linux)
- Prevent default browser behavior
- Toggle the search modal open state

### 4. Wire up Cmd+E for export
- Detect Cmd+E (or Ctrl+E)
- Prevent default browser behavior
- Trigger the export functionality from ConversationHistory

### 5. Add arrow key navigation in search modal
- When search modal is open, ↑/↓ navigate through results
- Enter key selects the highlighted result

### 6. Integrate the hook
- Add `useKeyboardShortcuts()` to the main App component or layout
- Pass required callbacks and state

## Files to Create/Modify

- **Create:** `src/hooks/useKeyboardShortcuts.ts`
- **Modify:** `src/App.tsx` or main layout component to use the hook
- **Modify:** `src/components/ConversationHistory.tsx` to expose search/export controls

## Testing
- Verify each shortcut works as expected
- Ensure shortcuts don't conflict with browser defaults
- Test that shortcuts are disabled when typing in input fields
