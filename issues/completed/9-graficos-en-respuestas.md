---
id: 9
title: Mostrar gráficos en las respuestas del chat
type: feat
status: closed
parent: 1
created: 2026-10-19
---

## Goal
Que las respuestas del chat que traen datos muestren un gráfico, además de la narrativa y la tabla de #8, para leer el resultado de un vistazo. Como dijo el usuario en el epic, "parte de esto estará dado por la respuesta de la API": el LLM solo elige cómo graficar, el backend arma los datos desde las filas reales y el frontend dibuja. Así el gráfico no puede inventar números.

## Scope
- In:
  - **Spec del gráfico en la llamada de insights de #8.** Se agrega al schema de Structured Outputs un campo `chart`, que puede ser `null`: `{ type, x, series, title }`.
    - `type` es `bar`, `line`, `pie` o `doughnut`.
    - `x` es el nombre de una columna del resultado; `series`, una lista de nombres de columnas; `title`, un texto.
    - Va en la misma llamada: no se agrega ninguna llamada al LLM.
  - **Instrucciones en el prompt de insights:**
    - qué tipo conviene a cada forma de datos;
    - que `pie` y `doughnut` llevan una sola serie;
    - que proponga un gráfico solo cuando aporta algo a la tabla, y devuelva `chart: null` en dos casos:
      - el resultado no se puede graficar: no tiene filas, es un único valor o no tiene columnas numéricas;
      - el gráfico no suma nada a la tabla, p. ej. con 1 o 2 filas;
    - que `title` va en el idioma de la pregunta;
    - que la narrativa no menciona el gráfico, porque el backend puede descartarlo.
  - **Cantidad total de filas en el input de insights:** ya la manda #8, así que este issue solo la menciona en las instrucciones del prompt. El LLM ve solo una muestra de las filas y necesita el total para elegir el tipo (p. ej., para no proponer un `pie` de 80 porciones).
  - **Validación y armado en el backend:** una función que recibe la spec y el resultado de la consulta de #6 (`columns` + `rows`) y devuelve el bloque `chart` o, si la spec no sirve, ningún bloque y el motivo. Las reglas están en *Expected behavior*. Una spec inválida no rompe la respuesta: se descarta el gráfico y se loguea un warning con el motivo.
  - **El bloque en la respuesta:** `POST /api/chat` agrega el bloque `chart` al final de `blocks`, después de la tabla. Se extiende el tipo de los bloques, y su schema de respuesta si #8 define uno.
  - **La spec para #12:** el resultado del pipeline en proceso deja disponible la spec validada, además del bloque, para que #12 la juzgue sin rearmarla. Si no hay gráfico, deja `null`: con `chart: null` y también cuando la spec se descartó por inválida. No viaja en la respuesta de `POST /api/chat`.
  - **Frontend:**
    - un componente que dibuja el bloque `chart` con vue-chartjs, para los cuatro tipos, con su título y la paleta por defecto de Chart.js (plugin `Colors`);
    - el renderer de bloques de #13 lo usa para los bloques `chart`;
    - se extiende el tipo de bloques del frontend.
  - Dependencias `chart.js` y `vue-chartjs` en `frontend/package.json`.
  - Docs: la descripción de la respuesta en `docs/ARCHITECTURE.md` lista los campos del bloque `chart`.
  - Tests unitarios del backend y del frontend.
