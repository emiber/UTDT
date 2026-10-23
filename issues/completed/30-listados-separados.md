---
id: 30
title: Responder con varias tablas y gráficos cuando el mensaje pide resultados separados
type: feat
status: closed
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

## Pull request
Branch: `feat/30-listados-separados` → `main`

### Qué hace
- **Generación de SQL** (`backend/src/generate-sql.ts`, prompts `sql-system` y `sql-user`): la salida pasa de un `sql` a `{ language, queries }`, con 1 a 5 consultas, cada una con su título.
  - Cada consulta pasa por las guardas de #6 por separado.
  - Si alguna falla se regenera el set completo, con el SQL y el error de cada consulta que falló. Siguen siendo 3 intentos. El error del turno es el de la primera consulta que falló.
  - El prompt pide varias consultas solo para resultados separados que no entran en una tabla, y prohíbe juntar listados distintos con `UNION`.
  - Un set mal formado (ninguna consulta, más de 5, una sin SQL o sin título) es un `LlmError`.
- **Insights** (`backend/src/insights.ts`, prompts `insights-*`): una sola llamada ve todos los resultados y devuelve una sección (texto y gráfico) por resultado, más las 3 sugerencias de toda la respuesta. El esquema fija la cantidad de secciones, y el código la vuelve a validar. Con un resultado el prompt queda igual que antes.
- **Pipeline** (`backend/src/pipeline.ts`): con un resultado, los bloques son los de siempre. Con dos o más, cada sección lleva su texto con `### título`, su tabla y su gráfico, armados sobre sus propias filas. El resultado de datos pasa a traer `results[]`, con `sql` y `narrative` ya unidos para el turno, así que `chat.ts` no cambió.
- **Turno e historial:** las consultas y los textos se guardan juntos en `turns.sql` y `turns.narrative`. `app.db` no cambia de esquema.
- **Eval** (`backend/src/evaluate.ts`, `judge-input.liquid`, `golden.json`): el judge ve todas las consultas con sus filas y gráficos, y el texto de cada una, y aplica los mismos 3 criterios a la respuesta completa. El reporte trae las consultas. El golden suma el caso `separate-lists`, con el mensaje del reporte.
- **Docs:** `docs/ARCHITECTURE.md` (pasos 3 a 6 del pipeline, el endpoint de chat y el eval) y `README.md`. En `issues/pendientes.md` se anotó el efecto sobre el tamaño de una respuesta.
- **El frontend no cambió:** `ResponseBlocks.vue` ya recorre cualquier lista de bloques en orden.

### Hallazgo de la verificación real
- La primera corrida de `npm run eval` dio narrativa 1,64/2, con `separate-lists` en 0,15 aunque todas las cifras del texto eran correctas.
- Con la misma respuesta fija (y el judge es determinista con la misma entrada), el judge daba 1,31 con los encabezados `### título` que arma el backend y 1,88 sin ellos.
- Se corrigió mostrándole a cada resultado su propio texto, sin encabezado. La redacción del criterio de narrativa quedó como estaba.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (33 archivos, 591 tests; antes 532)
- Coverage: 99,73% de statements, 97,37% de branches, 99,6% de funciones y 100% de líneas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno. Los únicos que no llegan al 100% (`conversations.ts`, `eval-command.ts`, `update-prices.ts`, `ChatView.vue`, `UsageView.vue`) no cambiaron.
- Criterios de aceptación:
  - **Paso de SQL, 1 a 5 consultas con título, guardas por separado: pass** (tests y corrida real).
  - **Reintento del set completo, 3 intentos, "no pude responder" si el último falla: pass** (tests de `generate-sql`, `pipeline` y `chat`).
  - **Bloques con un resultado como hoy y en secciones con dos o más: pass.** En la corrida real, "Ventas por mes en 2025" salió sin encabezado, con texto, tabla y gráfico de línea.
  - **Sección sin filas o gráfico que no encaja sin afectar a las demás: pass** (tests del pipeline).
  - **Respuestas inválidas del modelo dan `LlmError`: pass** (tests de `generate-sql` e `insights`).
  - **Consultas y textos juntos en `sql` y `narrative`, y el historial los incluye: pass** (tests de `chat`, y los seguimientos de la corrida real).
  - **Reglas del prompt de SQL con sus tests: pass.**
  - **Eval: pass.** Juzga la respuesta completa, el reporte trae las consultas y el golden tiene el caso.
  - **Docs: pass.**
