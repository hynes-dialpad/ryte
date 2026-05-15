# ryte

Local macOS app for searching and browsing `~/notes/` — a personal knowledge base over your own markdown files.

## What it does

- **Indexes** your notes corpus using OpenAI embeddings into a local SQLite + sqlite-vec database
- **Browses** your notes in a file tree sidebar with clean markdown rendering and syntax-highlighted code blocks
- **Watches** for file changes and re-renders live

## Requirements

- macOS
- Node.js 22+
- pnpm
- OpenAI API key

## Getting started

```bash
cd app
pnpm install
pnpm dev
```

On first launch, a Settings modal opens. Enter your API keys and notes root (`~/notes/` by default). ryte will index your corpus and show the file tree once complete.

## Stack

- **Electron 39** — main process owns all file I/O, native modules, IPC
- **Vue 3 + Pinia** — renderer UI and state
- **better-sqlite3 + sqlite-vec** — local vector index
- **markdown-it + shiki** — markdown rendering with syntax highlighting (JS regex engine, no WASM)
- **chokidar** — file watching for live re-render and incremental re-indexing
- **OpenAI** — `text-embedding-3-small` for embeddings

## Development

```bash
cd app
pnpm dev          # start with hot-reload
pnpm test         # unit tests (vitest)
pnpm typecheck    # tsc + vue-tsc
pnpm lint         # eslint
pnpm build        # production build
```

## Architecture

All storage and native modules live in the **main process**. The renderer communicates exclusively via typed IPC channels (`window.ryte.*`) exposed through a contextBridge preload. Secrets are encrypted via macOS Keychain (`safeStorage`); plaintext keys never touch disk.

Plans live in `~/notes/sessions/YYYY-MM-DD/plans/`.
