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
npm run dev
```

`npm run dev` starts both packages:

- Frontend: <http://localhost:5173>. Vite proxies `/api` to the backend.
- Backend: <http://127.0.0.1:3000/api/health>

The app database is created on first start at `data/app.db` (gitignored). No `.env` is
needed yet. When a feature needs configuration, it adds the variables to
[.env.example](.env.example); copy that file to `.env` and fill it in.

## Quality gate

There's no CI: these two commands are the whole gate. Run them before opening a PR.

```bash
npm run lint            # ESLint + Prettier check + type check of both packages
npm run test:coverage   # Vitest for both packages; fails under 85% coverage
```

`npm run format` fixes formatting, and `npm test` runs the tests without coverage.

## Project layout

```
backend/src/    Fastify app (app.ts), entry point (server.ts), SQLite helpers (db.ts)
frontend/src/   Vue app (App.vue), API client (api.ts), styles (styles/)
data/           SQLite files, generated and gitignored
docs/           ARCHITECTURE.md: design, stack, quality gate, deferred decisions
issues/         local issue tracker (Markdown files)
workflow/       AI-assisted workflow guides
```

## Workflow

This project uses an AI-assisted, local-only workflow: issues are Markdown files under
`issues/`, and every change ends as a local branch left unmerged for review. Use
`/create-issue`, `/refine-issue <n>` and `/work-issue <n>`. Full details:
[workflow/README.md](workflow/README.md).
