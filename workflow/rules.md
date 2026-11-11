# Hard rules — canonical source

These are the non-negotiable rules for every agent working in this repo. This
file is the **single source of truth**: the agent entry points (`CLAUDE.md`,
`AGENTS.md`, `.github/copilot-instructions.md`) keep only the essential safety
rules inline and point here for the full list. If a rule changes, change it here.

1. **Do the minimum that solves the problem.** Follow `workflow/principles.md`:
   no abstractions, layers, or dependencies "just in case".
2. **Plan before non-trivial work.** Present the plan and wait for approval before
   implementing anything non-trivial. Don't assume requirements.
3. **Ask when something is ambiguous.** One extra question is cheaper than a wrong
   assumption. Don't invent requirements.
4. **Work on branches; the agent merges them when they're ready.** Never commit work
   directly to `main`: every change goes on its own branch (see `workflow/git-flow.md`).
   The one exception is issue files under `issues/`, which `/create-issue` and
   `/refine-issue` commit on `main` (see `workflow/issue-tracker.md`). When a branch is
   ready — quality gate green, self-review with no unresolved blockers, `## Pull request`
   section written — **the agent merges it into its base** with `git merge --no-ff` and
   deletes it. The user authorized automatic merges for this local POC. The base is `main`
   or, for an issue that belongs to an epic, that epic's integration branch (see
   `workflow/epics.md`). Never merge a branch with a failing gate or open blockers.
5. **The agent commits on its own.** The user authorized automatic commits for this
   local POC, so don't ask before committing: issue files on `main`, everything else on
   the working branch, in small, descriptive commits. A change made outside a workflow
   command follows the same path: its own `<type>/<slug>` branch, the quality gate, then
   the merge. Commit only what belongs to the change.
6. **Local workflow; GitHub only to share.** The repo has a GitHub remote (`origin`) so
   it can be shared. The work stays local: issues are files under `issues/`, a PR is a
   local branch the agent merges, and there's no CI. Push to `origin` only when the user
   asks. Never add another remote, open issues or PRs on GitHub, or publish anything to
   another external service unless the user asks.
7. **Never commit secrets or credentials.** Keep them in gitignored `.env` files
   and provide a `.env.example` with placeholder values.
8. **Language.** Issues (files under `issues/`), their `## Pull request` sections, and
   commit messages are written in **Spanish**, as the user asked. Code (identifiers,
   comments, logs, UI texts) and documentation (`README.md`, `docs/`, `workflow/`) stay in
   English. In commit messages, keep the Conventional Commit `type(scope):` prefix and
   write the rest in Spanish. The guides show the issue-commit verbs in English: write
   `open`/`refine`/`note`/`close` as `abrir`/`refinar`/`nota`/`cerrar` (e.g.
   `chore(issues): abrir #2 <título>`). Keep the section headings the guides define
   (`## Pull request`, `## Notes`, the issue template's sections, `Verification`) as they
   are: they're structural markers the workflow looks for. Write their content in Spanish.
   Branch names follow the issue file's slug. Reply to the user in the language they
   write in.

Platform-specific behavior (slash commands vs. natural language, model strategy)
lives in each agent's entry file, not here.