- Verificación real, con OpenAI y un `app.db` temporal. No se tocó tu `app.db` ni tus puertos: se armó la app en proceso con `buildApp` y `inject`.
  - **El mensaje del reporte:** dos secciones, "Top 5 clientes" y "Top 3 productos", cada una con su tabla y su gráfico de barras. Dos consultas guardadas, sin `UNION`.
  - **"Quiero un listado de todos los clientes y un listado de todos los productos. Cada uno por separado"** (turno 109 de `app.db`): dos secciones con dos tablas y sin el `Columna 1…4` de antes ni gráfico.
  - **Seguimientos sobre la respuesta de dos secciones:**
    - "mostralo como gráfico de torta" repitió las dos consultas, con los dos gráficos en torta;
    - "mostrá solo el de productos" repitió solo esa consulta;
    - "and now only the customers, as a pie chart" repitió solo la de clientes, en torta y con los alias en inglés.
  - **"Total sales per country in 2024 and 2025"** siguió siendo una sola consulta.
  - **UI: n/a.** No hay navegador en esta sesión. Los `###` salen como `<h3>` con el estilo por defecto. Queda para verlo en `http://localhost:5173`.
- `npm run eval` (real, después del arreglo del judge): 8 preguntas, 8 con respuesta, 0 errores. SQL 2,00/2, narrativa 1,92/2, gráfico 0,99.
  - Las 7 preguntas de antes: SQL 2,00 en todas, narrativa entre 1,97 y 2,00, y gráfico entre 0,96 y 1,00. Es el rango de las corridas anteriores (narrativa 1,95 a 2,00).
  - `separate-lists`: SQL 1,99, narrativa 1,43, gráfico 0,98.
  - La rúbrica de SQL y de gráfico cambió de redacción para admitir varios resultados, y en el input del judge el gráfico va antes de la narrativa. Esta corrida no es estrictamente comparable con las anteriores.
- Self-review: 1 ronda con un agente nuevo (separado); sin bloqueantes.
  - **Aplicadas:** el endpoint de chat en `docs/ARCHITECTURE.md` todavía describía un solo resultado, los títulos entran en la regla de "datos, no instrucciones" del prompt de insights (con su test), y el JSDoc de `buildInsights`.
  - **No aplicadas:** la legibilidad del historial con dos consultas. Se probó en real ("mostrá solo el de productos") y elige bien la consulta, así que no hace falta etiquetarlas.
  - **Anotadas:** el baseline del eval (arriba) y las hasta 15 consultas seguidas de un turno (abajo).
- Plan: aprobado por el usuario ("Plan aprobado", 2026-10-22). Antes de empezar, el usuario delegó qué hacer con `.vscode/settings.json`: se versionó, formateado con Prettier porque `npm run lint` lo rechazaba, en `chore/vscode-settings` (mergeado a `main`).
- Security: pass. Cada consulta pasa por la guarda de una sola sentencia de solo lectura, y los títulos y las filas van a los prompts como datos. Los títulos se muestran con micromark, que escapa el HTML. No hay secretos en el diff.
- Docs: updated `docs/ARCHITECTURE.md`, `README.md` e `issues/pendientes.md`

### Out of scope / follow-ups
- Un turno puede traer hasta 5 × 500 filas y hasta 15 consultas de `node:sqlite` seguidas, porque en cada intento corren todas aunque una falle. Es el ítem 4 de `issues/pendientes.md`, ya actualizado, y la decisión diferida del timeout de las consultas.
- En el caso nuevo, la narrativa de las respuestas con varios resultados sacó 1,43/2 contra ~2,00 de las de un resultado. Es una sola corrida; si se repite, conviene mirar por qué antes de tocar el judge.
- Mirar las dos secciones en la UI.
