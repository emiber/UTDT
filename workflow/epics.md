# Epics — parent/child issues and integration branches

Some work is too big for a single issue and one PR. An **epic** is a parent issue
that groups related **child issues**, each of which is still implemented and merged
on its own. This file is the single source of truth for how epics work; the issue
and git-flow guides point here.

Keep it to **two levels**: `epic → issue`. A child does not have its own children.
If a piece of work feels like it needs a third level, it's a sign the epic is too
big — split it into two epics instead. (Ponytail: the boring, minimal structure wins.)

Epics are **opt-in**. Most issues have no parent and follow the plain
`main → branch → local PR` flow in `git-flow.md` unchanged. Everything here is additive
and only applies when an issue belongs to an epic.

## How the hierarchy is represented

Issues are local Markdown files (see `workflow/issue-tracker.md`), so the hierarchy is two
frontmatter fields:

- **An epic** is an issue with `type: epic`.
- **A child** is an issue whose `parent` is the epic's number.

The concrete operations — list open epics, list an epic's children, link or unlink a
child — live in `workflow/issue-tracker.md` (Parent/child). This guide doesn't repeat them.

## Integration branch model

An epic's children are **not** merged straight to `main` one by one. Instead:

```
main
 └── epic/<epicN>-<slug>              ← integration branch (one per epic)
      ├── feat/<child1N>-<slug>       → local PR into the epic branch
      ├── feat/<child2N>-<slug>       → local PR into the epic branch
      └── ...
 (when the epic is done) epic/<epicN>-<slug> ──local PR──▶ main
```

- **One integration branch per epic**, named `epic/<epicN>-<slug>`.
- It is created **lazily** — the first time a child is worked (see `git-flow.md`), not
  when the epic issue is created. Nothing exists until it's needed.
- **Child branches** keep the normal `<type>/<childN>-<slug>` convention but are cut
  from the epic branch, and their base is the epic branch: `/work-issue` merges them there
  once they're ready (`workflow/git-flow.md` step 8).
- When all children are done, `/finish-epic <epicN>` prepares a single local PR from the
  epic branch to `main` and merges it.

### When children show as closed

`/work-issue` closes each child **on its own branch** (`status: closed`), like any issue.
That branch merges into the epic branch, so the child is closed there — but on `main` it
stays open until the epic ships, because the status change only reaches `main` with the
epic's merge. That matches the intent: a child isn't really done until it's in `main`.
No extra bookkeeping is needed: merging the epic branch into `main` closes the whole tree
at once (see `workflow/issue-tracker.md`, Status travels with the branch).

## `/finish-epic <n>` — contract

Guide for the `/finish-epic` command. Prepares the integration PR (`epic/<n>-<slug> → main`)
when an epic's children are done, and merges it into `main` once the quality gate passes.
Commits and merges are automatic (`workflow/rules.md`). Like `git-flow.md`, this is strict:
never commit to `main` directly, and never merge with a failing gate.

### Preflight (read-only — if one fails, stop and report the fix)

| Check | How |
|---|---|
| `git` + inside a repo, `main` exists, working tree clean | as in `git-flow.md` |
| Tracker resolved | `.workflow-config` has `issue_tracker=local` (see `workflow/issue-tracker.md`) |
| `<n>` is an epic | Its issue file has `type: epic`. If not, stop. |
| Integration branch exists | `git show-ref --verify refs/heads/epic/<n>-<slug>`. If it doesn't, no child was ever worked — say so and stop. |

### Steps

1. **Find the epic's children.** List the issues with `parent: <n>` on `main` and on the
   epic branch, and take the union (commands in `workflow/issue-tracker.md`).
2. **Check children are done.** A child is done when its issue file **on the epic branch**
   has `status: closed` — its local PR was merged there (or it was explicitly dropped, with
   a note). If any child is still `open` or `refined` on the epic branch, or has a branch
   not yet merged into it (`git branch --no-merged epic/<n>-<slug>`), **stop and report
   those children and don't prepare the integration PR** — there is no "proceed anyway".
   The epic ships only once all its work is on the epic branch.
3. **Sync the epic branch with main.** Merge the latest `main` into it so the PR diff is clean:
   ```bash
   git checkout epic/<n>-<slug>
   git merge main        # resolve conflicts here if any; never force
   ```
   If there are conflicts you can't resolve safely, stop and report. Then run the lint and
   test-with-coverage commands from the **Quality gate** in `docs/ARCHITECTURE.md` on the epic
   branch. If either fails, stop and report: don't prepare or merge the PR.
4. **Prepare the integration PR.** On the epic branch, append a `## Pull request` section to
   the epic's issue file, set the epic's `status: closed`, and commit only that file
   (`chore(issues): close epic #<n> <title>`):
   ```markdown
   ## Pull request
   Branch: `epic/<n>-<slug>` → `main`

   ### Epic summary
   What this epic delivers, as a whole.

   ### Children
   - #<child1> <title>
   - #<child2> <title>
   ```
5. **Merge it into `main`** and delete the epic branch. Merging closes the epic and all its
   children on `main`:
   ```bash
   git checkout main
   git merge --no-ff epic/<n>-<slug>
   git branch -d epic/<n>-<slug>
   ```
   If the merge conflicts, stop and report. Report the merge commit and how to undo it
   (`git revert -m 1 <merge-commit>`).

### Hard rules (same spirit as `git-flow.md`)

- Never commit to `main` directly. The epic ships when `/finish-epic` merges it, and only
  with every child closed on the epic branch and the quality gate green.
- Never rewrite the epic branch's history (no rebase, `reset --hard`, or amend) — children
  branch off it.
- Never skip hooks, never weaken tests.
- If any step fails, stop and report; don't improvise destructive workarounds.
