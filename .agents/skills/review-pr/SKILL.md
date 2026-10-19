---
name: review-pr
description: Review a local PR (an issue's branch that isn't merged yet) against its linked issue(s) and the Definition of Done. Use when asked to review a pull request or a branch. Read-only. Logic lives in workflow/pr-review.md.
---

# review-pr

Review the target local PR — identified by its issue number (or branch name), provided as the argument or stated by the user — against its linked issue(s) and the Definition of Done, following the contract in `workflow/pr-review.md`. This is the canonical playbook: Codex runs it directly and the Claude Code `/review-pr` command delegates to it. This is **read-only**: never commit, check out, merge, or modify files.

1. Read `workflow/rules.md`, `workflow/principles.md`, `workflow/pr-review.md`, `workflow/git-flow.md` (for the Definition of Done), and `workflow/issue-tracker.md`.
2. Run the preflight from `workflow/pr-review.md`. It's read-only — if one fails, stop and report the fix. It finds the PR's branch (`*/<n>-*`).
3. Read the issue file from the branch (`git show`) — its `## Pull request` section is the PR description and names the base. If the branch is already merged into its base, stop: there's nothing to review. Read every linked issue (for an epic integration PR, the epic plus its children) and the diff `git diff <base>...<branch>`. Write the PR intent — what it's for and what it deliberately leaves alone — and judge scope against it.
4. Check each Definition of Done item from `workflow/git-flow.md`, including the **Security checklist**, the issue being closed on the branch, and the PR's **Verification** section: mark **pass**, **fail** (blocker), or **warn** (unverifiable from the diff alone).
5. Report the structured review: **Intent**, **Blockers**, **Suggestions**, and a **Summary**. Report blockers and unverifiable items; never recommend or make the merge decision. That belongs to the flow's merge step (`workflow/git-flow.md` step 8).

Never commit, check out, modify files, approve, or merge. If any step fails, stop and report.
