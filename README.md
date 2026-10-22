# UTDT — Text-to-SQL chatbot (POC)

A proof of concept of a chatbot that answers natural-language questions about data stored
in SQLite with insights: a short narrative, a table, and a chart. Under the hood it
translates the question into SQL with an LLM (OpenAI), runs it on a read-only connection,
and turns the result into a structured answer. The app is domain-agnostic: it learns
what the data means from metadata tables.

**Status:** early POC. `npm run seed` loads a demo dataset, and the API is protected by a
shared access key. The frontend first asks for that key (the `APP_ACCESS_KEY` value from
your `.env`), then shows the backend status, an `Available data` section with the tables,
columns, relationships and indexes the bot knows about, and the chat: ask a question and
get a narrative, a table and, when it helps, a chart of real data, with follow-up
suggestions you can click. A greeting, a vague question or an off-topic one gets a short
text reply instead, with no query run. Follow-ups like "and for last year?" use the last
turns of the conversation, which is saved in `data/app.db`; reloading the page starts a
new one. The `Usage` button shows how much the LLM is used: calls, tokens, time and an
estimated cost, by hour, day, week or month, filtered by model and step.
Features are built one small issue at a time; see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
for the design and the decisions behind it.

## Stack

Node.js 24 + TypeScript · Fastify · SQLite (`node:sqlite`) · Vue 3 + Vite + SCSS ·
Vitest · ESLint + Prettier. npm workspaces: [backend/](backend/) and [frontend/](frontend/).

## Getting started

Prerequisites: **Node.js 24.15+** (it runs the backend's TypeScript natively and ships SQLite;
24.15 adds the SQLite limits the backend relies on).

```bash
npm install
git config core.hooksPath .githooks   # once per clone: activates the local main guard
cp .env.example .env                  # in the repo root; then set the three variables in .env
npm run seed                          # creates data/data.db with the demo dataset
npm run dev
```

`APP_ACCESS_KEY` is the shared key that protects the API: every route except
`/api/health` requires `Authorization: Bearer <key>`. It's **required**: without it (no
`.env`, or the variable empty) the backend refuses to start and says which variable is
missing. Replace the placeholder with a random value: the backend also refuses to start if
it still has the one from `.env.example`. For example:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

`OPENAI_API_KEY`, `OPENAI_MODEL` and `OPENAI_DECISIONS_MODEL` are required too: the
backend builds the OpenAI clients at startup and refuses to start without any of them,
naming the missing one. The key is used for every OpenAI call. `OPENAI_MODEL` must
support Structured Outputs in the Responses API (e.g. `gpt-5.4-mini`), and
`OPENAI_DECISIONS_MODEL` is the Decisions API model that classifies each question (today
only `gpt-6-luna`).

`OPENAI_PRICES` is optional: the price of each model, so the usage report can estimate
the cost. It's comma-separated `model=input/output` entries in USD per million tokens, for
example `OPENAI_PRICES=model-a=0.25/2,model-b=1.25/10`; use OpenAI's current prices.
Without it the report shows tokens and times but no cost; a malformed value stops the
backend at startup, naming the variable.

`npm run seed` loads a small, fictitious sales dataset and the metadata that describes it
to the bot (see *Data* in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). It's **required
before `npm run dev`**: without `data/data.db` the backend refuses to start (not even
`/api/health` answers) and its error says to run the seed. Two warnings:

- Running it again **recreates `data/data.db` from scratch**: everything in it is deleted,
  including data loaded by hand.
- **Stop the backend before re-seeding.** The backend keeps `data.db` open while it runs,
  and on Windows the seed then fails with a permission error.

`npm run dev` starts both packages:

- Frontend: <http://localhost:5173>. Vite proxies `/api` to the backend.
- Backend: <http://127.0.0.1:3000/api/health>

The app database is created on first start at `data/app.db` (gitignored). Configuration
lives in the root `.env` (gitignored); [.env.example](.env.example) lists every variable
with a placeholder. When a feature adds one, copy it over to your `.env`.

## Evaluating answers (LLM-as-a-judge)

```bash
npm run eval
```

It runs the golden questions in [backend/eval/golden.json](backend/eval/golden.json) through
the real pipeline and has OpenAI's Decisions API judge each answer. No server or access key
needed.

- **Requirements:** `npm run seed`, and a `.env` with a real `OPENAI_API_KEY`, `OPENAI_MODEL`
  and `OPENAI_DECISIONS_MODEL` (today the Decisions API only supports `gpt-6-luna`). If
  something is missing it says what and exits without calling OpenAI.
- **It costs money:** each question is a full pipeline run (a classification, then the SQL
  and insights calls) plus one judge call. That's why it runs by hand and isn't part of the
  quality gate.
- **Output:** one line per question, a summary, and a JSON report in `data/eval/`
  (gitignored) with every answer and score.
- **Reading the summary:** it shows values, not a verdict. *The SQL answers the question*
  and *the narrative is faithful to the data* are averages from 0 to 2 (2 is best); *the
  chart fits* is an average probability, only over answers with a chart. The counts say how
  many questions had no answer, errored, or had a criterion refused or not applicable, and
  those stay out of the averages. Scores vary between runs: read them as a trend, for example
  before and after changing a prompt.

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
                seed.ts), demo data (demo-dataset.ts), data catalog (catalog.ts), guarded
                SQL execution (execute-sql.ts), OpenAI client (llm.ts), prompt templates
                (prompts/, prompts.ts), schema context (schema-context.ts), message
                classification (classify.ts), text-only replies (reply.ts), SQL generation
                with retries (generate-sql.ts), insights (insights.ts), charts (chart.ts),
                the pipeline (pipeline.ts), the chat route (chat.ts), conversations, turns
                and their LLM calls (conversations.ts), the usage report (usage.ts,
                usage-route.ts, prices.ts), offline evaluation (evaluate.ts,
                eval-command.ts, eval-cli.ts), test helpers (testing/)
backend/eval/   golden questions for `npm run eval`
frontend/src/   Vue app (App.vue), API client (api.ts), access-key state (auth.ts),
                components (components/: key screen, backend status, data catalog, chat
                view, its block renderer and the chart, usage report), styles (styles/)
data/           SQLite files, generated and gitignored
docs/           ARCHITECTURE.md: design, stack, quality gate, deferred decisions
issues/         local issue tracker (Markdown files): pending ones here, closed ones in
                issues/completed/
workflow/       AI-assisted workflow guides
```

## Workflow

This project uses an AI-assisted, local-only workflow: issues are Markdown files under
`issues/` (written in Spanish), and every change goes on its own branch. The agent commits
it and merges it once the quality gate and the self-review pass. Use `/create-issue`,
`/refine-issue <n>` and `/work-issue <n>`. Full details:
[workflow/README.md](workflow/README.md).
