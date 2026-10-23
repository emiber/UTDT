---
id: 30
title: Responder con varias tablas y gráficos cuando el mensaje pide resultados separados
type: feat
status: refined
parent:
created: 2026-10-22
---

## Goal
Que un mensaje que pide varios resultados por separado ("los 5 clientes con más ventas y un listado separado de los 3 productos con más ventas") reciba una sección por resultado, cada una con su texto, su tabla y su gráfico. Hoy cada turno corre una sola consulta, y el modelo junta los listados en una tabla con `UNION ALL`. El texto y el gráfico arrastran la mezcla, y a veces el texto dice que son "dos listados separados".

## Scope
- In:
  - **Generación de SQL** (`backend/src/generate-sql.ts`, `prompts/sql-system.liquid`, `prompts/sql-user.liquid`): la salida pasa de un `sql` a una lista de 1 a 5 consultas, cada una con un título. El campo `language` sigue primero. Reglas nuevas del prompt:
    - más de una consulta solo cuando el mensaje pide resultados separados que no entran en una tabla;
    - una comparación o un desglose que entra en una tabla sigue siendo una consulta;
    - nunca juntar listados distintos en una tabla con `UNION` o `UNION ALL`;
    - el título de cada consulta, corto y en el idioma de la pregunta;
    - un pedido de mostrar, graficar o rehacer la última respuesta repite todas sus consultas, cambiadas solo en lo que se pide.
  - **Ejecución:** cada consulta pasa por las guardas de #6 por separado, con el tope de 500 filas por consulta.
  - **Reintentos:** si alguna consulta falla, se regenera el set completo, con el SQL y el error de cada consulta que falló como feedback. Siguen siendo 3 intentos en total, como hoy.
  - **Insights** (`backend/src/insights.ts`, `prompts/insights-system.liquid`, `prompts/insights-user.liquid`): una sola llamada ve todos los resultados. Por cada uno recibe el título, el SQL, las columnas, la cantidad de filas y las primeras 50. Devuelve un texto y un gráfico (o `null`) por resultado, en el mismo orden, y 3 sugerencias para toda la respuesta.
  - **Bloques** (`backend/src/pipeline.ts`): con un resultado, la respuesta queda igual que hoy. Con dos o más, va una sección por resultado (ver *Expected behavior*).
  - **Turno e historial** (`backend/src/chat.ts`): las consultas se guardan en la columna `sql`, y los textos en `narrative`, unos después de otros y separados por una línea en blanco. `app.db` no cambia de esquema, y el historial le muestra al modelo todo lo del turno.
  - **Eval** (`backend/src/evaluate.ts`, `prompts/judge-input.liquid`): el judge ve todas las consultas con sus filas, los textos y los gráficos. Aplica los mismos 3 criterios a la respuesta completa, en una sola llamada por caso. El criterio del gráfico se pregunta si hay al menos uno. Se suma al golden un caso de dos listados.
  - Tests unitarios y docs: los pasos del pipeline y la sección del eval en `docs/ARCHITECTURE.md`, y `README.md` donde describa las respuestas.
- NOT in:
  - Cambios en el frontend. `ResponseBlocks.vue` ya recorre cualquier lista de bloques en orden. Se verifica a mano que dos secciones se vean bien.
  - Respuestas parciales: mostrar las consultas que funcionaron cuando otra falló.
  - Partir la pregunta en subpreguntas, cada una con su pipeline.
  - Un campo `title` en el bloque de tabla.
  - Que el modelo sume tablas que nadie pidió.
  - Juzgar cada resultado por separado en el eval.
  - Una tabla `turn_queries` en `app.db`.
  - Cambiar la clasificación de #10.

## Expected behavior
- **Normal case:**
  - El mensaje del reporte da dos secciones:
    1. "Top 5 clientes por ventas", con su texto, la tabla `Cliente | Ventas` y su gráfico.
    2. "Top 3 productos por ventas", igual.

    Ninguna tabla mezcla clientes y productos, y el texto no los compara como si fueran una sola serie.
  - Con un resultado, la respuesta es la de hoy: texto, tabla y gráfico, sin encabezado. Por ejemplo, "Ventas por mes en 2025".
  - Una comparación que entra en una tabla ("ventas por país en 2024 y 2025") sigue siendo una consulta.
