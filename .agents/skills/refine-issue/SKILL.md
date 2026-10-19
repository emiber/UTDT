---
name: refine-issue
description: Refine and clarify a local issue (issues/<n>-*.md) by asking every question needed until it's implementable. Use when asked to refine or clarify an issue before implementing it.
---

# refine-issue

Refine the target issue (its number — provided as the argument, or stated by the user). This is the canonical playbook: Codex runs it directly and the Claude Code `/refine-issue` command delegates to it. The detailed rules live in `workflow/`.

1. Read `workflow/rules.md`, `workflow/principles.md`, `workflow/issue-refinement.md`, and `workflow/issue-tracker.md`.
2. Check that `.workflow-config` has `issue_tracker=local`: issues are Markdown files under `issues/` (format and operations in `workflow/issue-tracker.md`).
3. Read the issue file `issues/<n>-*.md`. If it doesn't exist, offer to create it with the create-issue skill.
4. List its ambiguities: goal, scope, behavior, data, dependencies, acceptance criteria, non-functional.
5. Ask the user the questions needed to close them, in small groups. Don't proceed on unconfirmed assumptions. If the user delegates a decision, propose and confirm a concrete choice, record it under **Assumptions**, and reflect its effects in every applicable issue section.
6. Rewrite the issue body following `docs/ISSUE_TEMPLATE.md` (keep its `## Notes`), set `status: refined`, and commit only that file (`chore(issues): refine #<n> <title>`) on `main`. Invoking this skill authorizes that one commit.
7. Confirm the result and suggest running the work-issue skill.

Don't inflate scope. If the issue is trivial, say so and confirm in one sentence instead of running the full ritual.
