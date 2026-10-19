# Issue creation

Guide for `/create-issue`. The goal: turn a rough idea into a well-formed issue file
under `issues/` — clear enough that `/refine-issue` (or a human) can pick it up without
guessing what was meant.

This is **capture, not refinement**. Keep it light: a good title, a body that states
the problem and any known context. Deep clarification (scope, edge cases, acceptance
criteria) is `/refine-issue`'s job — don't do it here unless the user explicitly asks.

## Before starting: the tracker

Issues are local Markdown files; the format and every operation used below (search, next
number, commit) are in `workflow/issue-tracker.md`. Check that `.workflow-config` has
`issue_tracker=local`.

## Steps

### 1. Understand the request

Take the description the user gives (as the argument or in their message). If it's
empty, ask what the issue is about. Get just enough to write a clear title and a
short body:

- **What** — the problem, bug, or feature, in one line.
- **Why / context** — anything already known: where it happens, links, related issues.
- **Type** — `feat`, `fix`, `chore`, `docs`… (the issue's `type`, which becomes its
  branch prefix).

Ask only what's missing — one or two questions, not the full refinement
interrogation. If the user gives a one-liner and says "just create it", create it.

### 2. Check for duplicates

Before drafting, search the open issues (`status` not `closed`) for the same problem,
using two or three key words from the request (see `workflow/issue-tracker.md`).

If one plausibly matches, show it and ask: add the new context to the existing issue
(a dated entry in its `## Notes`), or create a new one anyway (and mention the related
issue in its body). Never decide silently. No match → carry on. This applies to every
issue this workflow creates, including the follow-ups `/work-issue` offers
(`workflow/git-flow.md` step 7).

### 3. Assess size and placement (epics)

Two quick checks before drafting. Both are **propose-and-confirm** — never decide the
structure silently, and never invent a parent. See `workflow/epics.md` for the how.

- **Is it epic-sized?** If the request clearly spans several deliverables or components,
  or would sensibly be more than one PR, it's probably an **epic**, not one issue. Say so
  and ask how to handle it:
  - create it as an **epic** (`type: epic`), and capture children as separate issues
    (now or later), or
  - keep it as a **single issue** (it's smaller than it looks, or it'll be split during
    refinement).

  Capturing the children now is optional — offer to, but don't force a full breakdown at
  capture time.

- **Does it belong under an existing epic?** For a normal (non-epic) issue, list the open
  epics. If the new issue plausibly fits one, propose making it a child (`parent: <epicN>`)
  and confirm. If nothing fits or the user declines, create it standalone.

If neither applies (a plain, self-contained issue with no matching epic), skip this and
carry on — this is the common case.

### 4. Draft the issue

Write a concise issue:

- **Title**: short, imperative, specific. E.g. "Contacts list not paginating past
  page 2", not "bug in contacts".
- **Body**: the problem and known context. Don't invent scope, acceptance criteria,
  or a solution — that's refinement. A short "Context / notes" section is enough.

Show the draft (title, type, parent if any, and body) to the user and confirm before
creating.

### 5. Create the file

1. Take the next issue number (see `workflow/issue-tracker.md` — it counts every branch,
   not only the working tree).
2. Write `issues/<n>-<slug>.md` with the frontmatter (`id`, `title`, `type`,
   `status: open`, `parent` if step 3 made it a child, `created` with today's date) and
   the body.
3. Commit only that file: `chore(issues): open #<n> <title>` — on `main`, or on the
   working branch for a `/work-issue` follow-up (see `workflow/issue-tracker.md`,
   Committing issue changes). Invoking `/create-issue` authorizes this commit.

### 6. Output

Confirm with the issue number and file path. Suggest `/refine-issue <n>` to make it
implementable, then `/work-issue <n>` to build it.

## Keep it minimal

Creating an issue is cheap and reversible. Don't block on a perfect write-up — capture
the intent, create it, and let `/refine-issue` do the deep work. If the user already
handed you a full spec, don't strip it down: put it in the body as-is.
