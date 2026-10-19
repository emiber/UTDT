---
name: finish-epic
description: Prepares the integration PR (epic branch → main, left unmerged for review) when an epic's children are done. Reads workflow/epics.md.
---

# /finish-epic

First read `.agents/skills/finish-epic/SKILL.md`, then follow it step by step — it's the single source for this command's steps, shared with Codex. The target epic is $ARGUMENTS (its issue number).

Claude Code specifics:
- This wraps up implementation → the execution model (Sonnet) is fine; see `workflow/model-strategy.md`.
- Where the playbook says "the <name> skill", that's the `/<name>` command here.
