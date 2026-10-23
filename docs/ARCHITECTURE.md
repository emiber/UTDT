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
| `data/app.db` | App state: conversations, their turns, and each turn's calls to the LLM | Read-write, by the backend only |

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
| `GET` | `/api/catalog` | access key | What the bot can answer about: declared tables with their columns and indexes, and their relationships (see *Catalog* above). A read error is a generic `500` |
| `POST` | `/api/chat` | access key | `{ conversationId?, question }` → `{ conversationId, turnId, blocks, suggestions }`: runs the pipeline below and saves the turn (see *Chat endpoint*) |
| `GET` | `/api/usage` | access key | `?from&to&granularity&tz[&model][&step]` → the LLM usage report of a period: totals, series, breakdown, top turns (see *Usage report*) |

The backend listens on `127.0.0.1:3000`; the Vite dev server (port 5173) proxies `/api` there.

**Errors:** a server error (a `5xx`, or an error without a status) is logged with its
detail, and the client gets a generic `500` in Fastify's error format, with the message
`Something went wrong on the server.`, so a SQLite message never reaches it. Client
errors (a `400` from validation, a `404`, the `401` of the access key) keep Fastify's
format and message. `POST /api/chat` answers its own `502` and `500` (see *Chat endpoint*).

**Auth**: a single shared access key (`APP_ACCESS_KEY` in `.env`).

- **Required:** without it, or with the placeholder from `.env.example` still in place, the
  backend refuses to start, with an error naming the variable.
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

### Text-to-SQL pipeline

Each step is its own issue. The design:

1. **Classify** the message (`classifyQuestion` in `backend/src/classify.ts`): one Decisions
   API `choice` question over the schema context, the recent turns and the message, with
   four labels — `data_question`, `conversation` (greetings, thanks, questions about the
   bot), `needs_clarification` (about the data but too vague) and `out_of_scope`.
   - Anything but a data question gets a **text-only reply** (`buildReply` in
     `backend/src/reply.ts`, Responses API, Structured Outputs), in the language of the
     message and with no figures: a greeting is returned with a sentence on what data is
     available, a vague question gets the one question that would make it answerable, an
     off-topic one gets what can be asked. Three suggestions the data can answer. No SQL
     runs.
   - A follow-up that asks to show, chart, filter or redo an earlier answer ("show it as a
     chart", "and for last year?") is a data question, not conversation.
   - A label other than `data_question` with confidence under 0.5 counts as a data
     question: better to try the data than to refuse unsure.
   - The reply prompt knows that data answers come with tables and charts, so it never
     says the bot can't show them, and it doesn't offer exports.
   - If the Decisions API fails, a warning is logged and the message goes down the data
     path, as before the classifier existed.
2. **Build the schema context** from the metadata tables (`buildSchemaContext` in
   `backend/src/schema-context.ts`, on top of the catalog): tables, columns and
   relationships in load order, without indexes or rows. It's built before the
   classification, which gets it too.
3. **Generate SQL** (Responses API, Structured Outputs) from the question, the schema
   context and the last turns of the conversation (`generateSql` in
   `backend/src/generate-sql.ts`; see *Multi-turn*). The output is a strict
   `{ language, queries }` object (see *Language* in step 5), where `queries` has 1 to **5**
   items, each `{ title, sql }`; only the queries go on to step 4, as they are.
   - **Usually one query.** The prompt asks for several only when the message asks for
     separate results that don't fit in one table ("the top 5 customers and, separately,
     the top 3 products"), one query per result. A comparison or a breakdown that fits in
     one table is still one query, and different lists are never joined into one table
     with `UNION`: that is what the bot did before it could write several queries. Each
     title is short and in the language of the question.
   - **The retry loop:** generate → execute → retry. Every query of an attempt runs through
     step 4, so the next request hears about all the ones that failed. If any query
     returns an error, the whole set is written again, with the SQL and message of every
     query that failed in every failed attempt, up to **3 attempts in total**; after that
     the first failed query of the last attempt is returned (its `kind` and message; the
     SQL is every query's). There are no partial answers.
   - OpenAI failures, refusals, incomplete responses and a malformed set (no queries,
     more than 5, one without SQL or without a title) are thrown, not retried (the SDK
     already retries transient ones). Each attempt logs one line per step with its
     duration and result, with one numbered `execute_sql` line per query.

   The prompt asks for a short, readable alias for every result column, in the language of
   the question (`AS "Precio unitario"`, never `SELECT *`): the table headers, the chart
   labels and the narrative all use those names. A follow-up that only asks to show,
   chart, sort or redo an earlier answer gets the latest queries of the conversation again
   (only the one it names, if it names one), changed only as asked.
4. **Guard and execute** (`executeSql` in `backend/src/execute-sql.ts`). Safety is layered:
   - the query runs on a **read-only** connection — SQLite itself rejects any write;
   - a cheap check accepts exactly one statement starting with `SELECT` or `WITH`
     (also blocks `ATTACH`/`PRAGMA`, `CREATE TEMP TABLE`, and the extra statements
     `node:sqlite` would silently drop), so the LLM gets a clear error to fix. SQLite's
     own parser decides where the first statement ends (`sourceSQL`), so a `;` inside a
     string, a quoted identifier or a comment doesn't count;
   - a row cap of 500: a bigger result is rejected, not truncated, and reading stops at
     row 501. That bounds rows, not work: a query that must read everything before its
     first row (`ORDER BY`, `GROUP BY`, aggregates) still runs in full (see *Query
     timeout* in the deferred decisions);
   - a cap of 1,000,000 bytes per value, UTF-8 for text (`MAX_VALUE_LENGTH`, SQLite's
     `limits.length` on the read-only connection): a bigger string or blob, stored or
     computed, fails with `string or blob too big`, a `sql` error the LLM can fix (`printf`
     returns `NULL` instead). Without it, a value of hundreds of MB (e.g.
     `hex(zeroblob(300000000))`) stays under SQLite's own 1 GB limit and crashes the Node
     process. The cap is per value: the total size of a response is bounded only by the
     row cap, which is per query: a turn can come back with up to 5 × 500 rows.

   Every query of a turn goes through these checks on its own.

   Rows come back as lists aligned with the column names, so duplicate names keep both
   values. Errors a rewritten query can fix are **returned** with a `kind` (`guard`,
   `sql`, `row_limit`) and a message for the LLM; anything else (a closed connection, a
   locked, corrupt or non-database file, a hot journal, I/O errors) is thrown. On a
   returned error the LLM retries with the message as feedback (step 3).
5. **Build the insights** (Responses API, Structured Outputs; `buildInsights` in
   `backend/src/insights.ts`). The LLM receives the question, the earlier turns of the
   conversation (see *Multi-turn*) and, for each result, its SQL, the column list, the
   first 50 rows and the total row count (plus its title when there are several results).
   It returns **only** (after a leading `language` field, see below) a **section per
   result**, in the same order — a narrative (markdown) and a chart spec or `null`
   (`type`: bar/line/pie/doughnut, `x` column, `series` columns, title) — and exactly 3
   follow-up suggestions for the whole answer, all in the language of the question. The
   schema fixes the number of sections to the number of results, and the code checks it
   again: a different number is an `LlmError`. The prompt asks for `null` when a result
   can't be charted or a chart adds nothing (e.g. one or two rows), and for a chart
   whenever the question asks for one and the result can be charted; when it can't, the
   narrative says so. The **backend** builds the table and the chart data from the real
   result rows — the LLM never re-types data, so it can't invent numbers, and it saves
   tokens. With 0 rows there's no table and no chart, and a single value (1 row × 1
   column) goes without a table: the narrative already says it. So an answer is always
   text, plus a table and a chart when they add something.

   **Several results:** each query's result is a section of the answer, in order: a text
   block, its table and its chart, all built from that result's own columns and rows. A
   chart that doesn't fit is dropped alone, and a section with no rows keeps only its text.
   With two or more results each text block starts with `### <title>` (the title on one
   line); with one result there's no heading, so those answers are as they always were.
   The frontend draws the blocks in order, so it needed no change.

   `buildChart` (`backend/src/chart.ts`) checks the spec against the result: the result has
   rows; `x` and each series name exactly one result column (a repeated name doesn't);
   `series` isn't empty and doesn't include `x`; every series value is a number or `null`;
   `pie`/`doughnut` take exactly one series. A spec that fails is dropped with a warning
   in the log (its reason, not the rows): the answer comes out without a chart, and the
   insights call isn't retried. Rows keep their SQL order: nothing is grouped, sorted or
   cut.

   **Language:** the SQL (step 3), the insights and the text-only reply (step 1) each start
   their output with a `language` field, the language of the current message, and write
   the rest in it: the query titles, the column aliases, the narratives, the suggestions,
   the chart titles. The
   value isn't used. Without it, earlier turns in another language pulled the answer into
   theirs: in a Spanish conversation, an English question got Spanish column names and a
   Spanish answer, even with a prompt rule against it.
6. **Persist the turn** in `app.db` (question, SQL, narrative, response, error, timing,
   classification). Failed turns are saved too, so the turns are the query log. An older
   `app.db` gets the `classification` column and the `llm_calls` table added at startup,
   keeping its turns. A turn with several results keeps every query's SQL in `sql`, one
   after the other with a blank line between them, and every text block (headings
   included) in `narrative`; the history sends both to the next turn, so a follow-up sees
   the whole answer. The schema doesn't change.

   With the turn, in the same transaction, go its calls to the LLM, one row each in
   `llm_calls`: `turn_id`, `step` (`classify`, `sql`, or `answer` for the insights or the
   text reply), `attempt` (1 to 3 for `sql`, 1 otherwise), `model`, `duration_ms` (the call
   only, the SDK's retries included, not the SQL execution) and the `input_tokens` and
   `output_tokens` OpenAI reports. A call that gets no response (a timeout, an API error)
   keeps its time with the tokens empty; a refusal or an incomplete response keeps the
   tokens OpenAI reports. A failed turn keeps the calls it made. `requestStructured`
   and `requestDecision` measure each call and pass it to an `onLlmCall` callback; each
   step tags its own, and the chat route collects them. Totals per turn and step:

   ```sql
   SELECT turn_id, step, COUNT(*) AS calls, SUM(duration_ms) AS ms,
          SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens
   FROM llm_calls
   GROUP BY turn_id, step;
   ```

Steps 1–5 run in `answerQuestion` (`backend/src/pipeline.ts`), with no HTTP or `app.db`,
so the offline evaluation can reuse it. Its result is a data answer (`kind: 'data'`), a
text reply (`kind: 'reply'`) or the reason every SQL attempt failed, each with the
classification. A data answer also carries each result with its title, SQL, columns, rows
and checked chart spec (or `null`), which the HTTP response leaves out. When every SQL
attempt fails it returns why
(without insights); anything it throws is a `PipelineError` whose `cause` is the original
error (an `LlmError` for OpenAI failures) and which keeps the final SQL, if any.

The response is a list of typed blocks the frontend renders in order:

```ts
type Block =
  | { type: 'text'; markdown: string }
  | { type: 'table'; columns: string[]; rows: (string | number | null)[][] }
  | {
      type: 'chart';
      chartType: 'bar' | 'line' | 'pie' | 'doughnut';
      title: string;
      labels: string[]; // the x column's values as text, in row order
      datasets: { label: string; data: (number | null)[] }[]; // one per series column
    };
```

Table rows are lists aligned with `columns`, in `SELECT` order, so repeated column names
keep their values; `NULL` is `null`. A result's chart block comes right after its table.
Its `labels` and `datasets` are Chart.js's `data` shape; the frontend adds the colors.

**Chat endpoint** (`POST /api/chat`, `backend/src/chat.ts`):

- The body is validated (`question` with at least one non-space character; `conversationId`
  a non-empty string), with no type coercion: anything else is a `400`. Coercion is off
  app-wide, so future querystring or params schemas must use `type: 'string'` and parse by
  hand. An unknown `conversationId` is a `404`. Neither calls OpenAI or saves anything.
- Without a `conversationId` it starts a new conversation (the backend makes the id).
- `200`: `blocks` = `[text, table]` (`[text]` with 0 rows or a single value), plus a
  `chart` block after the table when the LLM's spec fits the result, and 3 `suggestions`.
  A message that asks for separate results repeats that group once per result, in order:
  `[text, table, chart, text, table]` for two. A message that isn't a data question:
  `[text]` and 3 suggestions. When every SQL attempt fails:
  `200` with one fixed English `text` block and no suggestions.
- `502` when an OpenAI call fails (API, network, refusal, incomplete output) and `500` on
  an unexpected error, both with a generic message in Fastify's error format; the detail
  goes to the log and the saved turn. A new conversation is created with that turn, but its
  id doesn't come back.
- A failure to read the conversation or to save the turn is a `500` with a generic message,
  and saves nothing: those are the only failures after body validation that leave no turn.

**Multi-turn:** each conversation keeps its turns in `app.db`; the last 5 turns
(question, SQL, narrative — every query and text of the turn, but not the data rows, chart
or suggestions) go to the
classification, SQL, insights and reply steps, so follow-ups like "and for last year?"
work.

- `loadHistory` (`backend/src/conversations.ts`) reads them oldest first, before the
  current turn is saved, so a question is never its own history. A new conversation (no
  `conversationId`) has none.
- A failed turn goes with its question only: its last SQL is known to be broken, and its
  saved text is an error or the fixed "couldn't answer" message. It still takes a place in
  the window.
- The prompts render the history from one partial, `prompts/history.liquid`, as context to
  resolve references in the current question. The classification, the reply, every SQL
  attempt and the insights get it. Fields a turn doesn't have are left out.
- The window of 5 is a constant: no summarizing or truncation. A reload starts a new
  conversation, because the frontend keeps the id only in memory.

### LLM layer (OpenAI API)

- **Responses API** for everything that generates text: SQL, insights and the text-only
  reply. Structured Outputs (JSON schema) guarantee parseable responses — no "strip the
  markdown fence and hope" parsing.
- **Decisions API** for everything that picks from a fixed set: question classification
  and the judge's scores. It's fast and cheap (input tokens only). It's in **public beta**
  and returns no rationale.
- One SDK: the official `openai` package, which types the Decisions beta
  (`decisions.create`). `createDecisionClient` builds its client from `OPENAI_API_KEY` and
  its own model variable, `OPENAI_DECISIONS_MODEL` (the beta supports only `gpt-6-luna`
  today), and `requestDecision` returns the answers in question order, as they come; any
  of them can be a `refusal`. Failures are `LlmError`s too. The fake for tests is
  `fakeDecisions` in `backend/src/testing/fake-llm.ts`.
- All OpenAI calls live in one small module (`backend/src/llm.ts`), so a beta API change
  touches one file. `createLlmClient` builds the client from `OPENAI_API_KEY` and
  `OPENAI_MODEL` and throws naming a missing variable; `requestStructured` makes one
  Structured Outputs request and returns the parsed object. Every failure (API or network
  errors after the SDK's retries, a refusal, an incomplete response, output that isn't a
  JSON object) is thrown as an `LlmError`, which the chat endpoint maps to a `502`; raw SDK
  errors never escape. Each request carries its whole context, so the response doesn't
  need to be stored (`store: false`). Pipeline functions receive the client as a
  parameter. **Tests never hit the network**: they pass the fake client in
  `backend/src/testing/fake-llm.ts`.
- **Timeouts:** both clients share one SDK instance setup (`createOpenAI`): 30 s per
  attempt (`REQUEST_TIMEOUT_MS`) and one retry (`MAX_RETRIES`), instead of the SDK's 10
  minutes and 2 retries. A request that hangs gives up after about a minute, as an
  `LlmError`. A chat request makes at most 5 calls in series (the classification, up to 3
  SQL attempts and the insights), so the backend's worst case is about 5 × 2 × 30 s =
  300 s, plus the SDK's wait before each retry (0.5 s, or the API's `Retry-After`, up to
  60 s). The frontend waits 6 minutes (see *Frontend*). The SQL itself has no timeout (see
  *Query timeout* in the deferred decisions).
- Prompts are LiquidJS templates in `backend/src/prompts/*.liquid`, apart from the code,
  rendered by `renderPrompt` (`backend/src/prompts.ts`). Questions, earlier turns, SQL
  and errors go in as template variables, and HTML escaping stays off (LiquidJS's default),
  so they reach the LLM literally. The history is one partial, `history.liquid`, that the
  classify, reply, SQL and insights user prompts include with `{% render %}`.
- Model ids come from `.env` (`OPENAI_MODEL`, `OPENAI_DECISIONS_MODEL`), not from code.

### Evaluation (LLM-as-a-judge, offline)

`npm run eval` (`backend/src/eval-command.ts`, `evaluate.ts`) runs the golden questions in
`backend/eval/golden.json` (for the demo dataset) through the pipeline in process — no
server, no access key, nothing written to `app.db` — compares each message's classification
with the expected one, and has the Decisions API judge each answer to a data question and
the language of each text reply to any other message. It is **not** part of the quality
gate, because it costs money and isn't deterministic.

- **A golden case** is an `id`, a `question`, and two optional fields:
  - `classification` — the expected label, one of the classifier's four; `data_question`
    when missing;
  - `history` — earlier turns written by hand, oldest first, in the pipeline's
    `HistoryTurn` shape (`question`, optional `sql` and `narrative`), copied from a real
    run. It's passed to `answerQuestion` as is; only the last message runs. Empty or
    missing means a new conversation.
- **Before the first OpenAI call** it checks `OPENAI_API_KEY`, `OPENAI_MODEL`,
  `OPENAI_DECISIONS_MODEL`, the golden file (including each label and history turn) and
  `data/data.db`. A problem prints why, naming the case, and exits 1, with no report.
- **The classification** compared is the pipeline's final label, after its low-confidence
  fallback: the data answer and the failed SQL carry `data_question` (or null), the text
  reply its own label. Equal → *correct*, different → *incorrect*, null (the classifier
  failed) → *without a label*. A case that errors stays out of the count.
- **What gets judged:** an answer of the kind the case expects. A data answer to a case
  that expects `data_question` is judged on every criterion below. Such a case that gets a
  text reply or fails every SQL attempt is *without an answer*, as below. A case that
  expects another label counts as *with another label* (`not_judged` in the report): its
  text reply is judged on its language only, even when the label it got isn't the expected
  one, and a data answer or a failed SQL isn't judged at all.
- **The judge** gets one request per answered question, with the answer as content (never
  as instructions): the case's history (the same `history.liquid` block the pipeline's
  prompts use) before the question, the question, the schema context and, for each query
  of the answer
  (under its title when there are several), its SQL, every result row, its chart spec and
  its narrative, without the `### title` heading the backend adds: the judge scored a
  correct narrative lower with those headings in it. An answer with several results is
  judged as a whole, in one request, with the same three criteria (plus the language, in a
  request of its own; see below):
  - *the SQL answers the question* — a `score` on 3 levels (does not answer / partially /
    fully), 0 to 2. A question that asks for separate results needs a query for each: the
    rubric says different lists mixed in one table don't count as answering it. For a case
    with a history the rubric adds that the question may be a follow-up: one that asks to
    show, chart, reformat or redo an earlier answer ("I don't see the chart") is answered by
    queries that get that data again, and one that changes the request ("and in 2024?")
    must reflect the change. Without this rule the judge scored a correct repeat of the earlier
    query for "I don't see the chart" as *does not answer*. It's left out for single
    questions because there it lowered correct scores from 2 to about 1.9;
  - *the narrative is faithful to the data* — a `score` on 3 levels (contradicts or invents
    figures / minor inaccuracies / fully faithful), 0 to 2;
  - *the chart fits* — a `predicate` (a probability), asked only when at least one result
    has a chart spec; otherwise it's *not applicable*.
- **The language criterion**, *the answer is in the language of the message*, catches the
  bugs of #22 and #23 (earlier turns in another language pulled the answer into theirs). It's
  a `predicate`: everything the bot wrote — its narratives or reply, its column names, and
  its result and chart titles — is in the language of the question, whatever the language
  of the earlier turns; values from the rows and proper names don't count. The judge works
  the language out from the message: the golden case doesn't say it. It's asked in a
  request of its own, about the same input **without the history**; a text reply's input
  (`judge-reply-input.liquid`) is just the message and the reply. With the history in the
  input, the judge took the English examples of its header ("show it as a chart") for the
  message, and scored correct Spanish answers to "No veo el gráfico" as in the wrong
  language. The Decisions API judges each question on its own (the same input gives the same
  answer alone or with others), so the extra request doesn't move the other criteria.
- A data question the pipeline can't answer (every SQL attempt failed) or classifies as not
  a data question (reason: `classified as <label>`) is *without an answer*, with the reason,
  and isn't judged. A refused criterion is *refused*. A pipeline or judge failure is
  recorded on that question, and the run goes on.
- **Output:** one line per question — the classification first (`classification ok`, or
  the expected and the actual label, or *without a label*), then the scores (the language
  last, alone for a text reply) or why there's no answer — and a summary: the counts
  (answered, without an answer, with another label, errors), the average per criterion over
  judged values only (scores over 2, the chart and the language as an average probability),
  and `Classification: <correct>/<compared> correct (<n> without a label)`. A text reply
  counts for the language only, never as *not applicable* for the other criteria.
  No verdict, no thresholds: it exits 0 whenever the run finishes. The JSON report goes to
  `data/eval/eval-<timestamp>.json` (gitignored), with the models used, the summary, and
  per question the expected and the actual label (`expectedClassification`,
  `classification`, null without a label), the history, the SQL (every query's, one after
  the other), the narrative (or the text reply), each query's title, SQL, row count and
  chart spec (`queries`), and each criterion's answer as the Decisions API returned it
  (only `language` for a text reply).

### Frontend (Vue 3)

- Two routes (`router.ts`, vue-router with the browser history): `/chat` and `/usage` (the
  usage report, see *Usage report*); `/` and any unknown path redirect to `/chat`. In
  development Vite serves `index.html` for any path, so a reload on `/usage` works.
- Access-key screen first, on any route: a centered card that asks for the `APP_ACCESS_KEY`
  value from `.env` before showing anything else; then the requested route shows. The main
  screen fills the window:
  - a header with the brand, the backend health status (a pill), the `Chat` and `Usage`
    links (the current one marked, `aria-current="page"`), and an `Available data`
    button. It's a native `<details>`, closed by default, that opens the
    catalog in a dropdown panel with its own scroll. The catalog is requested on mount,
    even while the section is closed;
  - the conversation thread, the only part that scrolls, with a welcome message until the
    first question;
  - the question input, fixed at the bottom.
- The chat view (`ChatView.vue`):
  - The question is a bubble on the right in the brand gradient; the answer is a white card
    on the left, next to the assistant's avatar, so the two never look alike.
  - Sending a question scrolls down to it; when the answer arrives, the thread scrolls to
    where that turn starts, so a long table doesn't hide the narrative.
  - Each question shows an animated waiting indicator; input, button and suggestions are
    disabled until the answer arrives (one question at a time, no streaming).
  - `ResponseBlocks.vue` renders the blocks in order: `text` as markdown with `micromark`,
    `table` as a plain HTML table, cells placed by position, and `chart` with
    `ChartBlock.vue`. Raw HTML is escaped, `javascript:` links are dropped, and markdown
    images are turned off (they render as plain links), so the LLM's text can't inject
    markup or make the browser load a remote URL by itself. Links open in a new tab
    (`noopener noreferrer`), so clicking one doesn't lose the in-memory thread.
  - Suggestions are buttons under each answer: a click sends that question right away, in
    the same conversation.
  - Errors show in the thread in place of the answer. A `404` (the backend no longer knows
    the conversation) drops the conversation id, so the next question starts a new one;
    other errors keep it. A `401` goes back to the key screen (`apiFetch`).
  - `postChat` gives up after 6 minutes (`CHAT_TIMEOUT_MS`, an `AbortSignal.timeout`), and
    the thread says *Could not get an answer: the request took too long.* It's a safety
    net above the backend's worst case (about 300 s, see *LLM layer*), so it practically
    never cuts an answer that can still arrive. The backend isn't told: it still finishes
    and saves the turn. If the conversation already had an id, the next question gets that
    turn as history; a timeout on the first question leaves no id, so the next one starts
    a new conversation.
  - The thread and the conversation id live only in memory: a reload starts a new
    conversation.
- Plain components and composables: vue-router for the two routes, no state library, no
  UI kit. Styles in SCSS, with the design tokens (colors, radii,
  shadows, spacing) in `styles/_tokens.scss`: slate neutrals with an indigo accent. The
  font is Inter, served locally by `@fontsource-variable/inter` (no request to a font
  CDN); charts use it too.
- Charts with Chart.js through vue-chartjs (`ChartBlock.vue`): bar, line, pie and doughnut,
  with the block's title and Chart.js's default palette (the `Colors` plugin). The block
  is drawn as it comes: the backend already checked it against the rows.
- UI texts in English and hardcoded, no i18n. The bot answers in the language of the
  question.

### Observability

Fastify's built-in logger (pino), with one log line per pipeline step and its duration,
failed steps included: `classify` (the label, its confidence, and whether a low-confidence
label was overridden; a failed classification is a warning with `result: 'error'`), then
`reply` for a message that isn't a data question or `sql` and `insights` for one that is,
and `persist` for each chat request, plus SQL generation, which logs each attempt's
generation (`ok` or `error`) and execution (`ok`, the error `kind`, or `error` when it
throws), without the SQL or the question. The persisted turns in `app.db` are the query
log, and `llm_calls` has the time and tokens of every call to the LLM (see step 6), which
the usage report sums up. Nothing else for a POC.

### Usage report

How much the LLM is used, how long it takes and what it costs, from `llm_calls` and its
turns. Fixed queries only (`buildUsageReport` in `backend/src/usage.ts`, route in
`usage-route.ts`): the LLM never writes this SQL, and the usage tables stay out of the
chatbot's reach, so the numbers are exact and no one can ask the bot for other people's
conversations.

- **`GET /api/usage`** takes `from` and `to` (local days, inclusive), `granularity`
  (`hour`, `day`, `week` from Monday, or `month`), `tz` (the browser's offset from UTC, in
  minutes) and optional `model` and `step` filters. A turn's local time is its UTC time
  plus `tz`, so a turn at 23:30 falls on its local day; one offset covers the whole period
  (no daylight saving changes inside it). Invalid values and periods of more than 1,000
  intervals (`MAX_BUCKETS`) are a `400`.
- **It returns** the period's totals (calls, turns, input and output tokens, estimated
  cost, average and maximum time per call, failed calls, SQL retries), the series (every
  interval, empty ones at zero, with tokens per step), the breakdown by step and model,
  the 10 turns with the most tokens (with their question), every model in `llm_calls`
  (for the filter) and the models without a price.
- **Estimated cost:** `OPENAI_PRICES` (optional, see *Configuration*) gives each model's
  price in USD per million input and output tokens. A call costs its tokens times its
  model's price; calls of a model without a price add nothing, and the report names those
  models. A group with no priced call has no cost (`null`). Sums are rounded to 1e-8 USD.
  `npm run eval` calls aren't included: the eval doesn't write to `app.db`.
- **Refreshing the prices:** `npm run prices` (`backend/src/update-prices.ts`, run by
  hand) downloads OpenAI's pricing page in its Markdown version
  (`developers.openai.com/api/docs/pricing.md`), reads the Standard, short context prices
  (the tables under its first *Standard pricing data* heading) and rewrites only the
  `OPENAI_PRICES` line of the root `.env`. It prices `OPENAI_MODEL`,
  `OPENAI_DECISIONS_MODEL` and every model already listed; the Decisions model gets an
  output price of 0, because the Decisions API charges input tokens only (unless it's also
  `OPENAI_MODEL`: prices go by model id, and the chat's output does cost). A model the
  page doesn't list keeps its price and gets a warning. If the page can't be read or its
  layout changes, it writes nothing and exits with 1. The backend reads the new prices on
  its next start.
- **The screen** (`UsageView.vue`): filters (from, to, granularity, model, step; by
  default the last 7 days, by day), cards with the totals, a bar chart of tokens per
  interval and step, and tables for the series, the breakdown and the top turns, drawn
  with `ResponseBlocks.vue` like the chat's answers. Every filter change asks again; a
  late answer to an older request is dropped. Each visit to `/usage` starts from the
  default filters.
- **Back to the chat:** the router keeps the chat alive while on `/usage` (`KeepAlive`),
  so the conversation and what was typed stay. Off the page the thread loses its scroll,
  so `ChatView` tracks its place on every scroll and restores it on the way back; an
  answer that arrived meanwhile is shown instead (it couldn't scroll while away).

## Tech stack

| Component | Chosen technology | Reason |
|---|---|---|
| Runtime | Node.js 24.15+ (`engines: >=24.15`) | Already installed; runs TypeScript natively and ships `node:sqlite`. 24.15 adds the `limits` option that caps value size (an older 24 ignores it) |
| Language | TypeScript (strict, erasable syntax only) | Types on the response contract and the LLM JSON. Erasable syntax lets Node run `.ts` directly, with no build step for the backend |
| Repo layout | npm workspaces | Built into npm. Two packages with one install and root scripts |
| Backend | Fastify | JSON-schema validation, logger, and `app.inject()` for tests are all built in |
| Database | SQLite via `node:sqlite` (built-in) | No dependency and no native compilation (Windows-safe). `readOnly` connections give a hard write guard |
| LLM | OpenAI API: Responses + Decisions, via `openai` SDK | Responses for generation with Structured Outputs; Decisions for classification and judging. The Decisions API isn't on Azure, so everything goes to the OpenAI API with one key |
| Frontend | Vue 3 + Vite, vue-router | User's choice; Vite is the standard Vue toolchain, and vue-router its official router (the chat and the usage report each have a URL) |
| Styles | SCSS (`sass`, pure JS) | User's preference. Vite supports it natively; the pure-JS package avoids native binaries |
| Font | Inter, via `@fontsource-variable/inter` | The user asked for a nicer font. Self-hosted: the app is local, so it works offline and sends nothing to a third party |
| Prompt templates | LiquidJS (`liquidjs`) | The user asked for something like Jinja2 for prompts: LiquidJS has the same base syntax (`{{ }}`, `{% if %}`, `{% for %}`), is pure JS, and doesn't escape HTML by default |
| Markdown | `micromark` | Renders the narrative's markdown. Safe by default (escapes raw HTML, drops `javascript:` links; images are turned off by config), ships its own types, and needs no sanitizer next to it |
| Charts | Chart.js + vue-chartjs | Proven, light, and covers bar/line/pie/doughnut. Its config is easy to build from data |
| Env config | Node's built-in `--env-file-if-exists` | Reads the root `.env` without `dotenv` |
| Dev runner | `concurrently` (root dev dependency) | Starts backend and frontend with one cross-platform `npm run dev` |
| Tests | Vitest (+ `@vue/test-utils`, `jsdom` for the frontend) | Same runner for both packages; native TypeScript and Vite support |
| Coverage | `@vitest/coverage-v8` | V8 coverage built into Vitest, with enforced thresholds |
| Lint / format | ESLint (flat config, `typescript-eslint`, `eslint-plugin-vue`) + Prettier | Standard TS/Vue linting. Prettier keeps agent-written PRs free of style noise |
| Type check | `tsc --noEmit` (backend), `vue-tsc --noEmit` (frontend) | Node strips types without checking them, so type checking is part of the lint gate |

Each dependency is added by the first piece of work that uses it: the scaffold installs
only what the scaffold's code uses. `openai` and `liquidjs` came with SQL generation;
`micromark` came with the chat UI, and `chart.js`/`vue-chartjs` with the charts.

## Quality gate

- **Coverage threshold:** 85% (default) for lines, statements, functions and branches.
  Excluded: entry points only (`backend/src/server.ts`, `frontend/src/main.ts`, scripts
  that just call tested functions) and type-only files.
- **Measured by:** Vitest with `@vitest/coverage-v8`. A root Vitest config runs both
  workspaces as projects and reports one combined coverage. The run fails if any metric
  is under the threshold.
- **Workers:** at most 4 test files at once in total (`maxWorkers: 4`), set in each
  project's config (`backend/vitest.config.ts`, `frontend/vite.config.ts`) with the same
  value. Both projects have the same `sequence.groupOrder`, so they share one pool.
  - **Why per project:** Vitest's pool reads the limit from the projects and ignores a
    root value. #18 put it in the root config, so until #27 the pool ran at the default
    of one worker per CPU: 27 at once on a 28-CPU machine. Vitest rejects projects with
    different `maxWorkers` in the same group, so the two values can't drift apart.
  - **Why a limit:** a worker must answer within Vitest's fixed 60 s start timeout
    ("Timeout waiting for worker to respond"), and for the frontend that time includes
    setting up jsdom. With 27 forks at once (with coverage), the main process likely
    fell behind: backend workers took 20-30 s to start, and the frontend's jsdom setup up
    to 40 s, even with a single gate.
  - **Measured with 4:** a worker usually starts in 2-6 s, also with two gates at once.
    A single gate takes a median of 65 s (83.8 s before).
  - **What's left:** no measurable change in how often the gate fails: 4 of 33 gate
    runs before #27, 6 of 46 after. The failures seen were machine-wide stalls of about
    a minute, so a frontend worker misses the 60 s start or a test times out. The one
    stall measured is consistent with Windows Defender: it ran at twice its usual CPU,
    while total CPU and free memory stayed as in good runs. Stalls came most often on
    the first run after a few idle minutes or right after `npm ci`. Running the gate
    again passes; the likely fix is outside the repo (see `issues/pendientes.md`).
- **Lint command:** `npm run lint` (ESLint + `prettier --check` + type check of both packages)
- **Test-with-coverage command:** `npm run test:coverage`
- These two commands are the whole gate: the project is local-only, so there's no CI. `/work-issue` runs them before every PR, and anyone checking a branch runs the same ones.
- Tests are offline and deterministic: SQLite runs in-memory or in temp files, and OpenAI is
  always a fake client. `npm run eval` (real LLM calls) is outside the gate.

## Configuration

Root `.env` (gitignored; placeholders in `.env.example`), loaded by Node's
`--env-file-if-exists`. Four variables are **required**: without any of them the backend
(and `npm run eval`) refuses to start, with an error naming it. `APP_ACCESS_KEY` is the
app's shared key (auth); `OPENAI_API_KEY` and `OPENAI_MODEL` (a model with Structured
Outputs in the Responses API) are for the LLM; `OPENAI_DECISIONS_MODEL` is the Decisions
API model, for the classification and the judge. `OPENAI_PRICES` is optional: the model
prices for the usage report's estimated cost (`model=input/output`, in USD per million
tokens, comma-separated); without it the report has no cost, and a malformed value stops
the backend at startup. `npm run prices` fills it in from OpenAI's pricing page (see
*Usage report*). Each issue adds the variables it uses.

