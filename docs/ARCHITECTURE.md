# Architecture

Proof of concept of a **Text-to-SQL chatbot**: the user asks a question in natural
language and gets back insights — a short narrative, a table, and a chart — computed
from data stored in SQLite. The app is **domain-agnostic**: everything it knows about
the data comes from metadata tables, never from code.

Local-only POC: runs on `localhost`, no deployment, no CI.

## Project type

Full-stack web application, as an npm-workspaces monorepo:

```
backend/    Fastify API (TypeScript, runs natively on Node 24)
frontend/   Vue 3 SPA (TypeScript, Vite, SCSS)
data/       SQLite files — generated, gitignored
docs/       this file
```

In dev, Vite serves the frontend and proxies `/api` to the backend. One command
(`npm run dev`) starts both.

### Scaffold baseline and build order

The scaffold is only a runnable baseline with no features: `GET /api/health` opens
`app.db` and reports the SQLite version, and the frontend shows that status. Everything
described below is built **incrementally, one small issue per feature**, and each issue
brings its own dependencies, config variables, and tests. Sections marked *(later issue)*
are design decisions, not scaffolded code.

## Components

### Data (SQLite)

Two database files, kept apart on purpose:

| File | Contents | Access from the app |
|---|---|---|
| `data/data.db` | The dataset being queried **plus** its metadata tables | **Read-only** connection, opened at startup, for the catalog and every LLM-generated query. Written only by the seed script. |
| `data/app.db` | App state: conversations and their turns | Read-write, by the backend only |

Keeping them separate means a generated query can't read or touch app state.

**Metadata tables** (in `data.db`) describe the dataset for the LLM:

- `meta_tables` — `table_name`, `description` (what the table holds).
- `meta_columns` — `table_name`, `column_name`, `data_type`, `description` (meaning, units, how to aggregate).
- `meta_relationships` — `from_table`, `from_column`, `to_table`, `to_column`, `description`.

The schema context sent to the LLM is built only from these tables. A table without
a `meta_tables` row doesn't exist as far as the bot is concerned. All their columns are
`TEXT NOT NULL`, with the natural keys as primary keys and no foreign keys between them.
They are plain rowid tables, so readers return rows in load order.

**Catalog:** `readCatalog` (`backend/src/catalog.ts`) turns the metadata into what the bot
knows: the declared tables with their columns and indexes, and the relationships between
declared tables. Columns and relationships of undeclared tables are dropped. Indexes are
read from SQLite itself (`pragma_index_list` / `pragma_index_info`), automatic ones
included, not from the metadata; an expression part of an index shows as `(expression)`.
It's read on every request (no cache), so metadata edits show up without a restart, and it
throws if the metadata tables are missing.

The backend opens `data.db` read-only at startup: without the file it refuses to start
(not even `/api/health` answers) and its error says to run `npm run seed` first.

**Initial data:** `npm run seed` creates `data/data.db` with the metadata tables and a
small, fictitious sales dataset (`customers`, `products`, `orders` for 2024–2025) whose
only purpose is to exercise the pipeline.

- The demo lives in one file, `backend/src/demo-dataset.ts`: its schema, its rows and its
  metadata. It's the only code that knows those tables, and it's meant to be replaced.
  The seeding code itself (`backend/src/seed.ts`, `backend/src/metadata.ts`) is generic.
- Re-running the seed **recreates `data.db` from scratch**: anything in it is deleted,
  including data and metadata loaded by hand. The load runs in one transaction.
- Until the import feature exists, real data is loaded manually (e.g. DB Browser for
  SQLite) together with its metadata rows.

### Backend API (Fastify)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | none | Liveness check; reports the SQLite version of `app.db` (scaffold) |
| `GET` | `/api/catalog` | access key | What the bot can answer about: declared tables with their columns and indexes, and their relationships (see *Catalog* above). A read error is a standard `500` |
| `POST` | `/api/chat` | access key | `{ conversationId?, question }` → `{ conversationId, turnId, blocks, suggestions }` *(later issue)* |

The backend listens on `127.0.0.1:3000`; the Vite dev server (port 5173) proxies `/api` there.

**Auth**: a single shared access key (`APP_ACCESS_KEY` in `.env`).

- **Required:** without it, the backend refuses to start, with an error naming the variable.
- **Backend:** a deny-by-default `onRequest` hook protects every route (existing,
  future or unknown) except `/api/health`. It compares `Authorization: Bearer <key>` in
  constant time, before body validation. On failure it returns a generic `401` (Fastify's
  error format, with `WWW-Authenticate: Bearer`), so a route without the key answers `401`
  even if it doesn't exist.
- **Frontend:** asks for the key once, keeps it (trimmed) in `sessionStorage`, and sends it on
  every request through a single request function (`apiFetch` in `frontend/src/api.ts`).
  A `401` on any call forgets the key and goes back to the key screen with a "rejected"
  message, so callers never handle it. Other HTTP errors reject with an `ApiError` carrying
  the `status`; network errors propagate unchanged.
  `/api/health` is public, so a wrong key shows up on the first protected call: the
  catalog request the main screen makes on mount.

