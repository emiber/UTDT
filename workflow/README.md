# AI Workflow Starter — local edition

A base for kicking off projects with AI-assisted development. Optimized for **Claude Code**, with best-effort support for **GitHub Copilot** and **Codex**.

This project runs the workflow **fully locally**: no remote repository, no hosting platform, no CI. Issues are Markdown files in the repo (`issues/`), a "PR" is a local branch that the agent merges once every gate passes, and the quality gate runs on your machine.

> **This file documents the workflow itself.** The project's own README lives at the repo root (`README.md`) and is generated/replaced by `/init-project`. This file is not touched by scaffolding.

It gives you two things:

1. **Interactive scaffolding** — the agent asks what kind of project you're building, defines the components (APIs, frontend, database, queues, etc.), suggests technologies, and generates the base.
2. **Issue → PR workflow** — interactive issue refinement and the `main → branch → implementation → local PR` cycle.

## Getting started

1. **Check the requirements**: `git` (on Windows, Git for Windows, which brings the `bash` the workflow scripts and hook use). Nothing else — no `gh`, no accounts.
2. **Activate the `main` guard** once per clone (it's a local git setting, so it isn't versioned):
   ```bash
   git config core.hooksPath .githooks
   ```
   `.githooks/pre-commit` then rejects commits on `main` that touch anything outside `issues/`. Issue-tracker commits and merge commits pass. That's what makes "never commit to `main`" real instead of just a convention. `/init-project` sets it for you.
3. **Open Claude Code** in the folder, ideally in Opus-plan mode so it plans with Opus and implements with Sonnet (details in `workflow/model-strategy.md`):
   ```bash
   claude --model opusplan
   ```
4. **Scaffold the project** — the agent asks what you're building and generates a runnable base (this replaces the placeholder root `README.md` with your project's own):
   ```
   /init-project
   ```
5. **Work in the issue → PR loop** — create an issue, refine it, implement it:
   ```
   /create-issue "contacts list not paginating past page 2"
   /refine-issue 1
   /work-issue 1
   ```
   The agent prepares a local PR (the branch `fix/1-…`, with its description in `issues/1-….md`) and, once the quality gate and the self-review pass, merges it itself, as authorized for this POC:
   ```bash
   git checkout main
   git merge --no-ff fix/1-contacts-pagination
   ```
   Merging closes the issue on `main`, because the branch already set `status: closed` in the issue file. To undo a merge: `git revert -m 1 <merge-commit>`.

### Commands

| Command | What it does | Phase |
|---|---|---|
| `/init-project` | Interactive scaffolding: asks project type, components and stack, then generates a runnable base. | Design (Opus) |
| `/create-issue <description>` | Creates a new issue file under `issues/` from a description — light capture, not full refinement. Can create it as an epic or nest it under an existing one. | Capture (Opus) |
| `/refine-issue <n>` | Turns a raw issue into an implementable one by asking every question needed. | Analysis (Opus) |
| `/work-issue <n>` | Implements a refined issue: `main → branch → approved plan → code → self-review → local PR → merge`, and offers follow-ups. A child of an epic targets the epic's integration branch. | Implementation (Sonnet) |
| `/finish-epic <n>` | Prepares the integration PR (epic branch → `main`) once an epic's children are done, and merges it. | Integration (Sonnet) |
| `/review-pr <n>` | Reviews the local PR of issue `<n>` against its linked issue(s)' acceptance criteria and the Definition of Done. Read-only: never commits, checks out, or merges. | Review (Sonnet) |

> Not on Claude Code? The same workflow works with Codex (`AGENTS.md`) and GitHub Copilot (`.github/copilot-instructions.md`, read locally by Copilot in VS Code). Each command's steps live once, as a playbook in `.agents/skills/<name>/SKILL.md`: Codex runs those skills directly (invoked with `/skills` or `$skill-name`), and the Claude Code commands are thin wrappers that delegate to them. Copilot supports slash commands via prompt files under `.github/prompts/`, but those aren't shipped here — with Copilot, use natural language ("refine issue 42") and follow the matching playbook, or add the equivalent prompt files. Either way the detailed rules live in `workflow/`.

