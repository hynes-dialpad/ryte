# Changelog

All notable Ryte changes should be recorded here before a tagged release.

Ryte uses SemVer while it is pre-1.0. The app version in `app/package.json` is the source of truth for packaged builds, Git tags, and future DMG filenames.

## Unreleased

Target release: `v0.3.0`

### Highlights

- Adds explicit Auto, Keyword, and Hybrid local retrieval modes.
- Keeps keyword retrieval available without embeddings, API keys, or network access.
- Adds clickable local search results with source previews and retrieval metadata.
- Adds a local-only answer mode that skips provider settings and secret reads.
- Adds index transparency with last-indexed state and a clear-and-rebuild recovery control.
- Keeps source previews out of persisted search history.
- Carries forward Phase 1 privacy controls for semantic indexing, cloud answers, provider keys, IPC validation, and rendered markdown safety.

### Validation

- `pnpm validate`
- `pnpm smoke:indexer`

## Versioning Policy

- `0.1.x` is reserved for Phase 0 foundation fixes.
- `0.2.x` is reserved for the first Phase 1 security and privacy UX milestone.
- `0.3.x` is reserved for the first Phase 2 local-first search milestone.
- Git tags use a leading `v`, for example `v0.1.0`.
- macOS build numbers should be monotonically increasing integers once packaged distribution starts.
