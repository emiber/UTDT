# Instructions for Claude Code

This project uses a workflow defined in `workflow/`. **Read those files before acting.**

## Rules

The full, canonical hard rules live in **`workflow/rules.md`** — read them first.
The essential safety rules, repeated here so they're never missed:

- Never commit work directly to `main`. Only issue files under `issues/` are committed there, by `/create-issue` and `/refine-issue`. Everything else goes on a branch, which you merge into its base (`git merge --no-ff`) once the quality gate is green and the self-review has no open blockers.
- Commits and merges are automatic: the user authorized them for this local POC, so don't ask first. Never merge with a failing gate, and never use `--no-verify`.
- Local-only: this project has no remote. Never add one, push, or publish anything to an external service unless the user asks.
- Never commit secrets or credentials. Keep them in gitignored `.env` files; provide a `.env.example` with placeholder values.
- Plan before non-trivial work, and ask when something is ambiguous — don't invent requirements.
- Language: issues, their PR sections, and commit messages in Spanish; code and docs in English (details in `workflow/rules.md`, rule 8). Reply in the language the user writes in.

Above all, follow `workflow/principles.md`: do the minimum that solves the problem; don't over-engineer.

## Model strategy

You plan with Opus and implement with Sonnet (see `workflow/model-strategy.md`). The simplest way: start with `claude --model opusplan` or run `/model opusplan`, and Claude Code switches on its own between the planning and execution phases. Don't hardcode versions; use the `opus`/`sonnet` aliases that always point to the latest.

## Available commands

Each command is a thin wrapper: its steps live in the matching playbook, `.agents/skills/<name>/SKILL.md` (shared with Codex).

- `/init-project` — interactive scaffolding of a new project. Reads `workflow/scaffolding.md`.
- `/create-issue <description>` — creates a new issue file under `issues/` from a description; may create it as an epic or nest it under an existing one. Reads `workflow/issue-creation.md`, `workflow/epics.md`, and `workflow/issue-tracker.md`.
- `/refine-issue <n>` — refines and clarifies an issue. Reads `workflow/issue-refinement.md`.
- `/work-issue <n>` — implements a refined issue following the git flow: plan approval, implementation, quality gate, self-review in a fresh subagent, a local PR (the branch, described in the issue file) with a Verification section, follow-ups offered, and the merge into its base. Child issues of an epic target the epic's integration branch. Reads `workflow/git-flow.md`, `workflow/epics.md`, and `workflow/pr-review.md`.
- `/finish-epic <n>` — prepares the integration PR (epic branch → `main`) when an epic's children are done, and merges it. Reads `workflow/epics.md`.
- `/review-pr <n>` — reviews a local PR (the branch of issue `<n>`) against its linked issue(s)' acceptance criteria and the Definition of Done. Read-only: never commits, checks out, or merges. Reads `workflow/pr-review.md`.

Issues are Markdown files under `issues/` (format and operations in `workflow/issue-tracker.md`).

## Reading order at startup

1. `workflow/rules.md`
2. `workflow/principles.md`
3. The invoked command (if any).
4. The specific guide that command references.
