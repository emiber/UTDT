# Git flow — contract

Guide for `/work-issue <n>`. Defines the `main → branch → implementation → local PR → merge` cycle. This project is **local-only**: there's no remote and no hosting platform, so the PR is a branch described in its issue file (see `workflow/issue-tracker.md`, Local PRs). Once every gate passes, the agent merges it into its base (step 8): the user authorized automatic commits and merges for this POC (`workflow/rules.md`). This contract is **strict**: don't modify it unless the user asks. Issues that belong to an epic add an integration-branch layer on top of this cycle (child branches target the epic's branch, not `main`) — see `workflow/epics.md`.

## Preflight checks

Run these **before touching anything**. They're read-only — if one fails, stop and report the fix; never modify the workspace to force a pass.

| Check | How | If it fails |
|---|---|---|
| `git` installed | `git --version` | Install Git and retry. |
| Inside a Git repo | `git rev-parse --is-inside-work-tree` | `cd` into the repo first. |
| `main` branch exists | `git show-ref --verify refs/heads/main` | Create it, or tell the agent your default branch name. |
| Working tree clean | `git status --porcelain` is empty | Commit, stash, or discard changes before starting. |
| Tracker resolved | `.workflow-config` has `issue_tracker=local` (see `workflow/issue-tracker.md`) | Restore the file. |
| `main` guard active | `git config core.hooksPath` prints `.githooks` | **Warn, don't stop:** suggest `git config core.hooksPath .githooks` (see `workflow/scaffolding.md` step 5). |

## Steps

### 1. Fetch and verify the issue

Read the issue file `issues/<n>-*.md` (see `workflow/issue-tracker.md`), including its acceptance criteria and any confirmed assumptions. Verify that it is refined (`status: refined`, structured per `workflow/issue-refinement.md`). If it isn't, suggest refining it first; if the user insists, refine it minimally on the spot. If it's already `closed`, stop and say so.

Also check whether the issue has a **parent epic** — a non-empty `parent` field. If it does, this is a child of an epic and uses the **integration-branch flow**: steps 3 and 6 change as noted below (see `workflow/epics.md`). If it has no parent, the flow is exactly as written.

If the issue is itself an epic (`type: epic`), don't implement it directly: its children are the work. Suggest working them one by one, then `/finish-epic`.

### 2. Start from main

```bash
git checkout main
```

There's no remote to pull from: local `main` is the source of truth.

### 3. Create the working branch

Branch name derived from the issue. Convention:

```
<type>/<n>-<short-slug>
```

where `<type>` is the issue's `type` (`feat`, `fix`, `chore`, `refactor`, `docs`, etc.) and `<short-slug>` is a kebab-case summary of the title (the issue file's slug is fine).

**No parent epic (the common case):** branch off `main`.

```bash
git checkout -b feat/<n>-<slug>
```

**Issue has a parent epic:** branch off the epic's integration branch instead of `main`, and create that branch **lazily** from `main` if this is the first child (see `workflow/epics.md`). The epic's slug comes from its issue file.

```bash
git show-ref --verify --quiet refs/heads/epic/<epicN>-<slug> || git branch epic/<epicN>-<slug> main
git checkout -b feat/<n>-<slug> epic/<epicN>-<slug>   # child branch, cut from the epic branch
```

### 4. Implement

- **Model**: this phase is implementation → use the execution model (Sonnet). See `workflow/model-strategy.md`. If you're coming from planning with Opus, switch with `/model sonnet` or let `opusplan` do it on its own.
- **Get your bearings first.** Start from the issue's most concrete anchor and trace only the owning code path, its immediate callers and data flow, and the nearest tests. Stop exploring once you can state the expected behavior, the smallest plausible change, and a focused check that could disprove it. Keep this pass read-only; use plain reading and search, and don't add tooling for it.
- **Plan approval — before writing any code.** Post the plan in the chat and wait for the user's explicit approval ("go ahead", "approved", …). A question or a vague comment is not approval: answer it and ask again. The plan covers:
  - **Understanding** — the goal and each acceptance criterion, one line each.
  - **Files** — what you'll create or change.
  - **Steps** — in order.
  - **Test plan** — the tests you'll add or update, and the edge cases they cover.
  - **Open questions** — anything that blocks correctness. Ask instead of guessing.

  A **trivial** change (a typo, a one-line fix, a docs tweak with no behavior change) skips the full plan: state the change in one sentence and get a yes. If the user adjusts the plan, implement the adjusted version.
