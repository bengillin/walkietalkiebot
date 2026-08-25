# Contributing to Walkie Talkie Bot

Thanks for your interest in improving Walkie Talkie Bot! This guide covers how to
get set up, the quality bar for changes, and a few project-specific gotchas.

## Getting started

```bash
git clone https://github.com/bengillin/walkietalkiebot
cd walkietalkiebot
npm install
npm run dev        # Vite dev server (frontend + in-process API)
```

The dev server runs the frontend with an embedded API (see `vite.config.ts`). For
the full experience (built frontend served by the real server), run `npm run build`
then `wtb-server start -f`.

> Voice features require Chrome or Edge (Web Speech API).

## Before you open a PR

Run the full local gate — CI runs the same checks and will block on any failure:

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # ESLint (must be error-free; warnings are tolerated)
npm run format:check # Prettier
npm test             # client + server unit tests (~170 across 13 files)
```

`npm run format` will auto-fix formatting. Most lint issues are auto-fixable with
`npx eslint . --fix`.

For UI-affecting changes, also run the end-to-end and visual suites:

```bash
npm run test:e2e
npm run test:visual           # compares against committed snapshots
npm run test:visual:update    # re-baseline after an intentional visual change
```

## Project conventions

- **TypeScript throughout**, including the MCP server. No `.js` source in `src/`,
  `server/`, or `mcp-server/`.
- **Generated files are not edited by hand.** `server/**/*.js` and
  `mcp-server/dist/` are compiled from TypeScript by `npm run build:server`. Edit
  the `.ts` sources and rebuild.
- **Tests live next to code** as `*.test.ts(x)`. Server tests use in-memory SQLite
  via `initDbForTesting()` (`server/test/helpers.ts`); API tests use Hono's
  `app.request()`.
- **Theming**: every new UI element must be styled in all six theme files under
  `src/styles/themes/`. Themes are applied via the `data-theme` attribute.
- **Tool identity** (icons, labels, categories) is centralized in
  `src/lib/toolConfig.ts` — register new tools there rather than inline.
- New prompt/context assembly logic belongs in the pure `server/promptBuilder.ts`
  so it can be unit-tested in isolation.

## Security note

The server runs Claude Code with `--permission-mode bypassPermissions`, so it can
execute arbitrary commands on the host. Treat any change to the API surface, the
job runner, or the IPC flow as security-sensitive, and never weaken the
`WTB_AUTH_TOKEN` check or expose new unauthenticated endpoints. See the
"Security & Networking" section of the README.

## Commit & PR style

- Keep commits focused; write imperative subject lines ("Add X", "Fix Y").
- Update `CHANGELOG.md` under `## [Unreleased]` for user-facing changes.
- Update `ROADMAP.md`, `README.md`, and `CLAUDE.md` when behavior or architecture
  changes — keeping docs in sync is part of the change, not a follow-up.
