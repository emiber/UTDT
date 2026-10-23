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
suggestions you can click. A message that asks for separate results ("the top 5 customers
and, separately, the top 3 products") gets a section for each, with its own text, table and
chart. A greeting, a vague question or an off-topic one gets a short
text reply instead, with no query run. Follow-ups like "and for last year?" use the last
turns of the conversation, which is saved in `data/app.db`; reloading the page starts a
new one. The chat is at `/chat`; `/usage` shows how much the LLM is used: calls, tokens,
time and an estimated cost, by hour, day, week or month, filtered by model and step. The
links in the header switch between them, and the chat keeps its conversation.
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
example `OPENAI_PRICES=gpt-5.4-mini=0.75/4.5,gpt-6-luna=0.1/0`. Without it the report shows
tokens and times but no cost; a malformed value stops the backend at startup, naming the
variable. To fill it in or refresh it with OpenAI's current prices, run:

```bash
npm run prices
```

It reads [OpenAI's pricing page](https://developers.openai.com/api/docs/pricing) and
rewrites only the `OPENAI_PRICES` line of your `.env`. It sets the Standard prices of
`OPENAI_MODEL`, `OPENAI_DECISIONS_MODEL` and any model already in the list. The Decisions
model gets an output price of 0, because the Decisions API charges input tokens only. If
the page doesn't list a model, the command warns and leaves that model's price as it was.
Restart the backend afterwards so it picks up the new prices.

`npm run seed` loads a small, fictitious sales dataset (customers, products with their price
and cost, orders for 2024–2025, and monthly sales targets per category) and the metadata
that describes it to the bot (see *Data* in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).
It's **required before `npm run dev`**: without `data/data.db` the backend refuses to start
(not even `/api/health` answers) and its error says to run the seed. Two warnings:

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
the real pipeline, checks how each one was classified, and has OpenAI's Decisions API judge
each answer to a data question and the language of each text reply to any other message. No
server or access key needed.

- **A golden case** is an `id` and a `question`, plus two optional fields:
  `classification`, the label the message should get (`data_question` by default,
  `conversation`, `needs_clarification` or `out_of_scope`), and `history`, earlier turns
  written by hand (`question`, and optionally `sql` and `narrative`) for a follow-up such as
  "and in 2024?". Only the last message runs; the history is context for the pipeline and
  the judge. A bad label or history stops the eval before any OpenAI call.
- **Requirements:** `npm run seed`, and a `.env` with a real `OPENAI_API_KEY`, `OPENAI_MODEL`
  and `OPENAI_DECISIONS_MODEL` (today the Decisions API only supports `gpt-6-luna`). If
  something is missing it says what and exits without calling OpenAI.
- **It costs money:** each data question is a full pipeline run (a classification, then the
  SQL and insights calls) plus two judge calls, one for the answer and one for its language;
  any other message is a classification, a text reply and one judge call for its language.
  That's why it runs by hand and isn't part of the quality gate.
- **Output:** one line per question, a summary, and a JSON report in `data/eval/`
  (gitignored) with every answer, label and score.
- **The classification** is compared with the expected label: each line starts with
  `classification ok`, or the expected and the actual label when they differ. A message
  that expects another label than `data_question` counts as *with another label*: only the
  language of its text reply is judged. The summary
  adds `Classification: <correct>/<compared> correct (<n> without a label)`; *without a
  label* means the classifier failed, and errors stay out of the count.
- **Reading the summary:** it shows values, not a verdict. *The SQL answers the question*
  and *the narrative is faithful to the data* are averages from 0 to 2 (2 is best); *the
  chart fits* is an average probability, only over answers with a chart. *The answer is in
  the language of the message* is an average probability too, over the data answers and the
  text replies: everything the bot wrote (texts, column names and titles) should be in the
  language of the last message, whatever the language of the earlier turns. An answer with
  several results is judged as a whole. The counts say how
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
                usage-route.ts, prices.ts), price refresh (update-prices.ts, prices-cli.ts),
                offline evaluation (evaluate.ts, eval-command.ts, eval-cli.ts), test helpers
                (testing/)
backend/eval/   golden questions for `npm run eval`
frontend/src/   Vue app (App.vue), routes (router.ts), API client (api.ts), access-key state
                (auth.ts), components (components/: key screen, backend status, data
                catalog, chat view, its block renderer and the chart, usage report),
                styles (styles/)
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
