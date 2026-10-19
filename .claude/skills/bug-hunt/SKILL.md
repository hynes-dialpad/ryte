---
name: "bug-hunt"
description: "Diagnose and fix Ryte defects through reproduction, execution-path tracing, privacy-safe diagnostics, and focused validation. Use for crashes, stale UI, indexing, search, watcher, native-module, or async failures."
---

# Ryte bug-hunt

$ARGUMENTS

This is Ryte's Claude adapter. The canonical workflow is local to this repository.

1. Load `.agents/skills/bug-hunt/SKILL.md` and follow it exactly.
2. Preserve the canonical workflow's privacy, Electron-boundary, approval, and validation rules.
3. Keep this adapter limited to discovery; do not add independent policy here.
