---
id: 37
title: Responder siempre en el idioma del mensaje después de turnos en otro idioma
type: fix
status: refined
parent:
created: 2026-10-23
---

## Goal
Saber cada cuánto el bot responde una respuesta de texto en el idioma de los turnos anteriores, y no en el del mensaje (el bug de #22), y arreglarlo si pasa seguido. Es para quien usa la demo en una conversación que cambia de idioma.

En la corrida real de `npm run eval` de #34 (2026-10-23), `capital-of-france-after-spanish` ("What is the capital of France?" después de 4 turnos en español) se respondió en español: "Solo puedo responder preguntas sobre los datos de ventas, clientes, productos y objetivos de esta base…". El criterio de idioma de #29 lo marcó con 0,00. Repetido 10 veces salió en inglés las 10, y en las corridas de #36 y #35 también. Con el arreglo de #22 se vio fallar 1 vez de unas 13.

## Scope
- In:
  - **Medir:** correr 20 veces el paso de la respuesta de texto (`buildReply`) para `capital-of-france-after-spanish`, con el historial del golden, y contar las respuestas en otro idioma. Es un script descartable que no se versiona.
  - **Si fallan 2 o más de 20:**
    - el cambio más chico en el prompt o en el esquema de la respuesta de texto (`reply-system.liquid`, `reply-user.liquid` o `reply.ts`), con sus tests;
    - una medición nueva de 20 repeticiones;
    - una corrida real de `npm run eval`.
  - **Si fallan 0 o 1 de 20:** no se cambia código. Se cierra con la medición.
- NOT in:
  - Las respuestas de datos: el SQL y los insights tienen su propio campo `language` (#23), y no se vio que fallen.
  - Detectar el idioma en código (#22 lo dejó afuera).
  - El judge y sus criterios (#38 trata los falsos negativos del idioma).

## Expected behavior
- Una respuesta de texto a un mensaje en inglés, después de turnos en español, sale en inglés.
- Una conversación en un solo idioma sigue como hoy.

## Data
- No cambia ningún formato.
- La medición usa el historial de `capital-of-france-after-spanish` en `backend/eval/golden.json` y el modelo del pipeline (`OPENAI_MODEL`). El idioma de cada respuesta se cuenta mirando el texto.

## Dependencies
- Se apoya en #22 (el campo `language` de la respuesta de texto) y #29 (el criterio de idioma del eval).
- Externo: OpenAI (Responses API) para la medición.

## Acceptance criteria
- [ ] La Verification del PR tiene la medición de 20 repeticiones: cuántas salieron en otro idioma, con un ejemplo de cada una.
- [ ] Si fallaron 2 o más:
  - [ ] el cambio tiene tests offline;
  - [ ] una medición nueva de 20 repeticiones da 0 en otro idioma;
  - [ ] una corrida real de `npm run eval` está en Verification;
  - [ ] el quality gate pasa.
- [ ] Si fallaron 0 o 1: el issue se cierra sin cambios de código, con la medición en su PR.

## Non-functional notes
- **Costo:** la medición son 20 llamadas a la Responses API (40 si hay cambio), más la corrida real si hay cambio.

## Assumptions
Decididas con la delegación del usuario ("Hacé lo que creas para terminar lo antes posible", 2026-10-24), sin una pregunta aparte:
- Medir antes de cambiar, como ya decía el issue.
- 20 repeticiones, y el umbral de 2 de 20 (10%) para cambiar algo. Con 1 de 20 o menos, el arreglo de #22 alcanza para la demo.
- Medir solo la respuesta de texto, que es donde se vio el bug.

## Deferred decisions
- **Medir también las respuestas de datos después de turnos en otro idioma.** Hoy no se vio que fallen.