- Follow `workflow/principles.md`: the minimum that satisfies the full refined issue, including its acceptance criteria.
- Keep the change scoped to this one issue: one PR = one issue. If you spot unrelated work, don't expand this PR: list it under **Out of scope / follow-ups** in the PR description and offer it as an issue in step 7.
- Never stage or commit secrets or credentials. Keep them in gitignored `.env` files; add placeholders to `.env.example` when config is needed.
- Small, descriptive commits. Suggested format (Conventional Commits):

```
<type>(<area>): <short description>

Refs #<n>
```

- Every new component ships with unit tests, and test coverage must meet the threshold in `docs/ARCHITECTURE.md` (default 85% — see `workflow/principles.md`).
- **Run the quality gate locally**: the lint and test-with-coverage commands recorded in the **Quality gate** section of `docs/ARCHITECTURE.md`. There's no CI behind you — this run is the gate. If the file doesn't list them, detect them from the project (package scripts, `pyproject.toml`, …), use them, and propose recording them as a follow-up (step 7). If something fails or coverage is below the threshold, fix it before going on.
- **Check the coverage of what you touched**, not just the total: a change can keep the global number above the threshold while its own new code is barely tested. List any new or changed source file below the threshold in the PR's **Verification** section, and add tests unless there's a real reason (say which).

### 5. Self-review — before the PR

With the quality gate green and the work committed, get an independent review before anyone else sees the change. Your context is full of your own assumptions; a reviewer that sees only the issue and the diff catches what they hide.

1. **Review in a clean context.** Start a fresh agent (on Claude Code, a subagent on the execution model) and give it only: the issue number, the base branch (`main`, or `epic/<epicN>-<slug>` for an epic child), and the instruction to review `git diff <base>...HEAD` following `workflow/pr-review.md` in **local diff mode**. Don't pass your plan or your reasoning. It reports; it doesn't edit. If you can't start a separate agent, run the same review yourself and say so in Verification ("inline").
2. **Triage what comes back:**
   - **Blockers** → fix them, commit the fixes (the review only sees committed work), re-run the quality gate, and run the review **once more**. If blockers remain after that second review, stop: don't prepare the PR — report them to the user with your proposed way forward.
   - **Suggestions** within the issue's scope → apply the cheap, clearly-right ones; list the rest on the Self-review line of the PR's Verification section.
   - Anything **outside the issue's scope** → a follow-up (step 7), not a change to this PR.
3. Record the outcome on the **Self-review** line of the PR's Verification section.

A **trivial** change (see step 4) may skip the separate agent: check the diff against the same contract inline and note it in Verification.

### 6. Prepare the local PR

No push, no platform: the PR is the working branch plus a description in its issue file. On the working branch:

1. **Base branch**: `main` normally; the epic's integration branch (`epic/<epicN>-<slug>`) if the issue is a child of an epic.
2. **Append a `## Pull request` section** to the issue file:

   ```markdown
   ## Pull request
   Branch: `<type>/<n>-<slug>` → `<main | epic/<epicN>-<slug>>`

   ### What it does
   ...

   ### Verification
   - Lint: <command> — pass
   - Tests: <command> — pass
   - Coverage: <total>% (threshold <t>%); new/changed files below threshold: none | <file — reason>
   - Self-review: <blockers found and fixed, or none>; suggestions not applied: <list, or none> (separate agent | inline)
   - Security: pass | no security surface touched
   - Docs: updated <files> | not needed (<reason>)

   ### Out of scope / follow-ups
   None | - <item>
   ```

