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
- `typecheck:mcp` script (`tsc -p mcp-server/tsconfig.json --noEmit`), now part of
  `npm run typecheck` and therefore gated in CI. The MCP server is bundled with
  esbuild, which skips type checking, so it could previously drift unnoticed.
- Optional shared-secret API auth via the `WTB_AUTH_TOKEN` environment variable;
  when set, all `/api/*` requests require an `Authorization: Bearer <token>` header.
- Request body size limit on the HTTP server to prevent memory-exhaustion DoS.

### Changed

- Hardened Claude CLI discovery to use `execFile` instead of `execSync` string
  interpolation, removing a shell-injection vector via `CLAUDE_PATH`.
- Enabled `noImplicitReturns` in `tsconfig.json` and made conditional `useEffect`
  cleanups explicit.

### Fixed

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
