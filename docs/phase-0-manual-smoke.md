# Phase 0 Manual Smoke

Use this checklist before merging the Phase 0 foundation PR. Do not paste real note content, API keys, local database paths, or private file excerpts into this document or a PR.

## Environment

- Date:
- Branch:
- App version:
- Node version:
- pnpm version:
- macOS version:

## Required Automated Checks

- [ ] `pnpm guard:branch`
- [ ] `pnpm validate`
- [ ] `pnpm smoke:indexer`

## Manual App Checks

| Check                                                                      | Result  | Notes                                                       |
| -------------------------------------------------------------------------- | ------- | ----------------------------------------------------------- |
| Launch app under Node 22                                                   | Not run |                                                             |
| Existing notes root loads                                                  | Not run | Do not record private path details unless needed.           |
| File tree renders                                                          | Not run |                                                             |
| New markdown file appears without refresh                                  | Not run | Use a temporary synthetic file if possible.                 |
| Deleted or moved markdown file disappears without refresh                  | Not run | Use a temporary synthetic file if possible.                 |
| Local search returns sources for a natural-language query with punctuation | Not run | Summarize behavior only; do not paste source content.       |
| GPT-5.2 cloud answer streams after sources                                 | Not run | Confirm only after cloud answers are intentionally enabled. |
| Provider/model API failure is visible and contextual                       | Not run | Use a safe invalid model/key test if needed.                |
| Search history persists after app restart                                  | Not run |                                                             |
| Clear removes search history                                               | Not run |                                                             |
| Settings Rebuild Index button starts a local reindex                       | Not run |                                                             |
| Settings save triggers reindex without database corruption                 | Not run |                                                             |
| Settings shows app version                                                 | Not run |                                                             |
| Normal actions do not spam Electron macOS menu warnings                    | Not run |                                                             |

## Optional Controlled Recovery Check

Only run this if the tester explicitly chooses to exercise database recovery. Back up the local index database first, use a synthetic or disposable app data directory when practical, and do not commit database files.

| Check                                       | Result  | Notes |
| ------------------------------------------- | ------- | ----- |
| Malformed local index database is recovered | Not run |       |

## Follow-Ups

Record any failures here with a short description and the target follow-up phase or PR.
