# Changelog

All notable Ryte changes should be recorded here before a tagged release.

Ryte uses SemVer while it is pre-1.0. The app version in `app/package.json` is the source of truth for packaged builds, Git tags, and future DMG filenames.

## Unreleased

Target baseline: `v0.1.0`

### Highlights

- Establishes the Phase 0 local-first foundation branch.
- Keeps keyword search available without provider API keys.
- Adds privacy controls for semantic indexing and cloud answers.
- Adds local validation, native indexing smoke coverage, and project guardrails.

### Validation

- `pnpm validate`
- `pnpm smoke:indexer`

## Versioning Policy

- `0.1.x` is reserved for Phase 0 foundation fixes.
- `0.2.0` starts the first Phase 1 security and privacy UX milestone.
- `0.3.0` starts the first Phase 2 local-first search milestone.
- Git tags use a leading `v`, for example `v0.1.0`.
- macOS build numbers should be monotonically increasing integers once packaged distribution starts.