- NOT in:
  - Transformar los datos para graficar: pivotar de formato largo a ancho, agregar, ordenar o recortar filas (ver *Deferred decisions*).
  - Reintentar la llamada de insights cuando la spec es inválida (ver *Deferred decisions*).
  - Nombres legibles para las series, formato de ejes (moneda, %, fechas), colores propios y otros tipos de gráfico (área, scatter, etc.).
  - Interacción más allá de la que trae Chart.js (tooltip y leyenda): exportar el gráfico, alternar entre tabla y gráfico, zoom.
  - Gráficos en respuestas sin resultado de SQL: aclaraciones y preguntas fuera de alcance (#10), o errores del pipeline (#8).
  - Mandar el gráfico como contexto multi-turn: #11 manda pregunta, SQL y narrativa.

## Expected behavior
- Caso normal:
  1. El usuario pregunta "ventas por mes en 2024" y la consulta devuelve `mes` y `total` (12 filas).
  2. El LLM propone `{ "type": "line", "x": "mes", "series": ["total"], "title": "Ventas por mes en 2024" }`.
  3. La respuesta trae, después de la tabla, un bloque `chart` con las 12 etiquetas de `mes` y un dataset `total` con los 12 valores reales.
  4. El frontend dibuja un gráfico de líneas con ese título.
- Varias series: `"series": ["ventas", "costo"]` da dos datasets sobre las mismas etiquetas.
- Edge cases:
  - `chart: null`: la respuesta no trae bloque `chart`, el resto queda igual y no se loguea ningún warning. Es lo esperado cuando el resultado no se puede graficar o el gráfico no suma nada a la tabla (ver *Scope*).
  - Resultado sin filas: la respuesta trae solo el bloque `text`, sin tabla ni gráfico, como define #8. El prompt pide `chart: null`; si el LLM igual devuelve una spec, se descarta como inválida (ver *Errores*).
  - Una o dos filas: el prompt pide `chart: null`, pero el backend no impone ese criterio. Si llega una spec válida, el bloque se arma igual, con un punto o una barra por fila. Si el LLM elige bien lo mide #12.
  - Un `null` en una serie queda como `null` en los datos, y Chart.js deja el hueco.
  - Valores de `x` repetidos: quedan como puntos separados. El backend respeta el orden de las filas del SQL: no agrupa, no ordena y no recorta.
  - `pie` o `doughnut` con una serie: una porción por fila.
- Errores. La spec es inválida para el resultado, y el backend no arma el bloque, si:
  - el resultado no tiene filas;
  - `x` o alguna serie no nombran exactamente una columna del resultado: el nombre no está en `columns`, o está más de una vez (#6 conserva las columnas repetidas, p. ej. `SELECT a.id, b.id`);
  - `series` está vacía, o alguna serie es la misma columna que `x`;
  - algún valor de una serie no es un número ni `null` (p. ej., un texto, aunque parezca un número);
  - `type` es `pie` o `doughnut` y `series` no tiene exactamente una columna.

  En esos casos se descarta el gráfico y la respuesta sale igual: `POST /api/chat` responde `200` con los bloques que tendría sin gráfico (narrativa y tabla, o solo narrativa si no hay filas) y las sugerencias. El backend loguea un warning con el motivo y no reintenta la llamada de insights. En el resultado del pipeline, la spec queda en `null`.
- El frontend no revalida el bloque: lo dibuja tal como llega.

## Data
- Entrada de la llamada de insights, que arma #8: pregunta, SQL, columnas, muestra de filas y cantidad total de filas (ver *Scope*). Como #6 rechaza los resultados de más de 500 filas en vez de truncarlos, el total es el largo de `rows`.
- Entrada del armado: el resultado de #6, `{ columns: string[], rows: unknown[][] }`, con cada fila alineada con `columns`. Los valores son `number`, `string`, `null` o `Uint8Array` (BLOB).
- Salida del LLM: lo que ya devuelve en #8 (narrativa y sugerencias) más `chart`, que es `{ type, x, series, title }` o `null`.
- Salida del armado: el bloque `chart` y la spec validada, o ningún bloque y el motivo del descarte.
- Bloque en `blocks`, con los datos tomados de las filas reales:

  ```json
  {
    "type": "chart",
    "chartType": "bar",
    "title": "Ventas por mes",
    "labels": ["2024-01", "2024-02"],
    "datasets": [{ "label": "total", "data": [1200.5, null] }]
  }
  ```

  - `type` es el discriminador de bloques de #8, así que el tipo de gráfico va en `chartType`.
  - `labels`: los valores de la columna `x`, como texto, en el orden de las filas.
  - `datasets`: uno por serie, en el orden de `series`. `label` es el nombre de la columna y `data`, sus valores.
  - `labels` y `datasets` tienen la forma de `data` de Chart.js. El bloque no lleva colores ni estilos: los pone el frontend.
- Resultado del pipeline en proceso: además de lo que define #8, la spec validada o `null`. Solo lo usa #12.
- Persistencia: nada nuevo. El bloque viaja dentro de la respuesta que #8 guarda en el turno.

## Dependencies
- Depende de #8 (backend): la llamada de insights, que ya manda el total de filas, la lista de `blocks`, la persistencia del turno y la función del pipeline. A través de #8 usa el resultado de la consulta de #6 (`columns` + `rows`) y el módulo de OpenAI de #7, con su cliente falso para los tests.
- Depende de #13 (frontend): la vista de chat y su renderer de bloques, al que este issue le suma el bloque `chart`.
- Bloquea a #12, que juzga la spec del gráfico ("el gráfico es adecuado") y marca "no aplica" cuando el resultado del pipeline trae `null`, también si la spec se descartó por inválida.
- No se cruza con #11: el historial no incluye bloques `chart`, pero la spec se pide en la llamada de insights, que ya recibe ese historial.
- Servicios externos: la Responses API, dentro de la llamada de insights que ya existe. Sin variables de entorno nuevas.

## Acceptance criteria
- [ ] El request de insights que recibe el cliente falso incluye:
  - en su JSON schema, el campo `chart` nullable, con `type` limitado a `bar`, `line`, `pie` y `doughnut`, más `x`, `series` y `title`;
  - en sus instrucciones, que devuelva `chart: null` si el resultado no se puede graficar o si el gráfico no suma nada a la tabla (p. ej., 1 o 2 filas), y que la narrativa no mencione el gráfico;
  - en su input, la cantidad total de filas.
- [ ] Con una spec válida (una columna `x` y dos series numéricas), `POST /api/chat` responde con un bloque `chart` después de la tabla:
  - `chartType` y `title` vienen de la spec;
  - `labels` son los valores de `x` como texto, en el orden de las filas y sin agrupar, aunque se repitan;
  - hay un dataset por serie, con el nombre de la columna y los valores de las filas reales, no números escritos por el LLM.
- [ ] Una spec `pie` y otra `doughnut` con una sola serie dan un bloque válido. Una spec válida sobre un resultado de una sola fila también da bloque.
- [ ] Con `chart: null`, la respuesta no trae bloque `chart`, el resto de los bloques no cambia y no se loguea ningún warning.
- [ ] Un `null` en una serie aparece como `null` en `data`.
- [ ] Cada caso inválido de *Expected behavior* da `200` con los bloques que tendría sin gráfico y las sugerencias, sin bloque `chart`, y el cliente falso recibe una sola llamada de insights. Los casos son: resultado sin filas (la respuesta trae solo el bloque `text`), `x` inexistente, `x` con un nombre repetido en `columns`, `series` vacía, una serie inexistente, una serie igual a `x`, un texto en una serie, y `pie` o `doughnut` con dos series. La función de armado devuelve el motivo y el endpoint lo loguea como warning.
- [ ] El resultado del pipeline en proceso trae la spec validada cuando hay bloque `chart`, y `null` cuando no lo hay: con `chart: null` y con cada caso inválido. La respuesta HTTP no la incluye.
- [ ] El componente del gráfico le pasa a vue-chartjs el tipo, `labels` y `datasets` del bloque, y muestra el título, para los cuatro tipos. Los tests mockean vue-chartjs, porque jsdom no implementa canvas.
- [ ] El renderer de bloques de #13 dibuja un bloque `chart` en su lugar dentro de la lista de bloques.
- [ ] `chart.js` y `vue-chartjs` quedan en las `dependencies` de `frontend/package.json`. El backend no suma dependencias ni variables de entorno.
- [ ] `docs/ARCHITECTURE.md` lista los campos del bloque `chart` (`chartType`, `title`, `labels`, `datasets`).
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85% (líneas, sentencias, funciones y ramas), y el código nuevo queda cubierto.

## Non-functional notes
- Fidelidad: los números del gráfico salen siempre de las filas del resultado. El LLM solo nombra columnas, y esos nombres se aceptan solo si están entre las columnas del resultado.
- Volumen: el gráfico usa todas las filas del resultado, que ya vienen acotadas por el tope de 500 filas de #6. No tiene un tope propio. Los valores viajan dos veces (tabla y gráfico), y con ese tope el tamaño de la respuesta no preocupa.
- Costo y latencia: la spec viene en la misma llamada de insights, sin llamadas extra ni reintentos.
- Log: el warning de un gráfico descartado lleva el motivo, no las filas.
- Tests offline: cliente falso de OpenAI en el backend y vue-chartjs mockeado en el frontend. Los unit tests no miden si el LLM elige bien el gráfico, porque el cliente es falso: eso lo mide #12.

## Assumptions
- **El bloque `chart` va al final, después de la tabla.** Fuente: `docs/ARCHITECTURE.md` describe la respuesta como "a short narrative, a table, and a chart" y enumera los bloques como `text`, `table`, `chart`. El proyecto de referencia usa el mismo orden.
- **`pie` y `doughnut` llevan exactamente una serie.** Fuente: un gráfico de torta muestra las partes de un solo total; Chart.js dibujaría cada serie extra como otro anillo.
- **Un nombre de columna repetido en el resultado es inválido para `x` y las series.** Fuente: #6 conserva las columnas con el mismo nombre (filas como listas), así que ese nombre no identifica una sola columna.
- **La spec validada queda disponible para #12, fuera de la respuesta HTTP.** Fuente: #12 juzga "la especificación del gráfico (tipo, eje X, series, título)", y el bloque no trae el nombre de la columna `x`.
- **Las series aceptan solo números o `null`, sin convertir textos.** Fuente: Chart.js grafica números y deja un hueco en `null`. Convertir textos sería transformar datos, y eso queda fuera.
- **Cada dataset se llama como su columna.** Fuente: la spec aprobada en `docs/ARCHITECTURE.md` (paso 5 del pipeline) trae solo nombres de columnas y un título. Es lo mismo que muestran los encabezados de la tabla de #8.
- **El gráfico usa todas las filas, en el orden del SQL y sin tope propio.** Fuente: `docs/ARCHITECTURE.md`, paso 5: "the backend builds the table and the chart data from the real result rows". El tope ya lo pone #6.
- **La cantidad total de filas va al LLM.** Fuente: `docs/ARCHITECTURE.md`, paso 5: el LLM recibe "a sample of the rows", así que sin el total no sabe cuántas porciones o puntos tendría el gráfico.
- **Los colores los pone el frontend, con la paleta por defecto de Chart.js.** Fuente: `docs/ARCHITECTURE.md` define el bloque como "Chart.js-ready labels + datasets", y el contexto original del issue dice que el frontend solo renderiza.
- **El LLM propone un gráfico solo cuando aporta.** Decisión propuesta durante el refinamiento y confirmada por el usuario el 2026-10-19: devuelve `chart: null` si el resultado no se puede graficar o si el gráfico no suma nada a la tabla (p. ej., 1 o 2 filas).
- **Una spec inválida se descarta sin romper la respuesta.** Decisión propuesta durante el refinamiento y confirmada por el usuario el 2026-10-19: se omite el bloque `chart`, la respuesta sale `200` con el resto de los bloques y las sugerencias, y se loguea un warning con el motivo, sin reintentar.

## Deferred decisions
- **Pivotar de formato largo a ancho**, con una columna "grupo" en la spec, como la transformación long-to-wide del proyecto de referencia.
  - No se hace: la spec aprobada es `type`, `x`, `series` y `title`.
  - Costo: "ventas por mes y por producto" en formato largo da etiquetas repetidas en vez de una serie por producto.
  - Se revisa si #12 muestra que esas preguntas son comunes.
- **Reintentar la llamada de insights cuando la spec es inválida**, con el motivo como feedback. No se hace porque suma latencia y costo, y el gráfico es un complemento: los datos ya están en la tabla. Se revisa si los warnings del log muestran que pasa seguido.
- **Tope de categorías o series, con agregación** (p. ej., "Otros", o el `MAX_CHART_SERIES` del proyecto de referencia). Para un POC alcanza con el tope de 500 filas de #6.
- **Nombres legibles para las series y formato de ejes** (moneda, %, fechas). Las leyendas usan el nombre de la columna, igual que la tabla.

## Pull request
Branch: `feat/9-graficos-en-respuestas` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- **Insights** (`backend/src/insights.ts`, `prompts/insights-system.liquid`):
  - el schema suma `chart`: `{ type, x, series, title }` o `null`, con `anyOf` en modo estricto y `type` limitado a `bar`, `line`, `pie` y `doughnut`;
  - el prompt dice cuándo devolver `null` (sin filas, un único valor, sin columnas numéricas, o 1 o 2 filas), qué tipo conviene a cada forma de datos, que `pie` y `doughnut` llevan una sola serie y que la narrativa no menciona el gráfico;
  - la regla de idioma ahora cubre también el título del gráfico, y se reforzó: en una prueba real, una pregunta en inglés salió en español.
- **`buildChart`** (`backend/src/chart.ts`) valida la spec contra el resultado real:
  - **Rechaza** una spec mal formada, un resultado sin filas, una serie vacía, `pie` o `doughnut` con más de una serie, `x` o una serie que no están o están repetidos en `columns`, una serie igual a `x` y valores que no son número ni `null`. Un texto que parece número también se rechaza.
  - **Si la spec sirve,** arma el bloque con `labels` (los valores de `x` como texto, en el orden de las filas) y un dataset por serie, con los números de las filas.
- **Pipeline** (`backend/src/pipeline.ts`):
  - el bloque `chart` va al final;
  - una spec que no encaja se descarta con `log.warn({ reason }, 'Chart dropped')`, sin las filas y sin reintentar;
  - el resultado trae la spec validada, o `null`, para #12. La respuesta HTTP no la incluye.
- **Frontend:**
  - `ChartBlock.vue` dibuja los cuatro tipos con vue-chartjs, con el título, la paleta del plugin `Colors` y `aria-label`;
  - `ResponseBlocks.vue` lo usa para los bloques `chart`;
  - `api.ts` suma el tipo `ChartBlock`.
- **Dependencias:** `chart.js` 4.5.1 y `vue-chartjs` 5.3.4 en `frontend`. El bundle pasa de 126 kB a 316 kB (109 kB gzip). El backend no suma nada.
- **Docs:**
  - `docs/ARCHITECTURE.md`: el paso 5 con las reglas de validación, el tipo `Block` con `chartType`, `title`, `labels` y `datasets`, *Chat endpoint*, *Frontend* y la nota de dependencias;
  - `README.md`: *Status* y estructura;
  - el diagrama: las etiquetas.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (24 archivos, 317 tests). El flake de arranque de los workers del frontend apareció en algunas corridas; al repetirlas pasaron.
- Coverage: 100% en sentencias, funciones y líneas, y 99,55% en ramas (umbral 85%). La única rama sin cubrir es de #8 (`conversations.ts:78`). Archivos nuevos o cambiados bajo el umbral: ninguno.
- Build: `npm run build -w frontend` — pass
- Manual: pass, con el `.env` real (`gpt-5.4-mini`) y el seed demo.
  - **Por el pipeline:**
    - "Total sales per month in 2025" dio un `line` de 12 puntos;
    - "¿Qué porcentaje de las ventas representa cada categoría?" dio un `pie` de 4 porciones, con el título en español;
    - "How many customers are there?" dio `chart: null`.
  - **En un navegador real** (Edge headless manejado por DevTools, con `npm run dev`):
    - el gráfico de líneas (640x320) y el doughnut (384x384, más angosto) se dibujaron en canvas, después de la tabla y con la paleta por defecto;
    - el valor único no trajo gráfico;
    - la captura de pantalla se revisó.
  - **Idioma:** después de reforzar la regla, 5 corridas reales (3 iguales en inglés, 1 en inglés y 1 en español) respondieron en el idioma de la pregunta, títulos incluidos.
- Self-review: 2 rondas con agente separado.
  - Ronda 1: un blocker, la descripción del `200` en `ARCHITECTURE.md`, que no mencionaba el bloque `chart`. Se arregló.
  - Ronda 2: sin blockers.
  - Sugerencias aplicadas:
    - test del plugin `Colors`;
    - test de la ruta con dos series y un `x` repetido;
    - warning sin `step`, verificado por HTTP con el log real de pino;
    - caso de resultado vacío por HTTP;
    - `aria-label`;
    - comentario y README reacomodados.

  Los últimos cambios son chicos, cada uno con su test, y se verificaron con el gate. (separate agent)
- Plan: aprobado de antemano por el usuario para el trabajo desatendido del 2026-10-19.
- Security: pass.
  - La spec del LLM se valida en forma y contra las columnas reales, y los números salen solo de las filas.
  - El título y las etiquetas se dibujan en canvas, así que no hay inyección de markup.
  - El warning loguea el motivo, nunca las filas, y un test lo chequea.
- Docs: updated `README.md`, `docs/ARCHITECTURE.md`, `docs/ARCHITECTURE_DIAGRAM.md`

### Out of scope / follow-ups
None
