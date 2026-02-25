# iMessage / Apple Theme Plan

## Design Language
Follow Apple's Human Interface Guidelines: clean, minimal, lots of whitespace, SF-style typography, light mode with subtle grays, signature iMessage blue (#007AFF) for user bubbles, light gray (#E9E9EB) for assistant bubbles, no heavy borders or shadows — just depth through background layering and subtle separators.

## Color Palette

### Core Colors (Apple System Colors)
- **Blue (primary accent):** `#007AFF` — iMessage blue, links, active states
- **Green (secondary accent):** `#34C759` — success, active indicators
- **Red:** `#FF3B30` — errors, destructive actions, recording
- **Orange:** `#FF9500` — warnings
- **Purple:** `#AF52DE` — thinking/processing states
- **Gray system:** `#F2F2F7` (bg), `#E5E5EA` (secondary bg), `#D1D1D6` (tertiary), `#C7C7CC` (separator)

### Backgrounds
- `--bg-primary`: `#FFFFFF` (pure white, main content)
- `--bg-secondary`: `#F2F2F7` (system grouped background)
- `--bg-tertiary`: `#E5E5EA` (inset/recessed areas)

### Text
- `--text-primary`: `#000000` (label)
- `--text-secondary`: `#3C3C43` with 60% opacity (secondary label)
- `--text-muted`: `#3C3C43` with 30% opacity (tertiary label)

### Messages (iMessage signature look)
- User bubble: `#007AFF` bg, white text, `border-radius: 18px`
- Assistant bubble: `#E9E9EB` bg, black text, `border-radius: 18px`
- Tail/arrow on bubbles (stretch goal)

## Typography
- **Font family:** `-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif`
- **Font weights:** 400 (regular), 500 (medium), 600 (semibold), 700 (bold)
- No uppercase transforms, no italic titles — clean and readable
- `letter-spacing: -0.01em` (Apple's slightly tight tracking)

## Component Overrides (277 selectors to match McCallister pattern)

### Phase 1: CSS Variables (~30 min)
Override all root variables with Apple colors, typography, border-radius, shadows.

### Phase 2: Header & Navigation
- Clean white/frosted glass header with `backdrop-filter: blur(20px) saturate(180%)`
- Thin 0.5px separator line (Apple's signature hairline border)
- SF-style title: medium weight, centered, no transforms
- Buttons: text-only or SF Symbol style (no chunky borders)

### Phase 3: Chat / Messages
- iMessage-style bubbles: 18px border-radius, no border, colored backgrounds
- User messages right-aligned, blue background, white text
- Assistant messages left-aligned, light gray background, black text
- Timestamp in small gray text between message groups
- Typing indicator: three bouncing dots in a gray bubble

### Phase 4: Input Bar
- iOS-style input: rounded rect (`border-radius: 20px`), light gray bg, thin border
- Send button: blue circle with white arrow icon
- Sits at bottom with subtle top separator

### Phase 5: Settings / Drawers
- iOS Settings-style grouped lists: rounded white cards on gray background
- Toggle switches styled like iOS (green active, gray inactive)
- Section headers in small uppercase gray text
- Chevron disclosure indicators

### Phase 6: Sidebar / Tape Collection
- Clean list view — no tape/cassette aesthetic
- White cards with subtle shadow (`0 1px 3px rgba(0,0,0,0.1)`)
- Blue accent for selected/active conversation
- Swipe-to-delete style (stretch goal)

### Phase 7: Robot Avatar
- Cleaner, more Apple-like: white body, very subtle shadow
- Screen states use Apple system colors (blue idle, green happy, red error)

### Phase 8: Modals & Overlays
- iOS-style sheets: rounded top corners (`border-radius: 12px 12px 0 0`)
- Frosted glass backdrop
- Centered action sheets for confirmations

### Phase 9: Special Components
- Search overlay: iOS Spotlight-style with large rounded search field
- Plans panel: clean card layout
- Media library: iOS Photos-style grid
- Keyboard shortcuts: clean table layout

## Implementation Steps

1. **Create** `src/styles/themes/imessage.css` — start with variable overrides
2. **Register** theme in `ThemeContext.tsx` — add `'imessage'` to `ThemeName` union
3. **Import** in `globals.css` — add `@import './themes/imessage.css'`
4. **Build incrementally** — variables first, then component overrides section by section
5. **Add theme switcher** to Settings if one doesn't exist yet
6. **Test** every component in both themes to catch missed hardcoded colors

## Key Apple Design Principles to Follow
- **Clarity**: Content is the focus, chrome is minimal
- **Deference**: UI stays out of the way, fluid motion
- **Depth**: Translucency, layering, subtle shadows for hierarchy
- No gratuitous gradients or textures — flat with depth through shadow and blur
- Generous padding and spacing
- Animations: ease-in-out, 0.3s default, spring-like for interactive elements
