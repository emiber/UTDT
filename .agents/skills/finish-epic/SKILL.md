---
name: finish-epic
description: Prepare the integration PR (epic branch → main) when an epic's children are done, and merge it once the quality gate passes. Use when asked to finish, close out, or ship an epic. Logic lives in workflow/epics.md.
---

# finish-epic

Close out the target epic (its issue number — provided as the argument, or stated by the user) by preparing its integration PR, following the contract in `workflow/epics.md`. This is the canonical playbook: Codex runs it directly and the Claude Code `/finish-epic` command delegates to it. The project is local-only: the PR is the epic branch, and the agent merges it into `main` once the quality gate passes; commits and merges are automatic (`workflow/rules.md`).

1. Read `workflow/rules.md`, `workflow/principles.md`, `workflow/epics.md`, and `workflow/issue-tracker.md`.
2. Run the preflight from `workflow/epics.md` (`/finish-epic` section). It's read-only — if one fails, stop and report the fix. It confirms the target really is an epic (`type: epic`) and that its integration branch `epic/<n>-<slug>` exists.
3. Find the epic's children (`parent: <n>`, on `main` and on the epic branch). A child is done when its issue file **on the epic branch** is `status: closed`. If any child is still open or refined there, or has a branch not merged into the epic branch, **stop and report them and do not prepare the integration PR** — there is no "proceed anyway".
4. Sync the epic branch with the latest `main` (`git merge main` on the epic branch, resolving conflicts). Never rewrite the epic branch's history. Then run the Quality gate commands from `docs/ARCHITECTURE.md` on the epic branch; if either fails, stop and report.
5. On the epic branch, append the `## Pull request` section to the epic's issue file (`Branch: epic/<n>-<slug> → main`, epic summary, children list), set the epic's `status: closed`, and commit only that file.
6. **Merge it into `main`**: `git checkout main`, `git merge --no-ff epic/<n>-<slug>`, `git branch -d epic/<n>-<slug>`. Merging closes the epic and its children on `main`. Stop and report on a conflict. Report the merge commit and how to undo it.

If any step fails, stop and report. Don't improvise destructive workarounds or use `--force`.