## Issues as files

Each issue is `issues/<n>-<slug>.md`: a small frontmatter (`id`, `title`, `type`, `status`, `parent`, `created`) plus a Markdown body. Status goes `open` → `refined` → `closed`. An epic is `type: epic`; its children carry `parent: <epicN>`. Full format and operations: `workflow/issue-tracker.md`.

- **Versioned.** Issues live in git next to the code, so you get their history for free.
- **Status travels with the branch.** `/work-issue` closes the issue on its working branch. Merging the branch closes it on `main`; discarding the branch leaves it open.
- **Commits on `main`.** `/create-issue` and `/refine-issue` commit their issue file directly on `main` (`chore(issues): …`). That's the only kind of commit `main` accepts besides merges.

Handy commands:

```bash
git grep -l "^status: open" -- issues/      # open issues (use "refined" for the ready ones)
git branch --no-merged main                 # branches a flow stopped on (blockers, failing gate)
git diff main...<branch>                    # what a local PR changes
```

## Philosophy

It doesn't install Ponytail, Superpowers, or BMAD. It **extracts principles** from each one (see `workflow/principles.md`):

- **Ponytail** → do the minimum that solves the problem. Don't over-engineer. When in doubt between two solutions, pick the more boring one.
- **BMAD** → split the work into phases with explicit outputs (analysis → design → stories → implementation). Each phase leaves a reviewable artifact.
- **Superpowers** → modular knowledge loaded on-demand; reusable commands instead of repeating prompts.

All three step on each other if installed whole (BMAD is heavy and opinionated; Ponytail is the opposite). Hence: principles, not frameworks.

## How the different agents use it

There is no universal format. The logic lives in neutral markdown (`workflow/`, `docs/`) and each agent has a thin pointer:

| Agent | File it reads | Support |
|---|---|---|
| Claude Code | `CLAUDE.md` + `.claude/commands/*.md` (thin wrappers over `.agents/skills/`) | Full (slash commands, interactive refinement, self-review subagent) |
| Codex | `AGENTS.md` | Full (runs the `.agents/skills/` playbooks directly, plus natural language) |
| GitHub Copilot | `.github/copilot-instructions.md` | Good (natural language out of the box; slash commands if you add `.github/prompts/` files) |

All three point to the same `workflow/`. The difference is how much each one honors the interactive flow.

## Language

Reply to the user in the language they write in. In this project, issues, their PR sections, and commit messages are written in **Spanish**, as the user asked. Code and documentation stay in English. Details in `workflow/rules.md`, rule 8.

## Conventions

A few rules the agents enforce (full detail in `workflow/principles.md` and `workflow/git-flow.md`):

