---
id: 22
title: Responder en el idioma del mensaje aunque la conversación venga en otro
type: fix
status: closed
parent: 1
created: 2026-10-21
---

## Goal
Que el bot responda en el idioma del último mensaje, aunque la conversación venga en otro. En la prueba de punta a punta antes de cerrar el epic, "What is the capital of France?" después de varias preguntas en español se respondió en español. Sin historial, la misma pregunta se responde en inglés. Follow-up de #10.

## Scope
- In:
  - `prompts/reply-system.liquid`: la regla de idioma dice que un mensaje en inglés recibe la respuesta en inglés y uno en español en español, sea cual sea el idioma de los turnos anteriores o de los datos. Es la misma forma que ya usa la regla de los insights.
  - `prompts/insights-system.liquid`: la regla de idioma también menciona los turnos anteriores.
  - Los esquemas de Structured Outputs de la respuesta de texto (`reply.ts`) y de los insights (`insights.ts`) empiezan con un campo `language`, el idioma del mensaje actual, y el resto de la salida se escribe en él. El valor no se usa. Se agregó en la implementación (ver *Notes*).
  - Tests de las dos reglas y de los esquemas.
- NOT in:
  - Detectar el idioma en código.
  - El prompt de SQL: sus alias ya siguen el idioma de la pregunta (#21).

## Expected behavior
- Después de preguntas en español, "What is the capital of France?" se responde en inglés, y "Total sales per month in 2025" también.
- Una conversación en un solo idioma sigue como hoy.

## Acceptance criteria
- [x] Los prompts de sistema de la respuesta de texto y de los insights dicen que el idioma es el del mensaje actual, no el de los turnos anteriores (tests).
- [x] Verificación manual con la API real: en una conversación en español, un mensaje fuera de alcance y una pregunta de datos en inglés se responden en inglés.
- [x] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- ~~Lo arregla el prompt, como ya pasó con la deriva de idioma de #9.~~ No alcanzó: ver *Notes*.

## Notes
- 2026-10-21: la regla de idioma reforzada no alcanzó contra la API real. En una conversación en español, "What is the capital of France?" siguió respondiéndose en español en 4 de 4 intentos. Con el campo `language` como primera propiedad del esquema de la respuesta, salió en inglés 4 de 4 veces. Con el campo en los dos esquemas, dos conversaciones mezcladas completas dieron 20 de 20 turnos en el idioma de su mensaje. Las reglas reforzadas quedan igual.

## Pull request
Branch: `fix/22-idioma-de-la-respuesta` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- **Esquemas** (`backend/src/reply.ts`, `backend/src/insights.ts`): la salida de la respuesta de texto y la de los insights empieza con un campo `language`, el idioma del mensaje actual. Structured Outputs escribe las propiedades en orden, así que el modelo nombra el idioma antes de escribir el resto. El valor no se usa ni se guarda.
  - Es un cambio respecto del *Scope* original, que solo pedía reforzar los prompts. La regla sola no alcanzó (ver *Notes*).
- **Prompts** (`reply-system.liquid`, `insights-system.liquid`): la regla de idioma dice que el idioma es el del mensaje actual, sea cual sea el de los turnos anteriores.
- **Tests:**
  - el orden de las propiedades, con `language` primero;
  - que `required` lista todas las propiedades, como pide el modo estricto;
  - que `language` no sale en lo que devuelven las funciones;
  - las reglas de los prompts.
- **Docs:** `docs/ARCHITECTURE.md` (paso 5).

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (28 archivos, 420 tests)
- Coverage: 100% en sentencias, funciones y líneas, y 98,91% en ramas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno.
- Manual: pass, con la API real.
  - **Antes:** en la prueba de punta a punta del epic en el navegador, "What is the capital of France?" se respondió en español después de preguntas en español.
  - **Con la regla reforzada sola,** dos conversaciones siguieron respondiendo en español a los mensajes en inglés. En el experimento aislado fue 0 de 4.
  - **Con el campo `language`** salió 4 de 4 en el experimento. En dos corridas de dos conversaciones mezcladas, 20 de 20 turnos salieron en el idioma de su mensaje: español → inglés → español, e inglés → español → inglés. Eso incluye las respuestas de texto, las narrativas, las sugerencias y los títulos de los gráficos.
  - **`npm run eval`:** 7 de 7 preguntas respondidas, narrativa 1.97/2 y gráfico 0.98.
    - El SQL bajó a 1.86/2 por una sola pregunta, "Which country had the highest revenue? Show the revenue per country.", que esa vez salió con `LIMIT 1`.
    - Este issue no toca la generación de SQL. La misma pregunta, generada 5 veces más, devolvió los 5 países las 5 veces, así que fue variación entre corridas.
- Self-review: 1 ronda en un subagente nuevo, sin blockers. Sus sugerencias se aplicaron y verificaron inline, porque son solo tests, docs y el issue:
  - anotar en el issue el cambio de esquema;
  - testear `required` y que `language` no se devuelve;
  - ubicar el párrafo en el paso 5.
- Plan: abierto y refinado en la prueba previa a cerrar el epic. El campo `language` quedó registrado en *Notes*.
- Security: no security surface touched. Es texto de prompt y un campo de salida que no se usa.
- Docs: updated `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
None
