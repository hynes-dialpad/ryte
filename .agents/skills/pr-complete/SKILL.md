---
name: pr-complete
description: Complete merged Ryte PRs and reset for the next effort. Use when the user invokes $pr-complete or says a Ryte PR merged, asks to get back to main, prune/delete branches, sync local main, close out a branch, or prepare for the next phase.
---

# Ryte PR Complete

Use this skill after a Ryte PR has merged.

## Shared Contract

- Do not edit repo files on `main` or `master`.
- Do not delete local work unless it is the merged PR branch or the user explicitly asks.
- Update today's session note and any active plan/PR artifact with merge status, cleanup, release/tag decision, and next recommended effort.
- Treat release tags as an explicit decision; do not tag automatically unless requested.

## Workflow

1. **Verify Merge**
   - Confirm the PR is merged through the user's statement, GitHub connector, or `gh` if authenticated.
   - Record PR number/URL if known.

2. **Require Clean Worktree**
   - Run `git status -sb`.
   - If dirty, stop and report the files unless the changes are known generated artifacts from validation that should be ignored.

3. **Sync Main**
   - Switch to `main`.
   - Pull latest with `git pull --ff-only`.
   - If `.git` operations hit sandbox permission errors, rerun with escalation.

4. **Prune Branches**
   - Prune deleted remote branches.
   - Delete the merged local branch when safe.
   - If branch deletion warns about squash/merge ancestry but the PR is confirmed merged, explain the condition before force deletion.

5. **Record Closeout**
   - Update today's session note with synced commit, deleted branch, validation status if checked, and recommended next effort.
   - Ask or recommend whether a tag/release decision is needed when the merged work is user-facing or release-worthy.

## Output Shape

```markdown
PR complete.

- Synced `main` to `<sha>`.
- Deleted local branch `<branch>`.
- Working tree clean.

Next recommended effort: ...
```
