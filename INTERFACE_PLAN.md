# TalkBoy Interface Improvement Plan

## The Problem We Just Had

While planning this very improvement, the plan was built in conversation context but never saved to a file. When you asked to see it, there was nothing to show. This highlights a fundamental UX gap: **TalkBoy has no way to surface artifacts, documents, or plans that Claude produces during a conversation.** Everything lives in the chat stream and gets lost.

This plan addresses that problem alongside all the other interface improvements.

---

## Questions I Need Your Input On

### Q1: Layout Approach
Your LAYOUT_SKETCH.md recommends Option B (Integrated Single Row) with drawer triggers on the left of the input bar and input actions on the right. The current TapeDeck component already has the cassette slot on the left and input on the right.

**Do you want to go with Option B?** Or has your thinking changed? The options were:
- **A**: Two-row bottom bar (action row + input row)
- **B**: Integrated single row (recommended in your sketch)
- **C**: Floating action buttons
- **D**: Segmented input bar

### Q2: Scope — What Should Phase 1 Cover?
I'd recommend doing this in phases. Here's what I see as the full scope, grouped by priority:

**Phase 1 — Core UX Fixes (this pass)**
1. Artifact/Document viewer (solve the "lost plan" problem)
2. Input bar redesign (Option B or your pick)
3. Settings drawer completeness (wake word, custom wake word, rename tapes)
4. Conversation search in tape collection
5. Context conversation picker (already in store, no UI)

**Phase 2 — Polish & Features**
6. Robot avatar with expression states (the Rive character from CHARACTER.md)
7. Conversation export
8. Improved onboarding that covers all features
9. Desktop keyboard shortcuts guide

**Phase 3 — Advanced**
10. Multi-modal improvements (better image handling in timeline)
11. MCP session management UI
12. Telegram status/link in settings

**Which phases do you want me to tackle now?**

### Q3: Artifact Viewer — How Should It Work?
For solving the "lost plan" problem, here are some options:

- **A) Side panel** — When Claude produces a document/code/plan, it appears in a sliding side panel alongside the chat. Like Artifacts in claude.ai. Could toggle open/close.
- **B) Pinned messages** — Ability to pin any message to a sticky area at the top of the timeline. Pinned items stay visible as you scroll.
- **C) Tape liner notes** — Each tape (conversation) gets a "liner notes" section (like album liner notes) where important outputs are saved. Accessible from the tape collection.
- **D) All of the above** — Side panel for live viewing, with ability to pin to liner notes for permanent access.

I'd lean toward **A (side panel)** for Phase 1 since it's the most immediately useful and fits the aesthetic (like opening the cassette case to read the liner notes).

---

## Detailed Plan

### 1. Artifact/Document Viewer (Solve the "Lost Plan" Problem)

**Problem**: Claude produces plans, documents, code, and other structured outputs that get buried in the chat stream. There's no way to view them persistently or reference them later.

**Solution**: A "Liner Notes" side panel that slides in from the right.

- When Claude produces markdown, code blocks, or structured content, a "View as liner notes" button appears on that message
- Clicking opens a side panel with rendered markdown
- Panel has a pin button to save it as permanent liner notes for that tape
- Each tape's liner notes are accessible from the tape collection (small icon on the cassette)
- Liner notes stored as a new field on conversations in the DB

**Cassette tape metaphor**: Real cassette tapes came with liner notes inside the case — lyrics, credits, thank-yous. Our version holds plans, code, summaries.

**Components needed**:
- `LinerNotes.tsx` — Side panel component
- DB migration: `liner_notes` text column on `conversations` table
- Store additions: `linerNotes` state, `saveLinerNotes` action
- API additions: `GET/PUT /api/conversations/:id/liner-notes`

### 2. Input Bar Redesign

**Current**: TapeDeck has mini cassette on left, textarea in center, send button on right. Settings/eject/record buttons are in the header, far from the drawers they control.

**Proposed (Option B)**: Integrated single row:
```
[⏏️ Tapes] [⚙️ Settings]  [ Input field... ]  [📎 Files] [🎤 Mic] [➤ Send]
     ↓          ↓                                   ↓
  Tape         Settings                         File
  collection   drawer                           picker
```

**Changes**:
- Move eject and settings buttons from Header to TapeDeck
- Add file attachment button to input bar (currently only drag-drop)
- Keep mic button (shown when not in continuous mode)
- Mini cassette moves to inside the input field as a subtle indicator, or becomes the eject button itself
- Header becomes minimal: just logo + avatar status + record indicator

### 3. Settings Drawer Completeness

**Missing settings that already exist in the store**:
- Wake word toggle (currently only in onboarding)
- Custom wake word input
- Custom trigger word input (currently only shows when continuous listening is on, but no custom word field)

**New settings to add**:
- Rename current conversation (long-press on tape or edit icon)
- Sound effects toggle
- Voice selection (if multiple TTS voices available)

### 4. Conversation Search

**Problem**: No way to find old conversations in the tape collection.

**Solution**: Search bar at top of tape collection drawer. Uses the existing `messages_fts` FTS5 table for full-text search across all conversations.

**Components**:
- Search input in TapeCollection header
- API: `GET /api/search?q=term` (already exists in server)
- Highlight matching conversations in the grid

### 5. Context Conversation Picker

**Problem**: `contextConversationIds` exists in the store but has no UI. This would let you reference other conversations as context when talking to Claude.

**Solution**: In the tape collection, add a "select for context" mode. Selected tapes get a visual indicator (glow/border). When sending a message, selected context conversations' messages are included in the prompt.

### 6. Header Simplification

With buttons moving to the input bar, the header becomes:
```
[Avatar/Status]  TalkBoy  [🔴 Recording indicator]  [📋 Liner Notes]
```

- Avatar shows current state (idle/listening/thinking/speaking)
- Recording indicator pulses when voice is active
- Liner notes button opens the side panel (if there are notes for current tape)
- On mobile: hamburger menu still available but with fewer items

---

## Aesthetic Guidelines

All new components should maintain the cassette tape / TalkBoy aesthetic:
- **Colors**: Metallic grays, blacks, warm accent colors from tape labels
- **Textures**: Brushed metal, speaker grille patterns, plastic screws
- **Shadows**: 3D beveled buttons, inset shadows for pressed states
- **Typography**: Retro-styled labels, monospace for technical content
- **Animations**: Smooth drawer slides, tape reel spins, subtle spring physics
- **Sound**: Mechanical click sounds for button presses (using existing sound effects system)
- **Metaphor**: Everything maps to the cassette tape world — conversations are tapes, plans are liner notes, the input bar is the tape deck, ejecting swaps tapes

---

## Implementation Order

If we're doing Phase 1:
1. **Input bar redesign** first (structural change, affects layout)
2. **Header simplification** (follows from input bar changes)
3. **Settings completeness** (quick wins, surfaces existing features)
4. **Conversation search** (uses existing FTS infrastructure)
5. **Liner Notes / Artifact viewer** (new feature, biggest lift)
6. **Context picker** (builds on tape collection changes)

Each step is independently shippable. We can stop after any step and have a better interface than before.
