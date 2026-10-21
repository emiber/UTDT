---
id: 17
title: Agregar timeouts de punta a punta al chat
type: fix
status: closed
parent: 1
created: 2026-10-20
---

## Goal
Que una llamada colgada a OpenAI no deje la UI en "Thinking…" para siempre. Hoy el SDK usa su default de 10 minutos por request con 2 reintentos, y el frontend no tiene timeout: la única salida es recargar, que pierde el hilo. Follow-up de #13.

## Scope
- In:
  - **Backend:** los clientes de OpenAI (`createLlmClient` y `createDecisionClient`) se arman con `timeout: 30_000` y `maxRetries: 1`, como constantes en `backend/src/llm.ts`. Un timeout del SDK ya es un `LlmError`, así que el chat responde `502` y el turno se guarda con el error, como cualquier falla de OpenAI.
  - **Frontend:** `postChat` manda `signal: AbortSignal.timeout(CHAT_TIMEOUT_MS)`, con `CHAT_TIMEOUT_MS = 360_000` (6 minutos). Es más que el peor caso del backend: 5 llamadas en serie (la clasificación de #10, hasta 3 intentos de SQL y los insights) × 2 intentos × 30 s = 300 s. El refinamiento decía 5 minutos para 4 llamadas; #10 agregó la quinta.
    - Si se cumple, `ChatView` muestra *Could not get an answer: the request took too long.*, conserva el `conversationId` y vuelve a habilitar el input.
  - Tests y docs (`docs/ARCHITECTURE.md`, *LLM layer* y *Frontend*).
- NOT in:
  - Un timeout de las consultas a SQLite: sigue diferido (worker thread).
  - Cancelar el pipeline del backend cuando el frontend corta.

## Expected behavior
- Una llamada a OpenAI que no responde en 30 s se corta, el SDK la reintenta una vez, y si vuelve a cortarse el chat responde `502`.
- Si el backend no responde en 6 minutos, la UI muestra el mensaje de timeout en el hilo y se puede volver a preguntar.

## Acceptance criteria
- [x] Los clientes del SDK se construyen con `timeout` 30.000 y `maxRetries` 1 (test sobre la instancia del SDK).
- [x] `postChat` manda un `AbortSignal` en el request.
- [x] Ante un `TimeoutError`, `ChatView` muestra el mensaje de timeout, deja el input habilitado y la siguiente pregunta conserva el `conversationId`.
- [x] `docs/ARCHITECTURE.md` documenta los dos timeouts y el peor caso.
- [x] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- 30 s por request alcanza holgado: en las pruebas reales, cada llamada tardó entre 1 y 4 s.
- 6 minutos en el frontend es una red de seguridad, no la espera normal. Tiene que superar el peor caso del backend para no cortar una respuesta que todavía puede llegar.

## Pull request
Branch: `fix/17-timeout-del-chat` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- **Backend** (`backend/src/llm.ts`):
  - Los dos clientes de OpenAI salen de `createOpenAI`, con `timeout` 30.000 por intento (`REQUEST_TIMEOUT_MS`) y `maxRetries` 1 (`MAX_RETRIES`). Antes eran 10 minutos y 2 reintentos.
  - Un request colgado se corta en un minuto y sale como `LlmError`, así que el chat responde `502` y guarda el turno con el error.
- **Frontend** (`frontend/src/api.ts`, `ChatView.vue`):
  - `postChat` manda `signal: AbortSignal.timeout(CHAT_TIMEOUT_MS)`, con 6 minutos.
  - Ante un `TimeoutError`, el hilo muestra *Could not get an answer: the request took too long.*, el input se vuelve a habilitar y la conversación se conserva.
- **Peor caso:** 6 minutos, porque #10 agregó la clasificación y ahora el peor caso son 5 llamadas en serie: la clasificación, hasta 3 intentos de SQL y los insights. Son 5 × 2 intentos × 30 s, unos 300 s, más la espera del SDK antes de cada reintento. El issue lo dice en *Scope*; el refinamiento había calculado 4 llamadas y 5 minutos.
- **Docs:** `docs/ARCHITECTURE.md` (*LLM layer*, *Frontend* y los valores fijos de *Configuration*).

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (28 archivos, 418 tests)
- Coverage: 100% en sentencias, funciones y líneas, y 98,91% en ramas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno.
- Manual: pass.
  - Apunté el cliente real del SDK a un servidor local que nunca responde. Hizo 2 intentos y en 60 s tiró `LlmError: OpenAI request failed: Request timed out.`
  - Un `fetch` de Node cortado por `AbortSignal.timeout` rechaza con un error llamado `TimeoutError`.
  - La review lo confirmó en Chrome y Edge headless, tanto esperando los headers como leyendo el body con `res.json()`.
  - La review también leyó el SDK y lo ejercitó contra un servidor local:
    - el timeout es por intento y cubre también el body;
    - se reintentan las fallas de conexión, los timeouts y los status 408, 409, 429 y 5xx;
    - la espera entre intentos es de 0,5 s, o el `Retry-After` de la API.
- Self-review: 1 ronda en un subagente nuevo, sin blockers. Sus sugerencias eran de docs y se aplicaron y verificaron inline:
  - la viñeta de timeouts partía otra;
  - el peor caso no sumaba la espera entre intentos;
  - un timeout en la primera pregunta no deja id de conversación;
  - faltaba el timeout entre los valores fijos.
- Plan: issue refinado. El único cambio fue el peor caso de 5 llamadas, que vino de #10.
- Security: no security surface touched. Solo se acotan las llamadas salientes a OpenAI.
- Docs: updated `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
- El backend sigue corriendo y guarda el turno aunque el frontend haya cortado. Cancelar el pipeline queda fuera de alcance.
- Si se cambia `OPENAI_MODEL` por un modelo lento, con más de 30 s por llamada, hay que subir `REQUEST_TIMEOUT_MS`. Está anotado en *Configuration*.
