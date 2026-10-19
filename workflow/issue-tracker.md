# Issue tracker — local Markdown files

This project keeps its issues as Markdown files in the repo, under `issues/`. There is no remote tracker and no remote repository: everything lives in this local Git repo. `.workflow-config` records the choice (`issue_tracker=local`). Every command that touches issues (`/create-issue`, `/refine-issue`, `/work-issue`, `/finish-epic`, `/review-pr`) reads and writes them as described here. This file is the **single source** for the issue file format and the concrete operations; the other guides point here instead of repeating them.

## Issue files

One file per issue: `issues/<n>-<slug>.md`, where `<n>` is the issue number (no zero-padding) and `<slug>` a short kebab-case summary of the title — e.g. `issues/12-contacts-pagination.md`. Create the `issues/` folder if it doesn't exist yet.

```markdown
---
id: 12
title: Contacts list not paginating past page 2
type: fix
status: open
parent:
created: 2026-10-19
---

The problem and known context. After /refine-issue, the structure in docs/ISSUE_TEMPLATE.md.
```

| Field | Values |
|---|---|
| `id` | The issue number. Must match the file name. |
| `title` | Short, imperative, specific. |
| `type` | `feat`, `fix`, `chore`, `docs`, `refactor`, `test` — or `epic` for a parent issue (see `workflow/epics.md`). It's the branch prefix in `workflow/git-flow.md`. |
| `status` | `open` (captured) → `refined` (implementable) → `closed` (done, or dropped). |
| `parent` | The epic's number if this issue is a child of an epic; empty otherwise. |
| `created` | `YYYY-MM-DD`. |

Sections the workflow appends to the body over time:

- `## Notes` — the equivalent of comments: dated entries (`- 2026-10-19: …`) that add context later. Append; don't rewrite earlier entries. Keep it as the last section, except for `## Pull request`.
- `## Pull request` — written on the working branch by `/work-issue` (or `/finish-epic` for an epic): the PR description and its Verification (see `workflow/git-flow.md` step 6).

## Operations

Commands are shell-neutral (they run the same from PowerShell and Bash); the agent's own file and search tools are fine too.

| Operation | How |
|---|---|
| Find issue `<n>` | The file matching `issues/<n>-*.md`. None → the issue doesn't exist on this branch. |
| Read it on another branch | `git show <branch>:issues/<n>-<slug>.md` |
| List open issues | Files in `issues/` whose `status` isn't `closed`. |
| Search (duplicates) | Search key words in titles and bodies, e.g. `git grep -i -l "<word>" -- issues/`. |
| Next number | The highest `<n>` among the files in `issues/` **and** the issue files on every local branch, plus one. `git log --all --name-only --format= -- issues/` lists every issue file ever committed on any branch; counting them avoids reusing a number that a follow-up took on an unmerged branch. Start at 1. |
| Add a note (comment) | Append a dated entry to `## Notes` (create the section if missing). |
| Mark refined | Set `status: refined`. |
| Close | Set `status: closed`. `/work-issue` does it on the working branch (see below). To drop an issue by hand, close it with a note saying why. |

### Committing issue changes

Issue files are versioned, so every change to them is a commit. Commit **only** the issue file(s) you touched — never anything else in the same commit:

```bash
git add issues/<n>-<slug>.md
git commit -m "chore(issues): <open|refine|note> #<n> <title>" -- issues/<n>-<slug>.md
```

- `/create-issue` and `/refine-issue` commit on **`main`**. That's the one exception to "never commit to `main`" (`workflow/rules.md`), and the local `main` guard allows it: `.githooks/pre-commit` accepts commits on `main` only when they touch nothing outside `issues/`. Invoking those commands authorizes that commit. If another branch is checked out, say so and ask before committing — switch to `main` if the working tree is clean, or commit on the current branch.
- Inside `/work-issue`, issue changes (closing the issue, follow-ups) are committed on the **working branch** and reach `main` with the merge.

## Status travels with the branch

Because issue files are versioned, each branch shows its own view of the issues, and `main` shows what has actually shipped:

- `/work-issue` closes the issue **on its working branch**. When the human merges that branch, the issue is closed on the base too — the local equivalent of `Closes #<n>`. If the branch is discarded, the issue stays open.
- A child of an epic merges into the epic's integration branch, so it shows as closed there, and on `main` only once the whole epic ships (see `workflow/epics.md`).

## Parent/child (epics)

The full model — including the integration branch — is in `workflow/epics.md`. The concrete operations:

| Operation | How |
|---|---|
| An epic | An issue with `type: epic`. |
| A child | An issue whose `parent` is the epic's number. Two levels only: a child has no children. |
| List open epics | `type: epic` and `status` isn't `closed`. |
| List an epic's children | Issues with `parent: <epicN>`, e.g. `git grep -l -w -E "^parent: *<epicN>" <branch> -- issues/` (`-w` so `1` doesn't match `12`). Check `main` and the epic branch, and take the union. |
| Detect a child's epic | Its `parent` field. |
| Link / unlink | Set / clear `parent`, then commit the issue file. |

## Local PRs

There's no hosting platform, so a **PR is a local branch left unmerged for review**: its commits are the change, and the `## Pull request` section of its issue file (on that branch) is the PR description. List the open ones with `git branch --no-merged main` (and `git branch --no-merged epic/<epicN>-<slug>` for an epic's children). The human reviews — optionally with `/review-pr <n>` — and merges; the agent never merges (see `workflow/git-flow.md` step 8).
