# Talkboy Robot Character Design

## Character Name Ideas
- **Talkboy** (use the app name)
- **Buddy**
- **Chip**
- **Bleep**
- **Cody** (code + buddy)
- **Sparky**

## Visual Design

### Overall Vibe
- Cute, not intimidating
- Rounded shapes (friendly)
- Small and compact (fits in corner of screen)
- Desk toy / Tamagotchi energy
- Think: Wall-E meets a smart speaker

### Body Shape Options

```
Option A: Round/Spherical        Option B: Boxy/Retro           Option C: Pill/Capsule
     ___                            _______                          ___
    /   \                          |  ___  |                        /   \
   | o o |   ← screen face         | |o o| |                       | o o |
   |  ▽  |                         | |___| |                       |  ◡  |
    \___/                          |_______|                         |   |
      │                               ║║                             |___|
    ──┴──    ← tiny base           ══╧╧══                            ═══
```

**Recommendation**: Option A (spherical) - most friendly and modern

### Face/Screen
The robot's "face" is a screen that displays expressions:
- Large, expressive eyes (the main emotional indicator)
- Simple mouth shapes (or no mouth, just eyes)
- Screen can change color with mood (soft blue = calm, warm yellow = happy, etc.)

### Expression States

```
IDLE (default)                    LISTENING
   ◠ ◠    ← relaxed eyes             ● ●    ← alert, focused

   gentle floating animation          subtle pulse, antenna glow


THINKING                          SPEAKING
   ─ ─    ← eyes become lines        ◠ ◠    ← happy eyes
   ...    ← loading dots              ◡     ← animated mouth

   spinning/processing anim          bounce with each word


HAPPY (task complete)             CONFUSED (error)
   ◠◡◠    ← squinty happy            ◉ ◉    ← wide eyes
    ▽     ← big smile                 ?
   ✨     ← sparkle effects
                                     head tilt, question mark
   bounce celebration
```

### Color Palette

| Element | Color | Hex | Usage |
|---------|-------|-----|-------|
| Body Primary | Soft white/cream | #F5F5F0 | Main body |
| Body Accent | Warm gray | #E0DED8 | Shadows, depth |
| Screen | Soft blue | #4A9FD4 | Default screen bg |
| Screen Happy | Warm yellow | #FFD93D | Success states |
| Screen Error | Soft coral | #FF8B8B | Error states |
| Eyes | Dark charcoal | #2D2D2D | Eye color |
| Glow/Accent | Electric blue | #00D4FF | Antenna, highlights |

### Accessories/Details
- Small antenna on top (glows when listening)
- Subtle speaker grille texture
- Tiny status LED
- Optional: small arms that can wave/gesture

## Animation Specifications

### State Machine (Rive)

```
                    ┌─────────────┐
                    │    IDLE     │◄────────────────┐
                    └──────┬──────┘                 │
                           │                        │
                    [user starts speaking]          │
                           │                        │
                           ▼                        │
                    ┌─────────────┐                 │
                    │  LISTENING  │                 │
                    └──────┬──────┘                 │
                           │                        │
                    [user stops speaking]           │
                           │                        │
                           ▼                        │
                    ┌─────────────┐                 │
                    │  THINKING   │                 │
                    └──────┬──────┘                 │
                           │                        │
              ┌────────────┴────────────┐          │
              │                         │          │
       [response ready]           [error]          │
              │                         │          │
              ▼                         ▼          │
       ┌─────────────┐          ┌─────────────┐    │
       │  SPEAKING   │          │  CONFUSED   │    │
       └──────┬──────┘          └──────┬──────┘    │
              │                        │           │
       [speech ends]             [timeout]         │
              │                        │           │
              ▼                        │           │
       ┌─────────────┐                 │           │
       │   HAPPY     │─────────────────┴───────────┘
       └─────────────┘
            [timeout → idle]
```

### Animation Timing
- **Idle**: Gentle 3-second breathing loop
- **Listening → Thinking**: 200ms transition
- **Thinking dots**: 400ms per dot
- **Speaking bounce**: Synced to audio amplitude
- **Happy celebration**: 1.5s then fade to idle
- **Confused**: 2s then return to idle

### Micro-animations (always running)
- Subtle floating/hovering
- Occasional blink (every 3-5 seconds)
- Antenna gentle sway
- Screen subtle glow pulse

## Personality Guidelines

### Voice/Tone (for TTS)
- Warm, friendly
- Slightly higher pitch (cute but not annoying)
- Medium pace
- Web Speech API voice: `en-US` with pitch 1.1, rate 0.95

### Communication Style
- Concise but warm
- Uses simple language
- Celebrates small wins
- Gentle with errors ("Hmm, that didn't work. Let me try something else.")
- Never condescending

### Sample Phrases
- **Greeting**: "Hey! What are we building today?"
- **Listening**: (no speech, just visual)
- **Thinking**: (no speech, just visual)
- **Success**: "Done! That worked perfectly."
- **Error**: "Hmm, I hit a snag. Let me figure this out."
- **Confused**: "I'm not sure I understood. Could you say that differently?"

## File Deliverables Needed

1. `robot.riv` - Main Rive file with all states
2. `robot-preview.png` - Static preview image
3. `robot-thumbnail.png` - Small icon version
4. Color/style tokens for consistent UI

## Inspiration References

- Wall-E (Pixar) - expressive with minimal features
- Cozmo robot - cute desk companion vibe
- Tamagotchi - small, simple, endearing
- Figma's "Figbuddy" concept
- Notion's simple illustrations
- Duolingo owl - friendly mascot energy (but less intense)