Enough for a local demo, not for real users (see deferred decisions).

### Text-to-SQL pipeline *(later issues)*

Each step is its own issue. The design:

1. **Classify** the question (Decisions API, `choices`) against the catalog and the recent
   turns: answerable from the data, needs clarification, or out of scope. Out-of-scope
   answers explain what data *is* available (from the catalog). Exact labels are defined
   in the issue.
2. **Build the schema context** from the metadata tables.
3. **Generate SQL** (Responses API, Structured Outputs) from the question, the schema
   context and the last turns of the conversation.
4. **Guard and execute** (`executeSql` in `backend/src/execute-sql.ts`, built). Safety is
   layered:
   - the query runs on a **read-only** connection — SQLite itself rejects any write;
   - a cheap check accepts exactly one statement starting with `SELECT` or `WITH`
     (also blocks `ATTACH`/`PRAGMA`, `CREATE TEMP TABLE`, and the extra statements
     `node:sqlite` would silently drop), so the LLM gets a clear error to fix. SQLite's
     own parser decides where the first statement ends (`sourceSQL`), so a `;` inside a
     string, a quoted identifier or a comment doesn't count;
   - a row cap of 500: a bigger result is rejected, not truncated, and reading stops at
     row 501. That bounds rows, not work: a query that must read everything before its
     first row (`ORDER BY`, `GROUP BY`, aggregates) still runs in full (see *Query
     timeout* in the deferred decisions). Value size isn't capped either: a value of
     hundreds of MB (e.g. `hex(zeroblob(300000000))`) can crash the Node process. Only
     values over SQLite's own 1 GB limit come back as an error.

   Rows come back as lists aligned with the column names, so duplicate names keep both
   values. Errors a rewritten query can fix are **returned** with a `kind` (`guard`,
   `sql`, `row_limit`) and a message for the LLM; anything else (a closed connection, a
   locked, corrupt or non-database file, a hot journal, I/O errors) is thrown. On a
   returned error the LLM retries with the message as feedback, up to a fixed retry
   budget.
5. **Build the insights** (Responses API, Structured Outputs). The LLM receives the
   question, the SQL, the column list and a sample of the rows, and returns **only**
   the narrative, a chart spec (`type`: bar/line/pie/doughnut, `x` column, `series`
   columns, title) and 3 follow-up suggestions. The **backend** builds the table and the
   chart data from the real result rows — the LLM never re-types data, so it can't
   invent numbers, and it saves tokens.
6. **Persist the turn** in `app.db` (question, classification, SQL, response, error, timing).

The response is a list of typed blocks the frontend renders in order:
`text` (markdown), `table` (columns + rows), `chart` (Chart.js-ready labels + datasets).

**Multi-turn:** each conversation keeps its turns in `app.db`; the last 5 turns
(question, SQL, narrative — not the data rows) go to the classify, SQL and insights steps,
so follow-ups like "and for last year?" work.

### LLM layer (OpenAI API) *(later issues)*

- **Responses API** for everything that generates text: SQL and insights. Structured
  Outputs (JSON schema) guarantee parseable responses — no "strip the markdown fence and
  hope" parsing.
- **Decisions API** for everything that picks from a fixed set: question classification
  and the judge's scores. It's fast and cheap (input tokens only). It's in **public beta**
  and returns no rationale.
- One SDK: the official `openai` package. If it lacks typed support for the Decisions beta,
  call the endpoint through the SDK's generic request method.
- All OpenAI calls live in one small module, so a beta API change touches one file.
  Pipeline functions receive the client as a parameter. **Tests never hit the network**:
  they pass a fake client.
- Model ids come from `.env` (`OPENAI_MODEL`), not from code.

### Evaluation (LLM-as-a-judge, offline) *(later issue)*

`npm run eval` runs a file of golden questions through the pipeline and scores each answer
with the Decisions API (`scores` against an ordered rubric, `predicates` for yes/no checks).
Example criteria: the SQL answers the question, the narrative is faithful to the data, and
the chart fits. It prints a summary and writes a JSON report (gitignored). It is **not**
part of the quality gate, because it costs money and isn't deterministic. Built in a later
issue.

### Frontend (Vue 3)

- Access-key screen first: it asks for the `APP_ACCESS_KEY` value from `.env` before
  showing anything else. Then the main screen: the backend health status and an
  `Available data` section (a native `<details>`, closed by default) that shows the
  catalog. The catalog is requested on mount, even while the section is closed.
- *(later issues)* The main screen gains the chat view: question input, conversation
  thread, and rendered blocks (markdown text, HTML table, chart).
- Plain components and composables: no router (two screens, switched by auth state),
  no state library, no UI kit. Styles in SCSS.
- Charts with Chart.js through vue-chartjs. The backend already sends Chart.js-shaped data.
- UI texts in English and hardcoded, no i18n. The bot answers in the language of the
  question.

### Observability

Fastify's built-in logger (pino), with one log line per pipeline step and its duration.
The persisted turns in `app.db` are the query log. Nothing else for a POC.

