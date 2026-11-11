# Architecture diagram

A map of the components described in [ARCHITECTURE.md](ARCHITECTURE.md) and how they
connect. The step numbers are the pipeline's steps in that file. When a component, route or
step changes there, change it here too.

```mermaid
flowchart TB
  user(["User"])

  subgraph FE["Frontend · Vue 3 + Vite · :5173"]
    keyForm["AccessKeyForm<br/>keeps the key in sessionStorage"]
    backendStatus["BackendStatus"]
    dataCatalog["DataCatalog<br/>Available data"]
    chatUi["ChatView · /chat<br/>narrative · table · chart · suggestions"]
    usageUi["UsageView · /usage<br/>totals · series · breakdown · top turns"]
    apiFetch["apiFetch<br/>Authorization: Bearer key<br/>401 → back to the key screen"]
  end

  subgraph BE["Backend · Fastify · 127.0.0.1:3000"]
    authHook["onRequest hook<br/>APP_ACCESS_KEY · deny-by-default"]
    health["GET /api/health"]
    catalogRoute["GET /api/catalog<br/>readCatalog"]
    chatRoute["POST /api/chat"]
    usageRoute["GET /api/usage<br/>buildUsageReport · OPENAI_PRICES"]
    subgraph PIPE["Text-to-SQL pipeline · answerQuestion"]
      schemaCtx["2 · Schema context"]
      classify["1 · Classify the message"]
      reply["Text-only reply"]
      genSql["3 · Generate SQL<br/>1 to 5 queries"]
      guard["4 · Guard and execute<br/>SELECT/WITH only · 500-row cap"]
      insights["5 · Build the insights<br/>narrative · suggestions · chart spec"]
    end
    persist["6 · Persist the turn<br/>and its LLM calls"]
  end

  subgraph DATA["data/ · SQLite via node:sqlite"]
    dataDb[("data.db · read-only<br/>dataset + meta_tables,<br/>meta_columns, meta_relationships")]
    appDb[("app.db · read-write<br/>conversations, turns, llm_calls")]
    evalReports[("eval/ · JSON reports")]
  end

  openai{{"OpenAI API<br/>Responses + Decisions"}}
  pricingPage{{"OpenAI pricing page"}}
  seed["npm run seed<br/>demo-dataset.ts"]
  evalCmd["npm run eval<br/>golden.json · LLM-as-a-judge"]
  pricesCmd["npm run prices<br/>rewrites OPENAI_PRICES in .env"]

  user --> keyForm & dataCatalog & chatUi & usageUi
  backendStatus & dataCatalog & chatUi & usageUi --> apiFetch
  apiFetch -->|"/api via the Vite proxy"| authHook
  apiFetch -->|"401"| keyForm
  authHook -->|"public, no key"| health
  authHook --> catalogRoute & chatRoute & usageRoute
  health -->|"SQLite version"| appDb
  catalogRoute --> dataDb
  usageRoute --> appDb
  seed -->|"recreates from scratch"| dataDb

  chatRoute -->|"history: last 5 turns"| appDb
  chatRoute --> schemaCtx
  schemaCtx -->|"metadata"| dataDb
  schemaCtx --> classify
  classify -->|"not a data question"| reply
  classify -->|"data question"| genSql
  genSql --> guard
  guard -->|"error → retry, up to 3 attempts"| genSql
  guard -->|"generated SQL"| dataDb
  guard --> insights
  reply & insights --> persist
  persist --> appDb
  classify -->|"Decisions"| openai
  reply & genSql & insights -->|"Responses"| openai

  evalCmd -->|"golden questions, in process"| PIPE
  evalCmd -->|"Decisions: judge"| openai
  evalCmd --> evalReports
  pricesCmd --> pricingPage
```
