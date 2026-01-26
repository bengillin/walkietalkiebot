# Plan: Structured Response Formatting

## Problem

Responses are verbose walls of text that don't work well for voice or visual scanning. Need a format that provides:
- Brief voice-friendly summary at the top
- Visually structured details below for reading
- Clear hierarchy grouping related steps together

## Proposed Format

### Structure

```
[1-2 sentence voice summary]

---

**Context**
- What I understood
- Key constraints

**Changes Made**
  file.ts
  - specific change
  - another change

  another-file.ts
  - what changed here

**Result**
- What you can do now
- Any follow-up needed
```

### Principles

1. **Voice-first summary** - Top line answers "what happened" in spoken form
2. **Scannable details** - Grouped by category, not chronological order
3. **Hierarchy through indentation** - Files under sections, changes under files
4. **Whitespace as separation** - Blank lines between thought groups
5. **No run-on paragraphs** - Each point gets its own line

## Examples

### Before (verbose)

"I've implemented all the keyboard shortcuts: Escape cancels recording, Cmd+K focuses the search input, Cmd+E opens the export menu, and arrow keys navigate through search results with visual highlighting. The build passes and everything is ready to test."

### After (structured)

"Keyboard shortcuts are ready to test.

---

**Added shortcuts**
- Escape → cancel recording
- Cmd+K → focus search
- Cmd+E → open export
- Arrow keys → navigate results

**Files changed**
  useKeyboardShortcuts.ts (new)
  App.tsx
  ChatHistory.tsx
  ChatHistory.css

**Status**
- Build passing
- Ready for manual testing"

## Implementation

This is a behavioral guideline, not code. Apply this format when:
- Completing multi-step tasks
- Making code changes
- Answering questions with multiple parts

Keep voice summary under 15 words when possible.