## Tech stack

| Component | Chosen technology | Reason |
|---|---|---|
| Runtime | Node.js 24 (`engines: >=24`) | Already installed; runs TypeScript natively and ships `node:sqlite` |
| Language | TypeScript (strict, erasable syntax only) | Types on the response contract and the LLM JSON. Erasable syntax lets Node run `.ts` directly, with no build step for the backend |
| Repo layout | npm workspaces | Built into npm. Two packages with one install and root scripts |
| Backend | Fastify | JSON-schema validation, logger, and `app.inject()` for tests are all built in |
| Database | SQLite via `node:sqlite` (built-in) | No dependency and no native compilation (Windows-safe). `readOnly` connections give a hard write guard |
| LLM | OpenAI API: Responses + Decisions, via `openai` SDK | Responses for generation with Structured Outputs; Decisions for classification and judging. The Decisions API isn't on Azure, so everything goes to the OpenAI API with one key |
| Frontend | Vue 3 + Vite | User's choice; Vite is the standard Vue toolchain |
| Styles | SCSS (`sass`, pure JS) | User's preference. Vite supports it natively; the pure-JS package avoids native binaries |
| Charts | Chart.js + vue-chartjs | Proven, light, and covers bar/line/pie/doughnut. Its config is easy to build from data |
| Env config | Node's built-in `--env-file-if-exists` | Reads the root `.env` without `dotenv` |
| Dev runner | `concurrently` (root dev dependency) | Starts backend and frontend with one cross-platform `npm run dev` |
| Tests | Vitest (+ `@vue/test-utils`, `jsdom` for the frontend) | Same runner for both packages; native TypeScript and Vite support |
| Coverage | `@vitest/coverage-v8` | V8 coverage built into Vitest, with enforced thresholds |
| Lint / format | ESLint (flat config, `typescript-eslint`, `eslint-plugin-vue`) + Prettier | Standard TS/Vue linting. Prettier keeps agent-written PRs free of style noise |
| Type check | `tsc --noEmit` (backend), `vue-tsc --noEmit` (frontend) | Node strips types without checking them, so type checking is part of the lint gate |

Each dependency is added by the first piece of work that uses it: the scaffold installs
only what the scaffold's code uses, and `openai`, `chart.js`/`vue-chartjs` and the
markdown renderer come with their issues.

## Quality gate

- **Coverage threshold:** 85% (default) for lines, statements, functions and branches.
  Excluded: entry points only (`backend/src/server.ts`, `frontend/src/main.ts`, scripts
  that just call tested functions) and type-only files.
- **Measured by:** Vitest with `@vitest/coverage-v8`. A root Vitest config runs both
  workspaces as projects and reports one combined coverage. The run fails if any metric
  is under the threshold.
- **Lint command:** `npm run lint` (ESLint + `prettier --check` + type check of both packages)
- **Test-with-coverage command:** `npm run test:coverage`
- These two commands are the whole gate: the project is local-only, so there's no CI. `/work-issue` runs them before every PR, and anyone checking a branch runs the same ones.
- Tests are offline and deterministic: SQLite runs in-memory or in temp files, and OpenAI is
  always a fake client. `npm run eval` (real LLM calls) is outside the gate.

## Configuration

Root `.env` (gitignored; placeholders in `.env.example`), loaded by Node's
`--env-file-if-exists`. `APP_ACCESS_KEY` (auth) is **required**: without it the backend
refuses to start. Each issue adds the variables it uses; still to come:
`OPENAI_API_KEY` / `OPENAI_MODEL` (LLM). Fixed for now, and
not configurable: the database paths (`data/app.db`, `data/data.db`, relative to the repo
root), the backend port (3000), and tuning values (retry budget, row cap, context turns).
They become config only when there's a reason.

## Deferred decisions

| Decision | Why not now |
|---|---|
| CSV/Excel import feature | Agreed for later. Data is loaded by hand for now. Excel will need a dependency (`exceljs`) when it comes |
| Azure OpenAI | The Decisions API has no confirmed Azure availability. Moving Responses is a `baseURL` change; revisit when Decisions lands on Azure |
| Online judge (scoring every answer live) | The offline eval measures quality without adding latency or cost to each chat |
| Judge rationale via the Responses API | Decisions gives scores without a "why". Add explanations for low scores only if the scores alone aren't enough |
| Real authentication / users | Local POC: a shared key is enough |
| Query timeout / worker thread | `node:sqlite` is synchronous, so a slow query blocks the server. That's fine for one user on a small dataset; move execution to a worker if it bites |
| Standard prompts with pre-validated SQL, feedback buttons, CSV download | Features from the reference project. Not needed to prove the concept |
| Streaming responses | Adds complexity on both ends. Fine to wait for the full answer in a POC |
| UI kit (e.g. PrimeVue DataTable) | Plain HTML tables are enough. Revisit if tables need sorting, paging or export |
| Router, state library, i18n | Two screens, little shared state, English-only UI |
| Docker / docker-compose | SQLite is a file and nothing else needs a container. Docker isn't installed either |
| Deployment | Local-only |
