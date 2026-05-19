# ryte

Local macOS app for searching and browsing a user-selected markdown folder — a personal knowledge base over your own files.

## What it does

- **Indexes** your notes corpus into a local SQLite database with keyword search by default
- **Optionally adds semantic search** using OpenAI embeddings when enabled in Settings
- **Optionally generates answers** using a configured OpenAI or Anthropic model
- **Browses** your notes in a file tree sidebar with clean markdown rendering and syntax-highlighted code blocks
- **Watches** for file changes and re-renders live

## Requirements

- macOS
- Node.js 22.x
- pnpm 10.12+
- API keys are optional. Local keyword search works without network access.

## Getting started

```bash
cd app
corepack enable
pnpm install
nvm use 22.14.0
pnpm dev
```

On first launch, a Settings modal opens. Choose a notes root (`~/Documents/Ryte` by default) and optionally enter API keys for semantic search and generated answers. ryte will index your corpus and show the file tree once complete.

Search history is stored locally in the renderer process using `localStorage` and can be cleared from the search overlay. Provider keys are encrypted through Electron `safeStorage` before they are written to app settings.

## Stack

- **Electron 41.6.1** — main process owns all file I/O, native modules, IPC
- **Vue 3 + Pinia** — renderer UI and state
- **better-sqlite3 + sqlite-vec** — local vector index
- **markdown-it + shiki** — markdown rendering with syntax highlighting (JS regex engine, no WASM)
- **chokidar** — file watching for live re-render and incremental re-indexing
- **OpenAI** — `text-embedding-3-small` for embeddings
- **Anthropic** — optional generated answers

## Development

```bash
cd app
nvm use 22.14.0
pnpm check:node
pnpm validate      # full local validation: node, lint, typecheck, test, build
pnpm dev          # start with hot-reload
pnpm test         # unit tests (vitest)
pnpm typecheck    # tsc + vue-tsc
pnpm lint         # eslint
pnpm build        # production build
pnpm smoke:indexer # safe native SQLite/indexer smoke using synthetic notes
```

Branch and PR expectations are documented in [docs/branch-workflow.md](docs/branch-workflow.md). Phase 0 manual app smoke is tracked in [docs/phase-0-manual-smoke.md](docs/phase-0-manual-smoke.md).

Runtime/tooling versions:

- Node.js: `.node-version` pins major version `22`; current validated local version is `v22.14.0`.
- pnpm: `app/package.json` pins `pnpm@10.12.1`.
- Electron: `41.6.1`.

## Versioning

`app/package.json` is the source of truth for the app version. Phase 0 uses pre-1.0 SemVer: `0.1.x` for foundation fixes, `0.2.0` for the first security/privacy UX milestone, and `0.3.0` for the first local-first search milestone.

Tagged releases should use the `v` prefix, for example `v0.1.0`. Future DMG names and macOS bundle versions should derive from the package version plus a monotonically increasing build number.

## Architecture

All storage and native modules live in the **main process**. The renderer communicates exclusively via typed IPC channels (`window.ryte.*`) exposed through a contextBridge preload. Secrets are encrypted via macOS Keychain (`safeStorage`); plaintext keys never touch disk.

Development planning docs may be kept in dated notes folders when requested.
