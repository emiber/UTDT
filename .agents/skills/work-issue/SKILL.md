---
name: work-issue
description: Implement a refined local issue following the git flow main → branch → implementation → local PR → merge (automatic once every gate passes). Use when asked to work on or implement an issue.
---

# work-issue

Implement the target issue (its number — provided as the argument, or stated by the user) following the contract in `workflow/git-flow.md`. This is the canonical playbook: Codex runs it directly and the Claude Code `/work-issue` command delegates to it. The detailed rules live in `workflow/`. The project is local-only: no remote, no push. The PR is a local branch, and the agent merges it into its base once every gate passes; commits and merges are automatic (`workflow/rules.md`).

1. Read `workflow/rules.md`, `workflow/principles.md`, `workflow/git-flow.md`, `workflow/epics.md`, `workflow/pr-review.md` (for the self-review), and `workflow/issue-tracker.md`.
2. Run the full **Preflight checks** from `workflow/git-flow.md` before touching anything. They're read-only — if one fails, stop and report the fix.
3. Read the full refined issue file `issues/<n>-*.md`, including its acceptance criteria and confirmed assumptions, and verify that it is refined (`status: refined`). Check whether it has a **parent epic** (`parent` field, per `workflow/epics.md`) — that changes the base branch in steps 5 and 9. If it isn't refined, suggest the refine-issue skill; if the user insists, refine it minimally on the spot.
4. Start from `main` (`git checkout main`); there's no remote to pull from.
5. Create the working branch `<type>/<n>-<slug>`. No parent → cut from `main`. Child of an epic → cut from the epic's integration branch `epic/<epicN>-<slug>`, creating it lazily from `main` if this is the first child (see `workflow/epics.md`).
6. Get your bearings first: start from the issue's most concrete anchor and trace only the owning path and nearest tests until you can state the expected behavior, smallest plausible change, and a focused check. Then **post the plan in the chat and wait for explicit approval** before writing code — understanding of the acceptance criteria, files to touch, steps, test plan, open questions (trivial change: confirm it in one sentence instead; see `workflow/git-flow.md` step 4).
7. Implement the approved plan — the minimum that satisfies the full refined issue, including its acceptance criteria. Small, descriptive commits. Run the lint and test-with-coverage commands from the **Quality gate** in `docs/ARCHITECTURE.md` (there's no CI — this run is the gate); coverage must meet the threshold, and note any new or changed file below it.
8. **Self-review** (`workflow/git-flow.md` step 5): have a fresh agent with a clean context review `git diff <base>...HEAD` following `workflow/pr-review.md` in local diff mode. Fix blockers, commit the fixes, re-run lint and tests, review once more. If blockers remain, stop and report — don't prepare the PR.
9. **Prepare the local PR** (`workflow/git-flow.md` step 6) on the working branch: append a `## Pull request` section to the issue file (`Branch: <branch> → <main | epic/<epicN>-<slug>>`, what it does, a **Verification** list with every gate as pass or n/a with the reason — never omit one, never report one you didn't run — and **Out of scope / follow-ups**), set the issue's `status: closed` so merging closes it, and commit only the issue file.
10. **Offer follow-ups** (`workflow/git-flow.md` step 7): if the work left real loose ends, propose them as issues. Don't wait for the answer to merge. Create only the ones the user approves, following `workflow/issue-creation.md`, committed on the branch the work was merged into. If there are none, say so.
11. **Merge** (`workflow/git-flow.md` step 8): `git checkout <base>`, `git merge --no-ff <branch>`, `git branch -d <branch>`. Only with every gate passing and no open blockers; stop and report on a conflict. Report the merge commit and how to undo it. If this was the last child of an epic, suggest the finish-epic skill.

If any step fails, stop the flow and report. Don't improvise destructive workarounds, rewrite history, or use `--force` / `--no-verify`.
