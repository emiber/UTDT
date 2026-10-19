---
name: create-issue
description: Create a new local issue file under issues/ from a description, asking only what's needed to write a clear title and body. Use when asked to create, open, or file a new issue.
---

# create-issue

Create a new issue from the description the user gives (as the argument or in their message). This is the canonical playbook: Codex runs it directly and the Claude Code `/create-issue` command delegates to it. The detailed rules live in `workflow/`.

1. Read `workflow/rules.md`, `workflow/principles.md`, `workflow/issue-creation.md`, `workflow/epics.md`, and `workflow/issue-tracker.md`.
2. Check that `.workflow-config` has `issue_tracker=local`: issues are Markdown files under `issues/` (format and operations in `workflow/issue-tracker.md`).
3. Understand the request. If it's empty, ask what the issue is about. Ask only what's missing to write a clear title and body — this is capture, not refinement.
4. Check for duplicates (per `workflow/issue-creation.md`): search the open issues for the same problem. If one plausibly matches, show it and ask whether to add a note to it instead or create a new issue anyway.
5. Assess size and placement (propose-and-confirm, per `workflow/epics.md`): if it's epic-sized, ask whether to create an epic (`type: epic`) or a single issue; if it fits an existing open epic, propose making it a child (`parent: <epicN>`). Skip this for a plain, self-contained issue (the common case).
6. Draft a concise issue (short imperative title, type, and a body with the problem and known context). Show it and confirm before creating.
7. Take the next issue number (it counts every local branch, per `workflow/issue-tracker.md`), write `issues/<n>-<slug>.md` with `status: open`, and commit only that file (`chore(issues): open #<n> <title>`) on `main` — or on the working branch for a work-issue follow-up. Invoking this skill authorizes that one commit.
8. Confirm with the issue number and file path, and suggest running the refine-issue skill to make it implementable.

Don't over-specify. Don't invent scope, acceptance criteria, or a solution — that's the refine-issue skill's job.
