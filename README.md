# ryte

Local macOS app for searching and browsing a user-selected markdown folder — a personal knowledge base over your own files.

## What it does

- **Indexes** your notes corpus into a local SQLite database with keyword search by default
- **Searches locally** in Auto, Keyword, or Hybrid retrieval modes; keyword mode works offline
- **Optionally adds semantic search** using OpenAI embeddings when explicitly enabled in Settings
- **Optionally generates answers** using a configured OpenAI or Anthropic model
- **Browses** your notes in a file tree sidebar with clean markdown rendering and syntax-highlighted code blocks
- **Manages files** from sidebar and tab context menus with copy, inline rename, Finder, path, close, and confirmed Trash actions
- **Watches** for file changes and updates the file tree, viewer, and local index incrementally

## Requirements

- macOS
- Node.js 24.x
- pnpm 10.12+
- API keys are optional. Local keyword search works without network access.

## Getting started

```bash
cd app
nvm use # reads the repository's .nvmrc
pnpm install
pnpm dev
```

On first launch, a Settings modal opens. Choose a notes root (`~/Documents/Ryte` by default) and optionally enter API keys for semantic search and generated answers. ryte will index your corpus and show the file tree once complete.

Search history is stored locally in the renderer process using `localStorage` and can be cleared from the search overlay or Settings. It stores queries only by default. Generated answers and citations are retained only when explicitly enabled, and source previews are not persisted. Provider keys are encrypted through Electron `safeStorage` before they are written to app settings.

## Stack

- **Electron 41.6.1** — main process owns all file I/O, native modules, IPC
- **Vue 3 + Pinia** — renderer UI and state
- **better-sqlite3 + sqlite-vec** — local vector index
- **markdown-it + shiki** — markdown rendering with syntax highlighting (JS regex engine, no WASM)
- **chokidar** — file watching for live re-render and incremental re-indexing
- **OpenAI** — `text-embedding-3-small` for embeddings
- **Anthropic** — optional generated answers

## Development

From the repository root:

```bash
nvm use # switches only this shell to the repository's Node 24
corepack enable # once per Node installation; pnpm versions remain project-scoped
pnpm build:local # production build only
pnpm qa:local    # validate, smoke the indexer, then launch the built app
```

Or run individual commands from `app`:

```bash
cd app
nvm use # reads the repository's .nvmrc
pnpm check:node
pnpm validate      # full local validation: node, lint, typecheck, test, build
pnpm qa:local      # validate, smoke the indexer, then launch the built app
pnpm launch -- --user-data-dir=/tmp/ryte-profile # launch an existing production build with optional Electron flags
pnpm dev          # start with hot-reload
pnpm test         # unit tests (vitest)
pnpm typecheck    # tsc + vue-tsc
pnpm lint         # eslint
pnpm build        # production build
pnpm smoke:indexer # safe native SQLite/indexer smoke using synthetic notes
```

Branch and PR expectations are documented in [docs/branch-workflow.md](docs/branch-workflow.md). Phase 0 manual app smoke is tracked in [docs/phase-0-manual-smoke.md](docs/phase-0-manual-smoke.md).

Runtime/tooling versions:

- Node.js: `.node-version` pins major version `24`; current validated local version is `v24.14.1`.
- pnpm: `app/package.json` pins `pnpm@10.12.1`.
- Electron: `41.6.1`.

### Electron launch troubleshooting

If `pnpm qa:local` reports that Electron exited from `SIGABRT`, the Electron process stopped before Ryte could start. Retry from a regular macOS Terminal session; if it persists after a macOS crash or restart, log out and back in (or restart macOS) before retrying.

## Versioning

`app/package.json` is the source of truth for the app version. Ryte uses pre-1.0 SemVer: `0.1.x` for foundation fixes, `0.2.x` for the first security/privacy UX milestone, and `0.3.x` for the first local-first search milestone.

Tagged releases should use the `v` prefix, for example `v0.1.0`. Future DMG names and macOS bundle versions should derive from the package version plus a monotonically increasing build number.

## Architecture

All storage and native modules live in the **main process**. The renderer communicates exclusively via typed IPC channels (`window.ryte.*`) exposed through a contextBridge preload. Secrets are encrypted via macOS Keychain (`safeStorage`); plaintext keys never touch disk.

Development planning docs may be kept in dated notes folders when requested.
