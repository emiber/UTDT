# PR review

Guide for `/review-pr <n>`. Reviews a local PR — an issue's branch that isn't merged yet (see `workflow/issue-tracker.md`, Local PRs) — against its linked issue(s)' acceptance criteria and the Definition of Done from `workflow/git-flow.md`. The output is a structured report with **blockers** (must fix before merge) and **suggestions** (improvements worth considering).

This is a **read-only command**: it never commits, checks out, merges, or modifies files. Read the branch with `git show` and `git diff` instead of checking it out, so the working tree doesn't change.

The same contract runs in two modes: against a **prepared local PR** (`/review-pr <n>`, steps below) and in **local diff mode**, the self-review `/work-issue` runs before the PR is prepared (`workflow/git-flow.md` step 5).

## Local diff mode (self-review before the PR)

Same checks, different inputs. You're given an issue number and a base branch:

- **Skip** the Preflight and step 1's branch lookup. The PR shape is known from the base: `main` → standalone, `epic/<epicN>-<slug>` → epic child.
- **Linked issue** = the issue you were given; read its file from the working tree (step 2).
- **Diff** = `git diff <base>...HEAD`. Read the changed files in full, not only the hunks.
- **Skip** the Definition of Done rows that need the prepared PR (Verification section, issue closed on the branch) — they're checked once the PR is prepared.
- **Output** the same report (Intent, Blockers, Suggestions, Summary). Still read-only: report, don't fix.

## Preflight

Run these before anything else. They are read-only — if one fails, stop and report.

| Check | How | If it fails |
|---|---|---|
| Tracker resolved | `.workflow-config` has `issue_tracker=local` (see `workflow/issue-tracker.md`) | Restore the file. |
| The PR's branch exists | The argument is an issue number `<n>` (or a branch name): `git branch --list "*/<n>-*"` returns the branch — `<type>/<n>-<slug>`, or `epic/<n>-<slug>` for an epic | None → there's nothing to review. More than one → ask which. |

## Steps

### 1. Fetch the PR

Read the issue file **on the branch** (`git show <branch>:issues/<n>-<slug>.md`). Its `## Pull request` section is the PR description; its `Branch:` line names the base. If the section is missing, infer the base from the issue — `parent` set → `epic/<parent>-<slug>`, otherwise `main` — and report the missing description (step 4, Verification reported).

If the branch is already merged into its base (`git merge-base --is-ancestor <branch> <base>` succeeds), stop and report — there's nothing to review.