3. **Close the issue on the branch**: set `status: closed` in its frontmatter. Merging the branch is what closes it on the base — the local equivalent of `Closes #<n>` (see `workflow/issue-tracker.md`, Status travels with the branch). For an epic child this closes it on the epic branch; it shows as closed on `main` once the epic ships.
4. Commit only the issue file: `chore(issues): close #<n> <title>`.

**Verification rules.** Every gate gets a line. A gate that doesn't apply (e.g. no tests for a docs-only change) is `n/a` with the reason — never dropped. Never report a gate as passed unless you ran it in this session. A failing gate never appears in a PR: it stops the flow until it's fixed (or you report to the user) — the PR is prepared only with every gate passing or `n/a`.

### 7. Offer follow-ups

If the work surfaced **real** loose ends — unrelated bugs you noticed, scope deliberately left out, self-review findings outside the issue's scope, a deliberate TODO — list them and **offer** to create them as issues. Nothing is created until the user approves; they may edit or drop items.

- The merge (step 8) doesn't wait for this answer.
- Create each approved item following `workflow/issue-creation.md` (it checks for duplicates first), with `Follow-up of #<n>` in its body. Commit it on the branch the work was merged into: `main`, or the epic branch for an epic child. If the working branch isn't merged yet, commit it there. The next-number rule in `workflow/issue-tracker.md` keeps numbers unique across branches. For a child of an epic, ask whether the follow-up belongs under the same epic.
- Then update the **Out of scope / follow-ups** list in the `## Pull request` section with the new issue numbers, and commit the issue file.
- No real loose ends → say so and skip. Never invent follow-ups to look thorough.

### 8. Merge

Only with every gate passing (or `n/a`), no unresolved self-review blockers, and the `## Pull request` section committed. Merge the branch into its base and delete it:

```bash
git checkout <base>            # main, or epic/<epicN>-<slug> for an epic child
git merge --no-ff <branch>
git branch -d <branch>
```

`--no-ff` keeps one merge commit per PR, so the base's history reads as a list of PRs. Git's default merge message is fine. If the merge conflicts, stop and report; don't force it.

Then report the merge (branch, base, merge commit) and how to undo it if needed (`git revert -m 1 <merge-commit>`). If this was the last child of an epic, suggest `/finish-epic`.

## Definition of Done

An issue isn't done until all of these hold. Check them before preparing the PR:

- [ ] All applicable requirements in the refined issue are met, including its acceptance criteria.
- [ ] The plan was approved before implementing (or the change was confirmed as trivial).
- [ ] New components have unit tests; coverage meets the threshold in `docs/ARCHITECTURE.md` (default 85%), and any new or changed file below it is listed in Verification with the reason.
- [ ] Linter and tests pass locally, using the Quality gate commands in `docs/ARCHITECTURE.md`.
- [ ] The self-review (step 5) left no unresolved blockers.
- [ ] No secrets or credentials committed, and the change passes the Security checklist in `workflow/pr-review.md` (or touches no security surface).
- [ ] Docs updated if behavior or setup changed (`README` / `ARCHITECTURE` / etc.).
- [ ] The `## Pull request` section's **Verification** reports every gate — pass, or `n/a` with the reason — and **Out of scope / follow-ups** lists what was left out (or "None").
- [ ] The issue is closed on the working branch, and the branch is merged into its base: `main`, or the epic's integration branch if the issue is a child of an epic (see `workflow/epics.md`).

## Hard rules

- Never commit to `main` directly. The one exception: issue files under `issues/`, committed by `/create-issue` and `/refine-issue` (see `workflow/issue-tracker.md`).
- Merge a working branch into its base only when it's ready (step 8): never with a failing gate, open self-review blockers, or an unwritten `## Pull request` section.
- Commits and merges are automatic: the user authorized them for this POC (`workflow/rules.md`), so don't ask before committing or merging.
- This project is local-only: never add a remote or push anywhere unless the user asks.
- Never rewrite the history of `main` or an epic branch (no rebase, `reset --hard`, or amend there).
- Never skip git hooks (`--no-verify`) or weaken tests just to get a green run.
- If any step fails, stop the flow and report; don't improvise destructive workarounds.
