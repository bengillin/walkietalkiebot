# Changelog

All notable changes to Walkie Talkie Bot are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Claude Code **session resumption** for conversations: turns now run inside a
  persistent session (`--session-id` to create, `--resume` to continue) instead of
  rebuilding and re-sending history every turn. Cuts repeated-context cost/latency
  on multi-turn conversations and lets Claude Code cache the conversation prefix.
  Transparent fallback handles expired/orphaned sessions; jobs and one-shot calls
  are unchanged. Covered by new tests.
- ESLint 9 flat config (`eslint.config.js`) and Prettier, with `lint`, `format`,
  `format:check`, and `typecheck` npm scripts.
- GitHub Actions CI (`.github/workflows/ci.yml`) running typecheck, lint, tests, and build.
- `CHANGELOG.md` and `CONTRIBUTING.md`.
- Test coverage for the four least-covered modules: `useClaudeChat` (32 tests),
  `useVoiceIO` (29), the job runner's stdout stream parsing (28), and the job
  manager (29). Suite goes from 181 to 299 unit tests.
- Leveled loggers for the client (`src/lib/logger.ts`) and server
  (`server/logger.ts`), replacing 77 scattered `console.*` calls with scoped,
  filterable output. Client level comes from `localStorage['wtb:logLevel']`
  (default: debug in dev, warn in prod) and can be changed at runtime with
  `wtbLogLevel('debug')`; server level comes from `WTB_LOG_LEVEL` (default
  info). Adds the missing `src/vite-env.d.ts`.
- `noUncheckedIndexedAccess` across all three TypeScript projects, plus
  `tsconfig.server.json` and a `typecheck:server` script so the server is
  type-checked at all — the root config only included `src`, so until now a
  type error anywhere under `server/` passed both `npm run typecheck` and
  `npm run build`.
- `typecheck:mcp` script (`tsc -p mcp-server/tsconfig.json --noEmit`), now part of
  `npm run typecheck` and therefore gated in CI. The MCP server is bundled with
  esbuild, which skips type checking, so it could previously drift unnoticed.
- Optional shared-secret API auth via the `WTB_AUTH_TOKEN` environment variable;
  when set, all `/api/*` requests require an `Authorization: Bearer <token>` header.
- Request body size limit on the HTTP server to prevent memory-exhaustion DoS.
- README and site: a Configuration table (`WTB_PORT`, `WTB_HOST`, `WTB_DIR`,
  `WTB_AUTH_TOKEN`, `WTB_LOG_LEVEL`, `WTB_TELEMETRY`, `WTB_MAX_BODY_BYTES`),
  a rewritten Security section, and a Telemetry disclosure.
- `LICENSE` file (MIT); `package.json` already declared the license.

### Changed

- Hardened Claude CLI discovery to use `execFile` instead of `execSync` string
  interpolation, removing a shell-injection vector via `CLAUDE_PATH`.
- Enabled `noImplicitReturns` in `tsconfig.json` and made conditional `useEffect`
  cleanups explicit.

### Fixed

- A failed search rendered "No results found" — identical to a genuine empty
  result — so a search outage looked like an answer. It now reports the failure
  distinctly, and clears once a later search succeeds.
- A full localStorage quota silently stopped caching conversations. It now logs
  a warning; the server remains the source of truth, so nothing is lost.
- Full-text search failing over to local title matching, a job with unreadable
  history running without context, and unreadable custom mode files all now log
  instead of vanishing.
- Two latent crash paths caught by the new strictness flag: the draggable FAB
  read `e.touches[0].clientX` in four handlers, which throws on
  touchend/touchcancel where `touches` is empty; and TapeDeck read
  `entry.borderBoxSize[0].blockSize`, which not every engine populates.
- `getTapeColor()` returned undefined for a negative index, since `%` keeps the
  sign; it now falls back to the first colour.
- `UpdateJobInput.result` was typed `string | undefined` while the job manager
  passed `null` to clear it. Widened to `string | null`, which is what the
  repository already handled.
- Server tests ran against compiled `.js` build artifacts instead of the `.ts`
  sources. `npm run build` writes the compiled output next to each source file,
  and both extensionless imports and explicit `.js` specifiers resolved to it —
  so editing a `.ts` and running `npm test` without rebuilding reported green
  against code that no longer existed. `vitest.config.server.ts` now forces
  resolution to source.