Fixed for now, and not configurable: the database paths (`data/app.db`, `data/data.db`,
relative to the repo root), the backend port (3000), the golden file and report paths, and
tuning values (retry budget, row cap, insights row sample, context turns, the OpenAI
timeout and retries, the chat timeout). A slow model in `OPENAI_MODEL` (over 30 s per
call) would need the timeout raised in `backend/src/llm.ts`. They become
config only when there's a reason.

## Deferred decisions

| Decision | Why not now |
|---|---|
| CSV/Excel import feature | Agreed for later. Data is loaded by hand for now. Excel will need a dependency (`exceljs`) when it comes |
| Azure OpenAI | The Decisions API has no confirmed Azure availability. Moving Responses is a `baseURL` change; revisit when Decisions lands on Azure |
| Table whitelist for the LLM's SQL | The generated SQL may read anything on the read-only `data.db` connection, not only the tables in `meta_tables`. Besides the dataset, that's `meta_*` (already public through the catalog), `sqlite_master` (the schema's `CREATE` statements), `dbstat` (page sizes) and table-valued pragmas such as `pragma_database_list`. Read-only, all of that is harmless, except that `pragma_database_list` returns the absolute path of `data.db` on the server, which then shows up in the answer. `app.db` (the conversations) is another connection and `ATTACH` is blocked, so it can't be read. Fine for a local demo; revisit (block those sources in `executeSql`, or check the tables a query reads) if the demo leaves localhost |
| Online judge (scoring every answer live) | The offline eval measures quality without adding latency or cost to each chat |
| Judge rationale via the Responses API | Decisions gives scores without a "why". Add explanations for low scores only if the scores alone aren't enough |
| Real authentication / users | Local POC: a shared key is enough |
| Query timeout / worker thread | `node:sqlite` is synchronous, so a slow query blocks the server. Each value is capped at 1,000,000 bytes, but the total size of a result is bounded only by the row cap. That's fine for one user on a small dataset; move execution to a worker if it bites |
| Standard prompts with pre-validated SQL, feedback buttons, CSV download | Features from the reference project. Not needed to prove the concept |
| Streaming responses | Adds complexity on both ends. Fine to wait for the full answer in a POC |
| UI kit (e.g. PrimeVue DataTable) | Plain HTML tables are enough. Revisit if tables need sorting, paging or export |
| State library, i18n | Little shared state, English-only UI. (A router came with the usage report's own URL, in #26.) |
| Docker / docker-compose | SQLite is a file and nothing else needs a container. Docker isn't installed either |
| Deployment | Local-only |
