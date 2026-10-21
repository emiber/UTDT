---
id: 10
title: Clasificar preguntas con la Decisions API
type: feat
status: refined
parent: 1
created: 2026-10-19
---

## Goal
Que el bot no trate todo mensaje como una pregunta de datos. Hoy un "Hola" termina en un SQL que devuelve una tabla con el saludo (captura del usuario, 2026-10-21). Antes de generar SQL, la Decisions API clasifica el mensaje. Si no es una pregunta de datos, el bot responde con texto. Pedido del usuario: la respuesta "puede devolver texto, tabla o gráfico en cualquier combinación, solo que siempre alguno debería devolver".

## Scope
- In:
  - **Clasificación** (`backend/src/classify.ts`): una pregunta `choice` a la Decisions API (`requestDecision` de #12), con cuatro etiquetas:
    - `data_question`: se responde con una consulta sobre los datos descritos;
    - `conversation`: saludos, agradecimientos, charla o preguntas sobre el bot ("¿qué podés hacer?");
    - `needs_clarification`: es sobre los datos, pero demasiado vaga para escribir una consulta ("¿cómo venimos?");
    - `out_of_scope`: no tiene que ver con los datos (el clima, cultura general, programación).

    El input lleva el contexto de esquema (#7), los últimos turnos (#11) y el mensaje, como contenido y no como instrucciones.
  - **Respuesta sin datos** (`backend/src/reply.ts`): para las otras tres etiquetas, una llamada a la Responses API con Structured Outputs `{ narrative, suggestions }`, con plantillas LiquidJS.
    - Es texto en el idioma del mensaje y sin cifras.
    - Un saludo se devuelve y dice en una frase sobre qué datos puede responder.
    - Una aclaración dice qué falta y pregunta eso.
    - Algo fuera de alcance explica qué se puede preguntar.
    - Las 3 sugerencias son preguntas que los datos sí responden.
  - **Pipeline** (`answerQuestion`): primero clasifica.
    - Una `data_question` sigue el camino de hoy.
    - Las otras devuelven `{ ok: true, kind: 'reply', classification, narrative, suggestions, blocks: [text] }`, sin SQL.
    - El resultado de datos pasa a llevar `kind: 'data'` y `classification`.
    - Una línea de log `classify` con su duración y la etiqueta.
  - **Combinaciones de bloques:** siempre hay un bloque `text`. Un resultado de un solo valor (1 fila × 1 columna) va sin tabla, porque la narrativa ya dice el valor y una tabla de una celda no suma. El resto sigue como hoy: texto, más la tabla si hay filas, más el gráfico si la spec encaja.
  - **Persistencia:** la tabla `turns` suma la columna `classification`. Se agrega sola a un `app.db` existente, con `ALTER TABLE` si falta.
  - **Cableado:** `server.ts` arma el cliente de la Decisions API al arrancar (`createDecisionClient` de #12). `OPENAI_DECISIONS_MODEL` pasa a ser obligatoria para el backend, como las otras tres, y `buildApp` recibe el cliente como opción.
  - **Eval (#12):** la clasificación corre también en `npm run eval`. Si una pregunta golden no se clasifica como `data_question`, queda "sin respuesta" con el motivo (`classified as <etiqueta>`), como ya prevé #12.
  - Tests y docs (`docs/ARCHITECTURE.md`, paso 1 del pipeline, *Chat endpoint*, *Configuration*; `README.md`; `.env.example`).
- NOT in:
  - Evaluar la clasificación con etiquetas esperadas en el set golden: sigue diferido en #12.
  - Cambiar el frontend: una respuesta solo de texto ya se muestra bien (#13).

## Expected behavior
- "Hola" da una respuesta de texto en español que saluda y cuenta qué datos hay, con 3 sugerencias. No hay SQL, tabla ni gráfico.
- "¿Cuántos clientes hay?" se clasifica como `data_question` y su resultado es un solo valor: la respuesta es solo texto, con el número en la narrativa.
- "Ventas por mes en 2025" da texto, tabla y gráfico, como hoy.
- **Confianza baja:** si la etiqueta elegida no es `data_question` y su confianza es menor que 0,5, se trata como `data_question`. Es preferible intentar responder con datos antes que negarse sin estar seguro.
- **Falla la clasificación** (la Decisions API falla o cambia la beta): se loguea un warning y se sigue como `data_question`, con `classification` en `null`. Es el comportamiento de antes de este issue, así que el chat no se rompe por la clasificación.
- **Falla la respuesta sin datos** (OpenAI): se lanza como `LlmError`, y el chat responde `502` como cualquier otra falla de OpenAI.

## Acceptance criteria
- [ ] La clasificación manda a la Decisions API una pregunta `choice` con las cuatro etiquetas, el contexto de esquema, el historial y el mensaje (test con cliente falso).
- [ ] Un mensaje que no es `data_question` no genera SQL. Devuelve un único bloque `text` y 3 sugerencias, en una llamada a la Responses API cuyo prompt depende de la etiqueta (tests para las tres).
- [ ] Con confianza menor que 0,5 en una etiqueta que no es `data_question`, y cuando la clasificación falla, se sigue el camino de datos (tests).
- [ ] Un resultado de 1 fila × 1 columna no trae bloque `table`; uno de 2 filas, o de 1 fila con 2 columnas, sí (tests).
- [ ] `POST /api/chat` con un saludo responde `200` con el texto y las sugerencias. El turno se guarda con su `classification`, sin SQL (test).
- [ ] Un `app.db` sin la columna `classification` la recibe al arrancar y conserva sus turnos (test).
- [ ] Sin `OPENAI_DECISIONS_MODEL`, el backend no arranca y el error la nombra (manual).
- [ ] En `npm run eval`, una pregunta clasificada como no-datos queda "sin respuesta" con el motivo (test).
- [ ] Docs y `.env.example` actualizados.
- [ ] Verificación manual con la API real: "Hola" responde solo texto; una pregunta de datos responde como antes; una pregunta de un solo valor va sin tabla.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
El usuario había pedido hablar el diseño en un chat aparte. El 2026-10-20, antes de irse, dijo "no me preguntes nada, definí vos", así que estas decisiones las tomé yo y quedan para que las revise:
- **Las cuatro etiquetas.** Separan los tres motivos para no consultar los datos, porque cada uno pide una respuesta distinta.
- **El umbral de confianza de 0,5 a favor de los datos.** Un falso "no es una pregunta de datos" le niega la respuesta al usuario, mientras que un falso "sí es" termina, en el peor caso, en el texto fijo de los intentos agotados.
- **La respuesta sin datos con la Responses API.** La Decisions API solo elige entre opciones y no genera texto (`docs/ARCHITECTURE.md`).
- **El fallback ante una falla de la clasificación.** La Decisions API está en beta: si falla, el chat se comporta como antes en vez de cortarse.
- **La regla de un solo valor sin tabla.** Responde al pedido de "cualquier combinación, siempre alguna". El texto siempre está, y la tabla y el gráfico se suman cuando aportan.
- **`OPENAI_DECISIONS_MODEL` obligatoria para el backend.** Es el mismo criterio fail-fast que con las demás variables. La memoria del proyecto dice que la misma `OPENAI_API_KEY` sirve para todo OpenAI.