- MCP server reported a stale version (`0.3.1`) to clients in its `initialize`
  response, because `scripts/sync-version.js` synced `mcp-server/package.json`
  but not the hardcoded literal in `mcp-server/index.ts`. Bumped to `0.3.8` and
  added the file to the sync script.
- MCP server type error: `ToolResult` declared `content[].type` as `string`, which
  no longer satisfied the `tools/call` handler signature after the SDK added a
  `task` result variant. It now aliases the SDK's own `CallToolResult`, so the
  shape tracks the SDK instead of drifting from it.
- Documentation drift: corrected the test count (181 unit tests across 15 files),
  the custom-hook count (8), and removed stale references to the long-removed
  Direct API mode and Telegram integration.
- Docs and marketing site brought in line with the code:
  - **MCP install command** (README, site hero, getting-started, integrations,
    `llms.txt`) said `npx wtb-mcp`. `wtb-mcp` on npm is an unrelated third-party
    package, so that command downloaded and ran someone else's code. It is now
    `claude mcp add --scope user wtb -- npx -y -p walkietalkiebot wtb-mcp` (or
    `"args": ["-y", "-p", "walkietalkiebot", "wtb-mcp"]` in `.mcp.json`), and the
    README no longer points at `~/.claude/settings.json`, where Claude Code does
    not read user MCP servers.
  - Removed the Telegram bot and Direct API / `ANTHROPIC_API_KEY` content that
    the site still advertised (homepage, integrations page, docs hub,
    `llms.txt`, API reference).
  - Getting started: Node 20+ (was 18+), Claude Code CLI listed as a
    requirement, onboarding is 6 steps (there is no "choose your mode" step),
    and the server should be started from the project Claude should work on.
  - API reference: removed the nonexistent `/api/analyze-image`, fixed the
    `/api/claude-code` and `/api/jobs` request bodies (`message`,
    `conversationId`), renamed `/api/jobs/:id/stream` to the real
    `/api/jobs/:id/events`, added `/api/jobs/orchestrate`, and replaced the
    "one-shot processes" note with the session-resumption behavior.
  - Integrations: job tool names (`*_wtb_job`, not `*_talkie_job`), TLS cert
    paths (`tailscale.crt` / `tailscale.key`, not `cert.pem` / `key.pem`).
  - README test count (322 across 22 files).
  - Docs pages no longer scroll sideways on phones (themes, integrations, and
    API pages overflowed a 390px viewport by up to 294px).

### Removed

- Stale planning docs `INTERFACE_PLAN.md` and `LAYOUT_SKETCH.md`; everything
  they proposed has shipped.

### Security

- The server binds to `127.0.0.1` by default. `WTB_HOST` binds elsewhere, and a
  non-loopback host is refused unless `WTB_AUTH_TOKEN` is set.
- Cross-origin API requests are rejected (no wildcard CORS) and the `Host`
  header is validated, so a web page can no longer drive a local server that
  runs Claude Code with `bypassPermissions`.
- MCP telemetry is opt-in (`WTB_TELEMETRY=1`) instead of opt-out. When enabled
  it sends only the tool name, category, and success flag to PostHog.
- The documented MCP install command no longer runs an unrelated npm package
  (see Fixed).

## [0.3.8]

### Added

- Configurable modes system: 5 built-in modes (Voice, Pair, Architect, Code Review,
  Debug) plus custom modes loaded from `~/.wtb/modes/*.json`.
- Parallel job orchestration — up to 3 concurrent background jobs via
  `POST /api/jobs/orchestrate`, each streaming independently over SSE.
- Project/parent conversation grouping, conversation import, and enriched export.
- Playwright E2E tests and per-theme visual regression snapshots.
- Client tests for `ModeSelector` and export/import.

### Changed

- All Claude communication now flows exclusively through the Claude Code CLI
  (`claude -p`); Direct API mode was removed.
- Plans are now linked to conversations.

### Removed

- Direct API (Anthropic API) mode.
- Telegram bot integration.

### Fixed

- IPC race conditions; state is now hydrated from SQLite on server restart.

[Unreleased]: https://github.com/bengillin/walkietalkiebot/compare/v0.3.8...HEAD
[0.3.8]: https://github.com/bengillin/walkietalkiebot/releases/tag/v0.3.8
