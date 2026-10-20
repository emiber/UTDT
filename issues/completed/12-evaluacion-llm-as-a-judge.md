---
id: 12
title: Evaluar respuestas offline con LLM-as-a-judge (npm run eval)
type: feat
status: closed
parent: 1
created: 2026-10-19
---

## Goal
Medir la calidad de las respuestas del chatbot de forma repetible. `npm run eval` corre un set de preguntas golden por el pipeline real, y un juez (la Decisions API de OpenAI) puntúa cada respuesta. Es para quien desarrolla el POC: lo corre a mano para ver si un cambio de prompts o del pipeline mejora o empeora las respuestas.

## Scope
- In:
  - Un archivo golden versionado (JSON) con preguntas respondibles sobre el dataset demo de #2. Cada caso trae solo `id` y `question`, sin respuesta de referencia: el juez evalúa contra la pregunta, el esquema y las filas reales.
  - El comando `npm run eval`, desde la raíz y sin argumentos. Para cada pregunta corre el pipeline completo en proceso (sin HTTP) y juzga la respuesta con la Decisions API.
  - Tres criterios del juez:
    - "El SQL responde la pregunta": `scores` con una rúbrica de 3 niveles (no la responde / la responde en parte / la responde por completo).
    - "La narrativa es fiel a los datos": `scores` con una rúbrica de 3 niveles (contradice o inventa cifras / tiene imprecisiones menores / es totalmente fiel).
    - "El gráfico es adecuado": `predicate`, que solo se pregunta cuando la respuesta trae gráfico.
  - Un resumen por consola y un reporte JSON en una ruta gitignored. Los dos muestran los valores sin veredicto ni umbrales.
  - Las llamadas `scores` / `predicates` a la Decisions API, dentro del único módulo de OpenAI que define `docs/ARCHITECTURE.md`.
  - Tests unitarios offline (cliente OpenAI falso y pipeline falso) y la documentación en `README.md`.
- NOT in:
  - Formar parte del quality gate (`npm run lint`, `npm run test:coverage`) o correr dentro de los tests.
  - La evaluación online (juzgar cada respuesta del chat en vivo) y las explicaciones del juez vía Responses API. Las dos están diferidas en `docs/ARCHITECTURE.md`.
  - Conversaciones multi-turn en el set golden: cada pregunta corre sola, en una conversación nueva.
  - Respuestas de referencia por caso (`expectedSql`, `expectedAnswer` o similares).
  - Criterios además de los tres de arriba, como el idioma de la respuesta o la relevancia de las sugerencias.
  - Evaluar la clasificación de #10. El set golden solo trae preguntas respondibles, sin etiqueta de clasificación esperada, y no incluye preguntas fuera de alcance ni preguntas que necesiten aclaración. Tampoco se evalúan las sugerencias de seguimiento ni la tabla, que el backend arma con las filas reales.
  - Veredictos PASS/FAIL, umbrales y un código de salida distinto de 0 por puntajes bajos.
  - Filtros por id o categoría, corridas en paralelo, repeticiones por pregunta, comparación entre corridas y costo en tokens.
  - Guardar resultados en SQLite (el reporte JSON es la única salida persistida). Tampoco hay ajustes "lenient" de veredictos como los del proyecto de referencia.

## Expected behavior
- Normal case:
  1. `npm run eval` chequea primero la configuración de OpenAI que usan el pipeline y el juez (`OPENAI_API_KEY` y los ids de modelo). También chequea que el archivo golden sea válido y que exista `data/data.db`. Recién entonces empieza.
  2. Toma las preguntas en orden, de a una. Cada pregunta corre por el pipeline como una conversación nueva: clasificación si existe #10, SQL con hasta 3 intentos (#7), ejecución con guardas y tope de 500 filas (#6), insights (#8) y gráfico (#9). La corrida no escribe en `data/app.db`.
  3. Si el pipeline dio una respuesta, le pide al juez los dos `scores` (SQL y narrativa) y, si la spec del gráfico no es `null`, el `predicate` del gráfico. Guarda tal cual el valor que devuelve la Decisions API: el score en la escala de la rúbrica o la probabilidad del predicado, más la confianza si viene.
  4. Imprime una línea por pregunta, con el id y el resultado de cada criterio, o el motivo si quedó sin respuesta, o el error. Al final imprime el resumen:
     - el promedio por criterio, calculado solo sobre los valores juzgados: los scores sobre el máximo de la escala y el predicado como probabilidad promedio;
     - los conteos: preguntas sin respuesta, criterios rechazados y criterios que no aplican.

     No hay veredicto ni umbrales.
  5. Escribe el reporte JSON, imprime su ruta y sale con código 0. Sale con 0 siempre que la corrida termine, aunque haya puntajes bajos, preguntas sin respuesta o errores en algunas preguntas.
