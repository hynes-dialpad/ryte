# Branch Workflow

Ryte uses a lightweight PR workflow even for personal development. The goal is to keep local-first privacy and validation checks visible before code lands on `main`.

## Default Flow

1. Start from `main`.
2. Create a feature branch before editing project files.
3. Keep commits focused by concern.
4. Run validation from `app/`.
5. Push the branch and open a PR against `main`.
6. Use the PR template to record validation, privacy impact, and manual smoke.
7. Merge only after CI and any required manual checks are recorded.

## Required Local Checks

```bash
cd app
pnpm guard:branch
pnpm validate
pnpm smoke:indexer
```

`pnpm smoke:indexer` uses synthetic notes and should not touch a real notes folder by default.

## Branch Rules

- Do not edit or commit project files on `main` or `master`.
- Do not commit real note content, API keys, `.env` files, local SQLite databases, build output, or dependency folders.
- Keep local keyword search working without provider keys.
- Record manual app smoke results when UI, search, settings, indexing, provider, or restart behavior changes.

## Phase 0 PR Scope

The Phase 0 foundation PR should stay as one PR unless the GitHub diff becomes too hard to review. The commit history is already structured by concern, so review can happen commit-by-commit inside one branch.
