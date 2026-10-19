# AGENTS.md

Guidance for code agents (Codex and compatible) in this project.

The full workflow lives in `workflow/`. Read, in order:

1. `workflow/rules.md` — the canonical hard rules (merge, commits, local-only, secrets, language).
2. `workflow/principles.md` — principles that govern every decision. The main one: do the minimum that solves the problem; don't over-engineer.
3. `workflow/scaffolding.md` — how to define the architecture and stack of a new project.
4. `workflow/issue-creation.md` — how to create a new issue file under `issues/`.
5. `workflow/issue-refinement.md` — how to refine an issue before implementing it.
6. `workflow/git-flow.md` — the git flow contract: `main → branch → implementation → local PR`.
7. `workflow/epics.md` — epics: parent/child issues and integration branches, plus the `/finish-epic` contract.
8. `workflow/pr-review.md` — the read-only review contract for a local PR: linked-issue ACs + Definition of Done.
9. `workflow/model-strategy.md` — which model to use in each phase (planning vs implementation).
10. `workflow/issue-tracker.md` — local Markdown issues under `issues/`: file format, operations, and local PRs.

## Hard rules

The canonical list is in `workflow/rules.md`. The essential safety rules, inline so they're never missed:

- Never merge into `main` or commit to it directly — only issue files under `issues/` are committed there, by the `create-issue` and `refine-issue` skills. The flow ends with a local PR: a branch left unmerged for human review.
- Never `git commit` unless the user explicitly asks (running the create-issue, refine-issue, work-issue, or finish-epic flow counts as asking for the commits that flow declares). Don't commit on your own initiative.
- Local-only: this project has no remote. Never add one, push, or publish anything to an external service unless the user asks.
- Never commit secrets or credentials. Keep them in gitignored `.env` files; provide a `.env.example` with placeholder values.
- Plan before non-trivial work, and ask when something is ambiguous — don't invent requirements.
- Language: write all artifacts (code, comments, commits, branches, issues, PRs, docs) in English unless the user asks otherwise; reply in the language the user writes in.

Above all, follow `workflow/principles.md`: do the minimum that solves the problem; don't over-engineer.

> Note: the Codex CLI supports built-in slash commands. Reusable custom workflows are **skills**, stored in `.agents/skills/<name>/SKILL.md` in a repository or `$HOME/.agents/skills/<name>/SKILL.md` for one user. Select a skill with `/skills` or invoke it as `$skill-name`; a skill does not create a custom `/skill-name` command. This starter ships Codex skills under `.agents/skills/` (`init-project`, `create-issue`, `refine-issue`, `work-issue`, `finish-epic`, `review-pr`). They are the canonical playbooks — the Claude Code commands are thin wrappers over them — and they point to the same `workflow/` guides, so Codex discovers them automatically. Or just ask in natural language ("refine issue 42") and follow the matching skill or `workflow/` file. Where a playbook asks for a separate agent (the `/work-issue` self-review) and you can't start one, run that step yourself and say so.
