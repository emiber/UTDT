---
name: refine-issue
description: Refines and clarifies a local issue file (issues/) by asking all the necessary questions until it's implementable.
---

# /refine-issue

First read `.agents/skills/refine-issue/SKILL.md`, then follow it step by step — it's the single source for this command's steps, shared with Codex. The target issue is $ARGUMENTS (its issue number).

Claude Code specifics:
- This is the analysis phase → use the planning model (Opus); see `workflow/model-strategy.md`. If you're not on `opusplan`, switch with `/model opus`.
- Where the playbook says "the <name> skill", that's the `/<name>` command here.