- **Sección:** con dos o más resultados, cada uno da, en el orden de las consultas:
  1. un bloque de texto que empieza con `### <título>` y sigue con su texto;
  2. su tabla, salvo que no tenga filas o sea un valor único (1 × 1), como hoy;
  3. su gráfico, si la spec encaja en ese resultado (`buildChart` sobre sus propias filas).

  Las 3 sugerencias son para toda la respuesta.
- **Edge cases:**
  - Una sección sin filas: su texto dice que no hay resultados, y no tiene tabla ni gráfico. Las demás secciones siguen.
  - Un gráfico que no encaja se descarta solo en su sección, con el warning "Chart dropped" de hoy.
  - Un título con saltos de línea se escribe en una sola línea, para que el encabezado no se rompa.
  - Un seguimiento como "mostralo como gráfico de torta", después de una respuesta de dos secciones, repite las dos consultas. Uno como "mostrá solo el de productos" repite solo esa.
- **Errors:**
  - Si alguna consulta del set falla (guarda, error de SQL o tope de filas), se reintenta el set completo. Si el tercer intento también falla, la respuesta es la de "no pude responder" de hoy, y el error del turno es el de la primera consulta que falló.
  - Si el modelo devuelve 0 consultas, más de 5, o una sin SQL o sin título, es un `LlmError` (502), como hoy cuando no devuelve SQL.
  - Si los insights devuelven una cantidad de textos distinta de la de resultados, es un `LlmError` (502), como hoy con unos insights inválidos.
  - Si el pipeline falla después de generar SQL, el turno guarda las consultas del último intento, como hoy guarda el último SQL.

## Data
- **Salida del paso de SQL** (forma propuesta): `{ language, queries: [{ title, sql }] }`, de 1 a 5 consultas.
- **Salida de los insights** (forma propuesta): `{ language, sections: [{ narrative, chart }], suggestions }`, con una sección por consulta, en el mismo orden.
- **API** (`POST /api/chat`): la misma forma `{ conversationId, turnId, blocks, suggestions }`, con más bloques cuando hay varias secciones. El frontend no cambia de tipos.
- **`app.db`:** sin cambio de esquema.
  - `turns.sql` guarda las consultas, separadas por una línea en blanco.
  - `turns.narrative` guarda los textos de las secciones, con sus encabezados.
  - `turns.response` guarda los bloques, como hoy.
- **Reporte del eval:** por caso, las consultas (título, SQL y cantidad de filas), los textos y los gráficos.
- **Golden:** un caso nuevo con el mensaje del reporte, como pregunta de datos de un turno.

## Dependencies
- Se apoya en #6 (guardas), #7 (SQL), #9 (gráficos), #10 (clasificación y bloques) y #12 (eval), todos cerrados.
- #28 también cambia `evaluate.ts` y `judge-input.liquid`. El que se haga segundo se adapta al otro. Si #28 va primero, el caso nuevo del golden usa su formato sin cambios: es una pregunta de datos sin historial.
- No necesita un issue de frontend.
- Externo: OpenAI (Responses API), como hoy.

