# UTDT — Text-to-SQL chatbot (POC)

A proof of concept of a chatbot that answers natural-language questions about data stored
in SQLite with insights: a short narrative, a table, and a chart. Under the hood it
translates the question into SQL with an LLM (OpenAI), runs it on a read-only connection,
and turns the result into a structured answer. The app is domain-agnostic: it learns
what the data means from metadata tables.

**Status:** runnable scaffold. The backend has a health endpoint and the frontend shows
its status. Features are built one small issue at a time; see
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design and the decisions behind it.

## Stack

Node.js 24 + TypeScript · Fastify · SQLite (`node:sqlite`) · Vue 3 + Vite + SCSS ·
Vitest · ESLint + Prettier. npm workspaces: [backend/](backend/) and [frontend/](frontend/).

## Getting started

Prerequisites: **Node.js 24+** (it runs the backend's TypeScript natively and ships SQLite).

```bash
npm install
git config core.hooksPath .githooks   # once per clone: activates the local main guard
cp .env.example .env                  # in the repo root; then set APP_ACCESS_KEY in .env
npm run seed                          # creates data/data.db with the demo dataset
npm run dev
```

`APP_ACCESS_KEY` is the shared key that protects the API: every route except
`/api/health` requires `Authorization: Bearer <key>`. It's **required**: without it (no
`.env`, or the variable empty) the backend refuses to start and says which variable is
missing. Replace the placeholder with a random value, for example:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`npm run seed` loads a small, fictitious sales dataset and the metadata that describes it
to the bot (see *Data* in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). Two warnings:

- Running it again **recreates `data/data.db` from scratch**: everything in it is deleted,
  including data loaded by hand.
- **Stop the backend before re-seeding.** Once the backend reads `data.db`, it keeps the
  file open, and on Windows the seed then fails with a permission error.

`npm run dev` starts both packages:

- Frontend: <http://localhost:5173>. Vite proxies `/api` to the backend.
- Backend: <http://127.0.0.1:3000/api/health>

The app database is created on first start at `data/app.db` (gitignored). Configuration
lives in the root `.env` (gitignored); [.env.example](.env.example) lists every variable
with a placeholder. When a feature adds one, copy it over to your `.env`.

## Quality gate

There's no CI: these two commands are the whole gate. Run them before opening a PR.

```bash
npm run lint            # ESLint + Prettier check + type check of both packages
npm run test:coverage   # Vitest for both packages; fails under 85% coverage
```

`npm run format` fixes formatting, and `npm test` runs the tests without coverage.

## Project layout

```
backend/src/    Fastify app (app.ts), entry points (server.ts, seed-cli.ts), access-key check
                (auth.ts), SQLite helpers (db.ts), metadata tables and seeding (metadata.ts,
                seed.ts), demo data (demo-dataset.ts)
frontend/src/   Vue app (App.vue), API client (api.ts), styles (styles/)
data/           SQLite files, generated and gitignored
docs/           ARCHITECTURE.md: design, stack, quality gate, deferred decisions
issues/         local issue tracker (Markdown files)
workflow/       AI-assisted workflow guides
```

## Workflow

This project uses an AI-assisted, local-only workflow: issues are Markdown files under
`issues/` (written in Spanish), and every change goes on its own branch. The agent commits
it and merges it once the quality gate and the self-review pass. Use `/create-issue`,
`/refine-issue <n>` and `/work-issue <n>`. Full details:
[workflow/README.md](workflow/README.md).
