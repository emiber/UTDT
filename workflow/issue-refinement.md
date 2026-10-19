# Issue refinement

Guide for `/refine-issue <n>`. The goal: take a raw issue and make it clear enough to implement without guessing.

## Before starting: the tracker

Issues are local Markdown files under `issues/`; the format and operations (find, edit, commit) are in `workflow/issue-tracker.md`. Check that `.workflow-config` has `issue_tracker=local`.

## Steps

### 1. Fetch the issue

Read `issues/<n>-*.md` — frontmatter, body, and `## Notes`.

If it doesn't exist, say so and offer to create it with `/create-issue` (see `workflow/issue-creation.md`). If it's `closed`, say so and ask before refining it.

### 2. Detect ambiguities

Read the issue and list everything that isn't clear. Categories to check:

- **Goal**: what problem does it solve? For whom?
- **Scope**: what's in and what's NOT in this issue?
- **Expected behavior**: normal, edge, and error cases.
- **Data**: what comes in, what goes out, what's persisted?
- **Dependencies**: does it block or depend on other issues?
- **Acceptance criteria**: how do we know it's done?
- **Non-functional**: performance, security, limits, permissions.

### 3. Ask

Ask the user **all** the questions needed to close those ambiguities. In small groups. Don't proceed on unconfirmed assumptions. If the user answers "use your judgment", propose a concrete decision and confirm it. Record any such confirmed judgment call in the issue's **Assumptions** section (see `docs/ISSUE_TEMPLATE.md`) so what the user originally stated remains separate from what you inferred and they confirmed. Also reflect each decision's effects in the relevant **Scope**, **Expected behavior**, **Data**, or **Acceptance criteria** section; **Assumptions** records provenance, not a substitute for implementable requirements.

Apply Ponytail: don't inflate the scope. If the issue asks for something small, keep it small. Detect and flag over-engineering in the original request.

### 4. Write the refined issue

Rewrite the issue file's body with the structure in `docs/ISSUE_TEMPLATE.md`, keep its existing `## Notes`, and set `status: refined` (adjust `title` or `type` if refinement changed them). Then commit only that file: `chore(issues): refine #<n> <title>` — on `main` (see `workflow/issue-tracker.md`, Committing issue changes). Invoking `/refine-issue` authorizes this commit.

### 5. Output

Confirm to the user that the issue is refined and show them the result. Suggest running `/work-issue <n>` when they want to implement it.

## When NOT to refine so much

For a typo fix or a one-line change, the full ritual isn't needed. Say so, confirm the scope in one sentence, and continue. The phase discipline (BMAD) is for real work, not for bureaucratizing trivial changes.