## Acceptance criteria
- [ ] El paso de SQL devuelve de 1 a 5 consultas con título, y cada una pasa por las guardas de #6 por separado.
- [ ] Si una consulta falla, se reintenta el set completo con el feedback de las que fallaron, hasta 3 intentos. Si el último falla, la respuesta es la de "no pude responder".
- [ ] Con un resultado, los bloques son los de hoy (sin encabezado). Con dos o más, van en secciones, como en *Expected behavior*.
- [ ] Una sección sin filas o con un gráfico que no encaja no afecta a las demás.
- [ ] Las respuestas inválidas del modelo (0 o más de 5 consultas, o una cantidad de textos que no coincide) dan un `LlmError`.
- [ ] El turno guarda las consultas y los textos juntos en `sql` y `narrative`, y el historial del turno siguiente los incluye.
- [ ] El prompt de SQL tiene las reglas de *Scope*, con sus tests, como los demás prompts.
- [ ] El eval juzga la respuesta completa con los 3 criterios, el reporte trae las consultas, y el golden tiene el caso de dos listados.
- [ ] Tests unitarios offline para todo lo anterior. La cobertura sigue sobre el 85% y el quality gate pasa.
- [ ] `docs/ARCHITECTURE.md` (los pasos del pipeline y el eval) y `README.md` describen las respuestas con varias secciones.
- [ ] La sección Verification del PR incluye:
  - una prueba real con el mensaje del reporte, con las dos secciones en la UI;
  - una pregunta de un solo resultado que se ve igual que hoy;
  - un seguimiento sobre la respuesta de dos secciones;
  - una corrida de `npm run eval`.

## Non-functional notes
- **Llamadas y timeout:** un turno hace las mismas llamadas a OpenAI que hoy (clasificación, hasta 3 intentos de SQL e insights), así que los 6 minutos de espera de la UI siguen alcanzando. Lo que crece son los tokens: la salida de SQL es más larga, y los insights ven hasta 5 × 50 filas de muestra.
- **Tamaño de la respuesta:** puede llegar a 5 × 500 filas. El tope por valor de #15 sigue aplicando. El pendiente 4 de `issues/pendientes.md` (el tamaño total de una respuesta) pasa a importar un poco más, pero sigue fuera de alcance.
- **Seguridad:**
  - cada consulta pasa por la guarda de una sola sentencia de solo lectura por separado;
  - los títulos son texto del modelo, y se muestran como markdown con micromark, que ya escapa el HTML;
  - las consultas, los títulos y las filas van al judge y a los insights como contenido, nunca como instrucciones.

## Assumptions
Confirmadas en el refinamiento (2026-10-22):
- El usuario quiere que el bot pueda generar varias tablas y gráficos por separado.
- Un solo paso de SQL devuelve varias consultas. No se parte la pregunta en subpreguntas.
- Una sección por resultado: un texto con un título como encabezado markdown, su tabla y su gráfico. El frontend no cambia.
- Como máximo 5 consultas por turno.
- Si una consulta falla, se reintenta el set completo. No hay respuestas parciales.
- Varias consultas solo cuando el mensaje pide resultados separados. Se prohíbe juntar listados distintos con `UNION`.
- El eval juzga la respuesta completa con los mismos criterios, y se suma un caso al golden.
- Las consultas se guardan juntas en la columna `sql`.

Propuestas al escribir el issue, sin una pregunta aparte:
- El tipo pasa de `fix` a `feat` y el título cambia, porque el arreglo es una capacidad nueva.
- Con un solo resultado no hay encabezado, para que las respuestas de hoy no cambien.
- El error del turno, cuando falla el set, es el de la primera consulta que falló.
- Un título con saltos de línea se escribe en una sola línea.
- Si los insights devuelven una cantidad de textos distinta de la de resultados, es un `LlmError`, igual que cualquier salida inválida de hoy.

## Deferred decisions
- **Respuestas parciales** (mostrar lo que salió cuando una consulta sigue fallando). Sumarían un caso nuevo en el pipeline, el turno y el eval. Se suman si el reintento del set completo no alcanza.
- **Un título en el bloque de tabla.** Con el encabezado en el texto no hace falta, y evita tocar el frontend.
- **Juzgar cada resultado por separado** en el eval. Hoy alcanza con juzgar la respuesta completa.
- **Una tabla `turn_queries`.** Solo valdría la pena si alguien necesita consultar las consultas una por una.
- **Tablas que el modelo sume por su cuenta.** Respuestas menos predecibles y más tokens.
- **Un tope del tamaño total de la respuesta:** sigue en `issues/pendientes.md` (pendiente 4).
