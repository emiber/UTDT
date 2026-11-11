# GitHub Copilot Instructions

Guidance for GitHub Copilot in this project.

The full workflow lives in `workflow/`. Copilot **does** support slash commands —
in VS Code via *prompt files* (`.github/prompts/*.prompt.md`, invoked as `/name`),
and the Copilot CLI ships built-in ones (`/model`, `/context`, ...) plus a plan
mode, custom agents, and skills. What this starter does *not* ship is Copilot
prompt files for its own commands: `/init-project`, `/create-issue`,
`/refine-issue`, `/work-issue`, `/finish-epic`, and `/review-pr` have their
steps in `.agents/skills/<name>/SKILL.md` (the playbooks shared by Codex and
the Claude Code commands under `.claude/commands/`).

So with Copilot you have two options:

- **Natural language** (works everywhere): ask "refine issue 42" or "work on
  issue 42" and follow the matching `.agents/skills/<name>/SKILL.md` playbook
  and the `workflow/` file it points to.
- **Add prompt files** (optional): create `.github/prompts/refine-issue.prompt.md`
  and friends that point to the same playbooks, to get real `/refine-issue`
  slash commands in VS Code.

Read, in order:

1. `workflow/rules.md` — the canonical hard rules (merge, commits, the GitHub remote, secrets, language).
2. `workflow/principles.md` — the principles that govern every decision. The main one: do the minimum that solves the problem; don't over-engineer.
3. `workflow/scaffolding.md` — how to define the architecture and stack of a new project.
4. `workflow/issue-creation.md` — how to create a new issue file under `issues/`.
5. `workflow/issue-refinement.md` — how to refine an issue before implementing it.
6. `workflow/git-flow.md` — the git flow contract: `main → branch → implementation → local PR`.
7. `workflow/epics.md` — epics: parent/child issues and integration branches, plus the `/finish-epic` contract.
8. `workflow/pr-review.md` — the read-only review contract for a local PR: linked-issue ACs + Definition of Done.
9. `workflow/model-strategy.md` — which model to use in each phase (Claude Code specific; ignore if it doesn't apply).
10. `workflow/issue-tracker.md` — local Markdown issues under `issues/`: file format, operations, and local PRs.

## Hard rules

The canonical list is in `workflow/rules.md` (read it). The essential safety rules, inline so they're never missed:

- Never commit work directly to `main`. Only issue files under `issues/` are committed there, by `/create-issue` and `/refine-issue`. Everything else goes on a branch, which you merge into its base (`git merge --no-ff`) once the quality gate is green and the self-review has no open blockers.
- Commits and merges are automatic: the user authorized them for this local POC, so don't ask first. Never merge with a failing gate, and never use `--no-verify`.
- Local workflow, GitHub only to share: the repo has a GitHub remote (`origin`), but issues, PRs and merges stay local. Push only when the user asks; never add another remote or publish anything else to an external service unless the user asks.
- Never commit secrets or credentials. Keep them in gitignored `.env` files; provide a `.env.example` with placeholder values.
- Plan before non-trivial work, and ask when something is ambiguous — don't invent requirements.
- Language: issues, their PR sections, and commit messages in Spanish; code and docs in English (details in `workflow/rules.md`, rule 8). Reply in the language the user writes in.