- **Local-only.** No remote, no push, nothing published to an external service unless you ask.
- **Atomic components + tests.** Prefer the smallest composable units; each ships with unit tests and coverage meets the project threshold (default 85%).
- **Plan approval before code.** `/work-issue` posts a structured plan and waits for your explicit OK before writing code (trivial changes: a one-sentence confirmation).
- **Independent self-review before the PR.** A fresh agent with a clean context reviews the diff against the issue, the Definition of Done, and a security checklist; blockers are fixed before the PR is prepared.
- **No hidden gates.** Every local PR has a Verification section, in its issue file, listing each gate (lint, tests, coverage, self-review, security, docs) as pass or n/a with the reason.
- **Automatic commits and merges.** The user authorized them for this local POC: the agent commits without asking (issue files on `main`, everything else on the working branch). It merges a branch into its base (`--no-ff`) once the quality gate is green and the self-review has no open blockers, and never otherwise.
- **No secrets in the repo.** Credentials live in gitignored `.env` files; a `.env.example` holds placeholders.
- **Minimal dependencies.** Every new dependency has to be justified.
- **One PR = one issue.** Changes stay small and focused; unrelated work becomes its own issue — `/work-issue` offers to create those follow-ups (only with your approval, after checking for duplicates).
- **Epics for big work.** Work too large for one PR becomes an epic (a parent issue). Its children each merge into a shared integration branch, and the whole epic ships to `main` via one local PR that `/finish-epic` prepares and merges (see `workflow/epics.md`).
- **Docs travel with code.** Behavior or setup changes update the docs in the same PR.
- **The quality gate runs locally.** There's no CI: `/work-issue` runs the lint and test-with-coverage commands recorded in `docs/ARCHITECTURE.md` (`/init-project` fills them in for your stack) before every PR, and you can run the same ones.
- **Workflow integrity check.** After changing the workflow files, run `bash .github/scripts/check-workflow.sh` (commands ↔ skills, referenced guides, listings, `.workflow-config`). Its tests are `bash .github/scripts/check-workflow.test.sh`. A command you add needs its playbook in `.agents/skills/` and a line in the entry files, like the built-in ones.

## Structure

```
.
├── README.md                       # The project's own README (placeholder until /init-project fills it)
├── CLAUDE.md                       # Pointer + rules for Claude Code
├── AGENTS.md                       # Pointer for Codex
├── .gitignore                      # Safe baseline (/init-project extends it per stack)
├── .gitattributes                  # Keeps *.sh and hooks with LF endings (they run from a Windows checkout)
├── .env.example                    # Placeholder env vars; copy to gitignored .env
├── .workflow-config                # Issue tracker selection (issue_tracker=local)
├── .githooks/
│   └── pre-commit                  # main guard: on main, only issues/ commits (and merges) pass
├── issues/                         # The issues, one Markdown file each (created by /create-issue)
├── .github/
│   ├── copilot-instructions.md     # Pointer for Copilot
│   └── scripts/
│       ├── check-workflow.sh       # Workflow integrity check (commands ↔ skills, guide refs)
│       └── check-workflow.test.sh  # Tests for the check, on a synthetic fixture
├── .claude/commands/               # Claude Code slash commands (thin wrappers over .agents/skills/)
│   ├── init-project.md             # Interactive scaffolding
│   ├── create-issue.md             # Create a new issue file
│   ├── refine-issue.md             # Issue refinement
│   ├── work-issue.md               # main → branch → impl → self-review → local PR
│   ├── finish-epic.md              # Epic integration branch → main local PR
│   └── review-pr.md                # Read-only review of a local PR against linked issue + DoD
├── .agents/skills/                 # The six playbooks — single source, run directly by Codex
│   ├── init-project/SKILL.md
│   ├── create-issue/SKILL.md
│   ├── refine-issue/SKILL.md
│   ├── work-issue/SKILL.md
│   ├── finish-epic/SKILL.md
│   └── review-pr/SKILL.md
├── workflow/
│   ├── README.md                   # This file — how the workflow works
│   ├── rules.md                    # Canonical hard rules (agent files point here)
│   ├── principles.md               # Extracted principles (Ponytail/BMAD/Superpowers)
│   ├── scaffolding.md              # Architecture decision guide + stacks
│   ├── issue-creation.md           # How to create an issue
│   ├── issue-refinement.md         # How to refine an issue
│   ├── git-flow.md                 # The git flow contract
│   ├── epics.md                    # Epics: parent/child issues + integration branches
│   ├── issue-tracker.md            # Local Markdown issues: format, operations, local PRs
│   ├── model-strategy.md           # Opus to plan, Sonnet to implement
│   └── pr-review.md                # PR review: linked issue ACs + Definition of Done
└── docs/
    ├── ARCHITECTURE.md             # (generated by /init-project)
    └── ISSUE_TEMPLATE.md           # Refined issue template
```