**Classify the PR** from its branch and base (and the issue's `type` and `parent`). There are three valid shapes:

- **Standalone** — `<type>/<n>-<slug>` → `main`; the issue has no `parent`.
- **Epic child** — `<type>/<n>-<slug>` → `epic/<epicN>-<slug>`; the issue's `parent` is that epic.
- **Epic integration** — `epic/<n>-<slug>` → `main`, prepared by `/finish-epic`; the issue has `type: epic`. Its linked issues are the epic itself **plus** its children — the one explicit exception to "one PR = one issue" (see `workflow/epics.md`). Its child issues are correctly targeted here; do **not** flag them as mis-based.

Anything that fits none of these (e.g. a child's branch based on `main`, or a branch whose number doesn't match an issue) → flag for manual validation.

### 2. Fetch the linked issue(s)

The link is the branch name: `<type>/<n>-<slug>` belongs to issue `<n>`. Read `issues/<n>-<slug>.md` **from the branch** (`git show`), with its frontmatter (`type`, `status`, `parent`), body, and notes. For an **epic integration** PR, also read every child (`parent: <n>`, commands in `workflow/issue-tracker.md`) from the epic branch.

Review the diff against **every** linked issue. If the branch's issue file doesn't exist, add it as a blocker: a PR without its issue is untrackable.

### 3. Fetch the diff

```bash
git diff <base>...<branch>
```

Read all changed files in full (`git show <branch>:<path>`) and understand what the PR actually does.

Then write the **PR intent** in one line: what the change is for and what it deliberately leaves alone (take it from the linked issue's Scope). It's the ruler for every scope call below: a real defect *inside* the intent can block; a valid concern *outside* it is a suggestion or a follow-up, never a reason to expand the PR.

### 4. Check the Definition of Done

Go through each item from `workflow/git-flow.md`. Mark each as **pass**, **fail** (blocker), or **warn** (unverifiable from diff alone).

| Item | How to check |
|---|---|
| Acceptance criteria met | Compare the diff against each AC in every linked issue (see step 2); verify each one has corresponding code or is not applicable. Missing coverage of an AC is a blocker. |
| Tests exist for new components | For each new non-trivial file, look for a corresponding test file. A new component with no tests is a blocker. |
| Security checklist | Apply the [Security checklist](#security-checklist) below. Any blocker it lists — including a committed secret — is a blocker. |
| Docs updated if needed | If behavior, setup, or public interface changed, check that `README` / `docs/ARCHITECTURE.md` / inline docs were updated in the same PR. |
| Base branch is correct | Check against the PR type from step 1: **standalone** → base `main`; **epic child** → base `epic/<epicN>-<slug>`; **epic integration** (`epic/** → main`) → base `main` is correct and its child issues are **not** mis-targeted. A base that doesn't match the PR's type — in the `Branch:` line or in where the branch was actually cut from — is a blocker. |
| Issue closed on the branch | The issue file on the branch has `status: closed` (epic integration: the epic and every child), so merging closes it. Still open → blocker. |
| Linter and tests pass | Not verifiable from the diff alone — flag as **warn**; the human can run the Quality gate commands from `docs/ARCHITECTURE.md` after checking out the branch. Escalate to blocker if there are obvious syntax or style violations in the diff. |
| Coverage meets threshold | Not verifiable from the diff alone — flag as **warn** if new code paths have no visible tests, or if Verification lists new/changed files below the threshold without a reason. |
| Verification reported | The `## Pull request` section has a **Verification** list with a line for every gate in `workflow/git-flow.md` (lint, tests, coverage, self-review, security, docs), each pass or `n/a` with a reason, plus an **Out of scope / follow-ups** list. Missing section or missing gates → **warn**. A gate reported as passed that the diff contradicts (e.g. "tests: pass" with a test file deleted) → blocker. Not applicable to an epic integration PR (its children carry it). |

Plan approval and the self-review leave no trace in the diff; the Verification section's self-review line is the only evidence of the latter — don't mark either as pass or fail on your own.

#### Security checklist

Applies to every review. First decide whether the diff touches a **security surface**: entry points (HTTP routes, handlers, CLI arguments, message consumers), authentication or permissions, data access, file handling, outbound calls, configuration or secrets, logging of user data. If it touches none, write one line — "Security: no security surface touched" — and move on; don't invent findings.

Otherwise, check each area. These are **blockers**:

| Area | Blocker when |
|---|---|
| Authorization | A new or changed entry point that reads or changes data has no server-side authorization check, or relies only on the client/UI to hide it. |
| Secrets | A credential, token, API key, private key, or connection string appears in code, config, tests, fixtures, or the PR description. |
| Input | Input from outside the process isn't validated at the boundary, or a query or shell command is built by concatenating that input instead of using parameters. |
| Data exposure | Responses, errors, or logs expose internals (stack traces, tokens, connection strings) or personal data beyond what the feature needs, or return whole internal records where a narrower shape is expected. |

Other concerns — an outbound call without a timeout, an unverified incoming webhook, a new dependency with a doubtful track record — are **suggestions**, unless they open a concrete exploit path; then they're blockers. For each finding give the file and line, the risk in one line, and the fix.

### 5. Report

Output a structured review with the following sections:

#### Intent

The one-line PR intent from step 3.

#### Blockers

Issues that must be resolved before the PR can be merged. Numbered list. For each item:
- What the problem is
- Where it is (file + line when applicable)
- What to do to fix it

If there are no blockers, write: **No blockers found.**

#### Suggestions

Improvements worth considering but not required for merge. Same format as blockers. Omit this section entirely if there are none.

#### Summary

One short paragraph: overall assessment, whether any blockers were found, what remains unverifiable from the diff alone, and the recommended next validation step. Do not state that the PR is "ready to merge" or recommend merging. That decision belongs to the flow's merge step (`workflow/git-flow.md` step 8), which acts on your blockers (see Hard rules).

## Output conventions

- Reference files with path and line number when possible.
- Be specific: "`src/auth.ts:42` hardcodes an API token" beats "possible secret found".
- Group issues that trace to the same root cause instead of listing them separately.
- Keep suggestions actionable. "Extract this into a helper to avoid duplication with `src/utils.ts:18`" is useful; "this code looks complex" is not.

## Hard rules

- Never commit, check out, merge, or modify files — this command is strictly read-only.
- Never auto-approve or recommend merging. Report; the flow's merge step (`workflow/git-flow.md` step 8) decides.
- If the branch is already merged into its base, stop immediately and report without further analysis.