- Edge cases:
  - Respuesta sin gráfico: el resultado del pipeline trae la spec en `null` (#9), porque el LLM no propuso gráfico o porque su spec era inválida. El criterio del gráfico queda "no aplica": no se le pregunta al juez y no entra en los promedios.
  - Resultado con 0 filas: cuenta como respuesta. La respuesta trae solo la narrativa, sin tabla ni gráfico. Se juzgan el SQL y la narrativa, que debería decir que no hay datos, y el gráfico queda "no aplica".
  - El pipeline no da una respuesta, porque la clasificación de #10 rechaza la pregunta o porque se agotan los 3 intentos de #7 y el pipeline devuelve el motivo. La pregunta queda "sin respuesta" con ese motivo, no se llama al juez, no entra en los promedios y se cuenta en el resumen. La corrida sigue con la siguiente.
  - El juez rechaza un criterio (la respuesta de tipo `refusal` de la Decisions API): ese criterio queda como "rechazado" y no entra en los promedios. Los demás criterios de la misma pregunta se guardan.
- Errors:
  - Errores de arranque: falta `OPENAI_API_KEY` o un id de modelo, o el archivo golden no existe, no es JSON válido, está vacío o tiene casos sin pregunta o con ids repetidos. En todos imprime un mensaje claro, sale con un código distinto de 0, no llama a OpenAI y no escribe reporte.
  - Falta `data/data.db`: lo mismo, y el mensaje sugiere correr `npm run seed`.
  - Falla una llamada a OpenAI dentro del pipeline (en el SQL o en los insights): el pipeline la lanza en vez de devolverla (#7, #8). Queda como error de esa pregunta, sin llamar al juez, y la corrida sigue.
  - Falla una llamada al juez (red, 4xx/5xx, cambio de la beta) o hay un error inesperado en una pregunta: el error se registra en esa pregunta y la corrida sigue. No hay reintentos propios, solo los del SDK.
  - Los criterios y las preguntas con error no entran en los promedios.

## Data
- Entrada: el archivo golden JSON, versionado.
  - Cada caso trae solo un `id` único y la `question`. No hay SQL ni respuesta de referencia.
  - Todas las preguntas se pueden responder con el dataset demo de #2. El archivo se escribe para ese dataset y se reemplaza junto con él.
  - Es un set chico que ejercita los tres criterios: al menos una pregunta debería producir un gráfico, por ejemplo una evolución en el tiempo. La cantidad y el texto exactos se definen en el plan.
- Lo que recibe el juez por pregunta respondida:
  - la pregunta;
  - el contexto de esquema, el mismo que #7 arma desde los metadatos;
  - el SQL ejecutado;
  - el resultado: columnas y filas, acotadas por el tope de 500 filas de #6;
  - la narrativa;
  - la spec validada del gráfico (tipo, eje X, series, título), si no es `null`.

  Cómo se reparte entre llamadas (una por pregunta con todos los criterios, o una por criterio) se decide en el plan. Lo que se juzga (SQL, narrativa, filas) va como contenido a evaluar, nunca como instrucciones para el juez.
- Salida:
  - El resumen en consola, en inglés: el promedio por criterio y los conteos de sin respuesta, rechazados y no aplica.
  - Un reporte JSON por corrida, en una ruta gitignored. Como mínimo trae:
    - la fecha y hora de la corrida, los modelos usados y los promedios y conteos del resumen;
    - por cada pregunta: el id, la pregunta, el SQL, la cantidad de filas, la narrativa, la spec del gráfico (si hay) y el resultado de cada criterio. El resultado es el valor tal cual vino y la confianza, o "no aplica" / "rechazado" / el error;
    - si la pregunta quedó sin respuesta, el motivo; si falló, el error.
  - La forma exacta del JSON y el nombre del archivo se definen en el plan.
- Persistido: solo el reporte. Nada en `data/app.db`. `data/data.db` se usa solo con la conexión read-only.

## Dependencies
- Lo bloquean:
  - #7: generación de SQL con hasta 3 intentos y contexto de esquema.
  - #8: el backend del chat, que trae la función del pipeline en proceso y el paso de insights. No depende de #13 (la UI del chat).
  - #9: la spec validada del gráfico (o `null`) en el resultado del pipeline.
  - #6: ejecución con guardas y tope de 500 filas.
  - #2: dataset demo y `npm run seed`.
- Relacionadas:
  - #10: si ya está, el pipeline incluye la clasificación, y un rechazo deja la pregunta "sin respuesta". Comparte con este issue la llamada a la Decisions API en el módulo de OpenAI y la variable del modelo.
  - #11: cada pregunta golden corre sin turnos previos.
- Externo: la OpenAI API, con Responses para el pipeline y Decisions para el juez. Decisions está en beta pública desde octubre de 2026, y lo que se sabe de ella viene de fuentes secundarias. Al implementar hay que verificar contra la documentación oficial de OpenAI la forma del request, los tipos de pregunta, la forma de la respuesta (incluido `refusal`) y el soporte en el SDK `openai`. Si el SDK no la tipa, se llama por su método genérico de request, como dice `docs/ARCHITECTURE.md`. Nada de este issue es el contrato de la API.

## Acceptance criteria
- [ ] `npm run eval` existe en el `package.json` raíz y corre la evaluación sin levantar el servidor ni pedir `APP_ACCESS_KEY`.
- [ ] El repo trae el archivo golden con preguntas respondibles sobre el dataset demo de #2. Cada caso trae solo `id` y `question`, y al menos una pregunta debería producir un gráfico.
- [ ] Cada pregunta respondida se juzga a través del módulo único de OpenAI. Se piden dos `scores` con rúbrica de 3 niveles, "el SQL responde la pregunta" y "la narrativa es fiel a los datos", más el `predicate` "el gráfico es adecuado" si hay gráfico. Un test con cliente falso verifica qué criterios y rúbricas se le piden al juez y cómo se registra cada valor.
- [ ] Si la spec del gráfico es `null`, el criterio del gráfico queda "no aplica" y no se le pregunta al juez por él (test).
- [ ] Una respuesta con 0 filas se juzga con los dos `scores` y el gráfico queda "no aplica" (test).
- [ ] Si la clasificación rechaza la pregunta o se agotan los intentos de #7, la pregunta queda "sin respuesta" con el motivo que devuelve el pipeline, sin llamar al juez, y la corrida sigue (test).
- [ ] Un `refusal` del juez deja el criterio "rechazado", fuera de los promedios (test).
- [ ] Si el pipeline lanza un error (por ejemplo, una falla de OpenAI) o falla el juez, el error queda registrado en esa pregunta y la corrida sigue (tests).
- [ ] Si falta configuración, el archivo golden es inválido o no existe `data/data.db`: mensaje claro, salida distinta de 0, sin llamadas a OpenAI y sin reporte (tests).
- [ ] El resumen muestra el promedio por criterio y los conteos de sin respuesta, rechazados y no aplica, sin veredicto ni umbrales. Los scores se muestran sobre el máximo de la escala y el predicado como probabilidad promedio. Los promedios solo usan valores juzgados: excluyen los "no aplica", los "rechazado", las preguntas sin respuesta y los errores (test).
- [ ] Una corrida que termina sale con código 0 aunque haya puntajes bajos, preguntas sin respuesta o errores en preguntas (test).
- [ ] El reporte JSON trae los campos de *Data*, con los valores de la Decisions API tal cual vinieron, y se escribe en una ruta que `git check-ignore` confirma ignorada. En los tests se escribe en un directorio temporal.
- [ ] La corrida no escribe en `data/app.db` (test con las dependencias inyectadas).
- [ ] Los tests son offline y deterministas: cliente OpenAI falso, sin red. `npm run lint` y `npm run test:coverage` pasan con cobertura ≥ 85%. El script de entrada solo llama funciones testeadas y queda excluido de la cobertura en `vitest.config.ts`, como permite `docs/ARCHITECTURE.md`.
- [ ] Si este issue suma variables de entorno, quedan en `.env.example` con un placeholder.
- [ ] `README.md` explica cómo correr la evaluación: requisitos (`npm run seed` y un `.env` con claves reales), que cuesta plata, dónde queda el reporte y cómo leer el resumen (promedios y conteos, sin veredicto).
- [ ] La sección *Evaluation* de `docs/ARCHITECTURE.md` refleja lo implementado: los tres criterios dejan de figurar como ejemplo y se saca la marca *(later issue)*.
- [ ] Verificación manual, fuera del gate y con una `OPENAI_API_KEY` real: una corrida contra el `data.db` sembrado imprime el resumen y escribe el reporte.

## Non-functional notes
- Costo: cada pregunta paga una corrida completa del pipeline más las llamadas al juez. Por eso el set es chico, se corre a mano y queda fuera del gate.
- No es determinístico: dos corridas pueden dar puntajes distintos. El resultado se lee como tendencia, no como test, y por eso no hay umbrales.
- Corre secuencial, una pregunta por vez. Es lo más simple: `node:sqlite` es sincrónico y el set es chico.
- Seguridad:
  - Las claves salen de `.env` y el reporte no incluye secretos.
  - El SQL generado pasa por las mismas guardas de #6 que el chat.
  - Lo que se juzga es salida de un LLM y datos, así que se trata como contenido no confiable y nunca como instrucciones para el juez.
- La Decisions API no da justificación, así que el reporte muestra valores sin explicaciones.
- Sin dependencias nuevas: `openai` lo suma #7 y el archivo golden es JSON.

## Assumptions
- La base confirmada es la sección *Evaluation* de `docs/ARCHITECTURE.md` y el "Ok" del usuario en el epic.
- El eval corre el pipeline en proceso, llamando a sus funciones y no a `POST /api/chat`. Viene de `docs/ARCHITECTURE.md`, que dice tres cosas: el eval corre las preguntas "por el pipeline", las funciones del pipeline reciben el cliente como parámetro, y los scripts que solo llaman funciones testeadas quedan fuera de la cobertura. Por eso no necesita servidor ni `APP_ACCESS_KEY`.
- El archivo golden es JSON y su ruta es fija, no configurable:
  - JSON porque no suma dependencias (`workflow/principles.md`: "justificar cada dependencia").
  - Ruta fija porque `docs/ARCHITECTURE.md` deja fijas las rutas hasta que haya un motivo.
- Las preguntas son independientes, sin multi-turn: `docs/ARCHITECTURE.md` habla de "un archivo de preguntas golden".
- No escribe en `data/app.db`. `docs/ARCHITECTURE.md` nombra como salidas del eval el resumen y el reporte JSON, y `app.db` guarda las conversaciones del chat.
- El modelo del juez sale de `.env`, nunca del código (`docs/ARCHITECTURE.md`: "Model ids come from `.env`"). Si la Decisions API necesita un modelo distinto de `OPENAI_MODEL`, se usa la misma variable que defina #10. Fuentes secundarias indican que la beta soporta un único modelo.
- Los valores de la Decisions API se registran tal cual vienen. Según fuentes secundarias, `scores` devuelve una posición ponderada que puede caer entre niveles, `predicates` devuelve una probabilidad, y cualquier pregunta puede volver como `refusal`. Hay que verificarlo al implementar.
- La consola y las claves del JSON van en inglés, porque `workflow/rules.md` pide código y logs en inglés.
- **Contenido del caso golden:** propuesto en el refinamiento y confirmado por el usuario el 2026-10-19. Opción elegida: solo `id` y `question`, y el juez evalúa sin respuesta de referencia.
- **Criterios del juez:** propuesto en el refinamiento y confirmado por el usuario el 2026-10-19. Opción elegida: los 3 aprobados, con SQL y narrativa como `scores` de 3 niveles y el gráfico como `predicate` solo si hay gráfico.
- **Resumen y código de salida:** propuesto en el refinamiento y confirmado por el usuario el 2026-10-19. Opción elegida: sin veredicto ni umbrales; valores tal cual, promedio por criterio y conteos, y salida 0 siempre que la corrida termine.
- **Clasificación (#10):** propuesto en el refinamiento y confirmado por el usuario el 2026-10-19. Opción elegida: el set golden solo trae preguntas respondibles, y si el pipeline no responde, la pregunta queda "sin respuesta" con el motivo y no se juzga.

## Deferred decisions
- La evaluación online y la justificación del juez: ya están diferidas en `docs/ARCHITECTURE.md`.
- Casos golden multi-turn, filtros por id, paralelismo, repeticiones para medir la varianza, comparación con una corrida base y costo en tokens. Se suman cuando aparezca una necesidad real.
- Referencias esperadas por caso (`expectedSql` ejecutado con las guardas de #6, o `expectedAnswer` con los hechos clave). Se pueden sumar después como campos opcionales del caso, pero hay que mantenerlas cada vez que cambia el dataset.
- Criterios extra, como "responde en el idioma de la pregunta", "la narrativa responde directamente la pregunta" o "las sugerencias son relevantes". Sumar un criterio después es una entrada más.
- Veredicto PASS/FAIL por pregunta, umbrales y una salida distinta de 0 si algo falla. Hoy nadie los pidió y obligarían a fijar umbrales arbitrarios. Se pueden sumar sin cambiar el reporte.
- Evaluar la clasificación de #10 con una etiqueta esperada por caso, y probar preguntas fuera de alcance. Se suma cuando #10 tenga sus etiquetas definidas.

## Pull request
Branch: `feat/12-evaluacion-llm-as-a-judge` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- **Decisions API en el módulo LLM** (`backend/src/llm.ts`):
  - `createDecisionClient` arma el cliente con `OPENAI_API_KEY` y una variable nueva, `OPENAI_DECISIONS_MODEL`. Según los tipos del SDK, la beta solo soporta `gpt-6-luna`, distinto de `OPENAI_MODEL`.
  - `requestDecision` devuelve las respuestas en el orden de las preguntas, tal como vienen. Sus fallas son `LlmError`.
  - El fake para los tests es `fakeDecisions`.
- **`npm run eval`** (raíz → `backend`) ejecuta `src/eval-cli.ts`, la entrada fuera de la cobertura, que solo llama a `runEvalCommand` (`src/eval-command.ts`).
  - **Antes de llamar a OpenAI** chequea las 3 variables, el archivo golden, `data/data.db` y sus metadatos. Si algo falla, imprime el motivo y sale con 1, sin reporte.
  - **Por pregunta, en orden,** corre `answerQuestion` sin historial y sin `app.db`, y juzga la respuesta con `evaluateCase` (`src/evaluate.ts`), en una sola llamada a la Decisions API:
    - `score` del SQL en 3 niveles (0 a 2);
    - `score` de la narrativa en 3 niveles;
    - `predicate` del gráfico, solo si hay spec. Si no, el criterio no aplica.
  - **El input del juez** (`prompts/judge-input.liquid`) lleva la pregunta, el esquema, el SQL, todas las filas, la narrativa y la spec, marcados como contenido a juzgar. La rúbrica va aparte, en las `instructions` de cada pregunta.
  - **Casos especiales:**
    - con los intentos agotados, la pregunta queda "sin respuesta", con el motivo;
    - un `refusal` deja el criterio "rechazado";
    - una falla del pipeline o del juez, o una respuesta con una forma inesperada (otro tipo, sin valor), queda como error de esa pregunta, y la corrida sigue.
  - **Salida:**
    - una línea por pregunta y el resumen: el promedio por criterio solo sobre valores juzgados (scores sobre 2, el gráfico como probabilidad promedio) y los conteos. Sin veredicto ni umbrales;
    - el reporte JSON en `data/eval/eval-<timestamp>.json` (gitignored), con los modelos, el resumen y, por pregunta, las respuestas de la Decisions API tal como vinieron;
    - sale con 0 siempre que la corrida termine. Si el reporte no se puede escribir, lo dice y sale con 1.
- **Archivo golden:** `backend/eval/golden.json` trae 7 preguntas respondibles sobre el dataset demo, 5 de ellas con gráfico. Una es en español.
- **Configuración:**
  - `.env.example` suma `OPENAI_DECISIONS_MODEL=gpt-6-luna`. No es un placeholder, sino el único id válido hoy.
  - El mensaje de una variable de OpenAI faltante dice "Add it to the .env in the repo root (see .env.example)".
- **Docs:**
  - `README.md`: la sección *Evaluating answers* y la estructura;
  - `docs/ARCHITECTURE.md`: *Evaluation* reescrita, sin *(later issue)*, y también *LLM layer* y *Configuration*;
  - el diagrama: `npm run eval` pasa a sólido.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (26 archivos, 373 tests). El flake de arranque de los workers del frontend apareció en algunas corridas; al repetirlas pasaron.
- Coverage: 100% en sentencias, funciones y líneas, y 99,67% en ramas (umbral 85%). La única rama sin cubrir es de #8 (`conversations.ts:78`). `eval-cli.ts` quedó excluido en `vitest.config.ts`. Archivos nuevos o cambiados bajo el umbral: ninguno.
- Manual: pass, con la API real (`gpt-5.4-mini` para el pipeline y `gpt-6-luna` para el juez).
  - Primero una llamada de prueba confirmó la forma de la respuesta: el `score` va de 0 a 2, con `confidence` y las probabilidades por nivel, y el `predicate` trae una `probability`.
  - `npm run eval` con las 7 preguntas tardó 34 s e imprimió las líneas y el resumen:
    - SQL 1.84/2;
    - narrativa 1.99/2;
    - gráfico 0.99, con 5 juzgados y 2 que no aplican.
  - El reporte quedó en `data/eval/`, y `git check-ignore` confirma que está ignorado.
  - La pregunta sobre 2023 sacó 0.92 en SQL, porque el dataset es de 2024 y 2025. Se reemplazó por una de 2024.
- Self-review: 2 rondas con agente separado.
  - Ronda 1, un blocker: una respuesta del juez con forma inesperada rompía toda la corrida al armar el resumen, sin reporte. Se arregló con tests, y ahora queda como error de la pregunta.
  - Ronda 2, sin blockers.
  - Sugerencias aplicadas:
    - pregunta golden respondible;
    - docs al día;
    - un test que verifica que `data.db` no cambia;
    - el error al escribir el reporte;
    - el mensaje de variable faltante.

  (separate agent)
- Plan: aprobado de antemano por el usuario para el trabajo desatendido del 2026-10-19.
- Security: pass.
  - Lo que se juzga va en el `input` de la Decisions API, nunca en las instrucciones.
  - El SQL pasa por las guardas de #6.
  - El reporte no tiene secretos ni filas.
  - Las claves salen de `.env`, y los tests usan claves falsas.
- Docs: updated `README.md`, `docs/ARCHITECTURE.md`, `docs/ARCHITECTURE_DIAGRAM.md`, `.env.example`

### Out of scope / follow-ups
- Para #10, sin issue nuevo:
  - reutilizar `OPENAI_DECISIONS_MODEL` y `requestDecision` para la clasificación;
  - cuando el pipeline sume el clasificador, agregar su dependencia a `EvalDeps`;
  - que un rechazo de la clasificación mantenga la forma `{ ok: false, kind, message }`, para que el eval lo cuente como "sin respuesta".
- Tu `.env` no tenía `OPENAI_DECISIONS_MODEL`: le agregué `OPENAI_DECISIONS_MODEL=gpt-6-luna` al final, sin tocar el resto.
