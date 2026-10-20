# Architecture diagram

A map of the components described in [ARCHITECTURE.md](ARCHITECTURE.md) and how they
connect. Solid lines are built; dashed lines are planned in the epic
([issues/1-poc-chatbot-text-to-sql.md](../issues/1-poc-chatbot-text-to-sql.md)). When a
planned piece lands, make its arrows solid and remove it from the `planned` class.

```mermaid
flowchart TB
  user(["User"])

  subgraph FE["Frontend · Vue 3 + Vite · :5173"]
    keyForm["AccessKeyForm<br/>keeps the key in sessionStorage"]
    backendStatus["BackendStatus"]
    dataCatalog["DataCatalog<br/>Available data"]
    chatUi["Chat view<br/>narrative · table · chart"]
    apiFetch["apiFetch<br/>Authorization: Bearer key<br/>401 → back to the key screen"]
  end

  subgraph BE["Backend · Fastify · 127.0.0.1:3000"]
    authHook["onRequest hook<br/>APP_ACCESS_KEY · deny-by-default"]
    health["GET /api/health"]
    catalogRoute["GET /api/catalog<br/>readCatalog"]
    chatRoute["POST /api/chat"]
    subgraph PIPE["Text-to-SQL pipeline"]
      classify["1 · Classify the question"]
      genSql["2-3 · Schema context + generate SQL"]
      guard["4 · Guard and execute<br/>SELECT/WITH only · row cap"]
      insights["5 · Build the insights<br/>narrative · chart spec · suggestions"]
      persist["6 · Persist the turn"]
    end
  end

  subgraph DATA["data/ · SQLite via node:sqlite"]
    dataDb[("data.db · read-only<br/>dataset + meta_tables,<br/>meta_columns, meta_relationships")]
    appDb[("app.db · read-write<br/>conversations and turns")]
  end

  openai{{"OpenAI API<br/>Responses + Decisions"}}
  seed["npm run seed<br/>demo-dataset.ts"]
  evalCmd["npm run eval<br/>LLM-as-a-judge"]

  user --> keyForm
  user --> dataCatalog
  user -.-> chatUi
  backendStatus & dataCatalog --> apiFetch
  chatUi -.-> apiFetch
  apiFetch -->|"/api via the Vite proxy"| authHook
  apiFetch -->|"401"| keyForm
  authHook -->|"public, no key"| health
  authHook --> catalogRoute
  authHook --> chatRoute
  health -->|"SQLite version"| appDb
  catalogRoute --> dataDb
  seed -->|"recreates from scratch"| dataDb

  chatRoute -->|"no classification yet"| genSql
  chatRoute -.-> classify -.-> genSql
  genSql --> guard
  guard --> insights --> persist
  guard -->|"error → retry"| genSql
  guard -->|"generated SQL"| dataDb
  genSql -->|"schema context"| dataDb
  persist --> appDb
  classify -.->|"Decisions"| openai
  genSql -->|"Responses"| openai
  insights -->|"Responses"| openai
  evalCmd -.->|"golden questions"| classify
  evalCmd -.->|"Decisions: scores"| openai

  classDef planned stroke-dasharray: 5 5
  class chatUi,classify,evalCmd planned
```
