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
4. **Never merge into `main` or commit to it directly.** The flow ends with a local PR:
   a branch left unmerged for human review (see `workflow/git-flow.md`). Its base is
   `main` or, for an issue that belongs to an epic, that epic's integration branch (see
   `workflow/epics.md`) — either way the human merges it, never the agent. The one
   exception: issue files under `issues/`, which `/create-issue` and `/refine-issue`
   commit on `main` (see `workflow/issue-tracker.md`).
5. **Never `git commit` unless the user explicitly asks.** Invoking a mutating workflow
   explicitly authorizes only the side effects that workflow declares — e.g.
   `/create-issue` and `/refine-issue` the commit of the issue file they wrote,
   `/work-issue` its commits on the working branch, and `/finish-epic` its epic-branch
   sync and closing commit. It does **not** authorize unrelated commits or merges.
   Outside of an invoked workflow, make the changes and let the user decide when to
   commit — never do it on your own initiative.
6. **Local-only.** This project has no remote: never add one, push, or publish
   anything (issues, code, PRs) to an external service unless the user asks.
7. **Never commit secrets or credentials.** Keep them in gitignored `.env` files
   and provide a `.env.example` with placeholder values.
8. **Language.** All artifacts — code, comments, commit messages, branch names,
   issues, PRs, and documentation — are written in English unless the user
   explicitly asks otherwise. Reply to the user in the language they write in.

Platform-specific behavior (slash commands vs. natural language, model strategy)
lives in each agent's entry file, not here.
