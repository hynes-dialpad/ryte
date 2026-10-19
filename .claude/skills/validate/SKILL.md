---
name: "validate"
description: "Validate Ryte work safely. Use when the user invokes $validate or asks to run validation, smoke tests, pre-PR checks, readiness checks, branch guards, or synthetic indexer smoke for Ryte."
---

# Ryte validate

$ARGUMENTS

This is Ryte's Claude adapter. The canonical workflow is local to this repository.

1. Load `.agents/skills/validate/SKILL.md` and follow it exactly.
2. Preserve the canonical workflow's privacy, Electron-boundary, approval, and validation rules.
3. Keep this adapter limited to discovery; do not add independent policy here.
