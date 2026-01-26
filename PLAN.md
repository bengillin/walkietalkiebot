# Talkboy Development Plan

## Completed Features

### Core Functionality
- [x] Voice input with push-to-talk (spacebar)
- [x] Claude API integration
- [x] Conversation history with persistence

### Voice Interaction Modes
- [x] Wake word detection - "hey talkboy" activation
- [x] Continuous listening with "over" trigger word
- [x] Silence detection for natural conversation flow

### Advanced Features
- [x] Claude Code mode - route through CLI for agent capabilities
- [x] Image analysis with drag-and-drop and lightbox modal
- [x] Text-to-speech (TTS) for responses
- [x] Text input option alongside voice

### Conversation Management
- [x] Search through conversation history with highlighted results
- [x] Export conversations to JSON/Markdown/Text
- [x] Session management with Claude Code mode

## Current Sprint: Expanded Onboarding

### Goal
Create a comprehensive onboarding flow that introduces users to all available features, matching parity with the Settings panel.

### Features to Cover in Onboarding

1. **Welcome & Mode Selection** (existing)
   - Claude Code mode vs API key

2. **Basic Interaction** (existing, expand)
   - Push-to-talk with spacebar
   - "Over" trigger word for hands-free

3. **Wake Word Detection** (new step)
   - "Hey Talkboy" activation
   - When to use it vs push-to-talk

4. **Continuous Listening Mode** (new step)
   - Always-on listening
   - Natural conversation with "over" to send
   - Privacy considerations

5. **Claude Code Mode** (new step - if selected)
   - What it enables (file access, terminal commands)
   - How it differs from API-only mode

6. **Image Analysis** (new step)
   - Drag and drop images
   - Supported formats
   - Use cases

7. **Additional Options** (new step)
   - Text input toggle
   - TTS toggle
   - Quick settings overview

### Implementation Plan

1. Refactor step system to support dynamic steps based on mode selection
2. Add new step components for each feature
3. Create step indicator/progress bar
4. Allow skipping to end for returning users
5. Store onboarding completion state

## Future Priorities

### Polish & UX
- [ ] Keyboard shortcuts help overlay
- [ ] Better error handling and retry UI
- [ ] Loading states and animations

### Features Under Consideration
- [ ] Multiple conversation threads
- [ ] Custom wake words
- [ ] Voice cloning for responses
- [ ] Offline transcription option
