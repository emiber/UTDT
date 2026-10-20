---
id: 17
title: Agregar timeouts de punta a punta al chat
type: fix
status: refined
parent: 1
created: 2026-10-20
---

## Goal
Que una llamada colgada a OpenAI no deje la UI en "Thinking…" para siempre. Hoy el SDK usa su default de 10 minutos por request con 2 reintentos, y el frontend no tiene timeout: la única salida es recargar, que pierde el hilo. Follow-up de #13.

## Scope
- In:
  - **Backend:** los clientes de OpenAI (`createLlmClient` y `createDecisionClient`) se arman con `timeout: 30_000` y `maxRetries: 1`, como constantes en `backend/src/llm.ts`. Un timeout del SDK ya es un `LlmError`, así que el chat responde `502` y el turno se guarda con el error, como cualquier falla de OpenAI.
  - **Frontend:** `postChat` manda `signal: AbortSignal.timeout(CHAT_TIMEOUT_MS)`, con `CHAT_TIMEOUT_MS = 300_000` (5 minutos). Es más que el peor caso del backend: 4 llamadas en serie × 2 intentos × 30 s = 240 s.
    - Si se cumple, `ChatView` muestra *Could not get an answer: the request took too long.*, conserva el `conversationId` y vuelve a habilitar el input.
  - Tests y docs (`docs/ARCHITECTURE.md`, *LLM layer* y *Frontend*).
- NOT in:
  - Un timeout de las consultas a SQLite: sigue diferido (worker thread).
  - Cancelar el pipeline del backend cuando el frontend corta.

## Expected behavior
- Una llamada a OpenAI que no responde en 30 s se corta, el SDK la reintenta una vez, y si vuelve a cortarse el chat responde `502`.
- Si el backend no responde en 5 minutos, la UI muestra el mensaje de timeout en el hilo y se puede volver a preguntar.

## Acceptance criteria
- [ ] Los clientes del SDK se construyen con `timeout` 30.000 y `maxRetries` 1 (test sobre la instancia del SDK).
- [ ] `postChat` manda un `AbortSignal` en el request.
- [ ] Ante un `TimeoutError`, `ChatView` muestra el mensaje de timeout, deja el input habilitado y la siguiente pregunta conserva el `conversationId`.
- [ ] `docs/ARCHITECTURE.md` documenta los dos timeouts y el peor caso.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- 30 s por request alcanza holgado: en las pruebas reales, cada llamada tardó entre 1 y 4 s.
- 5 minutos en el frontend es una red de seguridad, no la espera normal. Tiene que superar el peor caso del backend para no cortar una respuesta que todavía puede llegar.
