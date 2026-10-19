---
id: 9
title: Mostrar gráficos en las respuestas del chat
type: feat
status: open
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
    - cuándo devolver `chart: null` (pendiente: pregunta 1);
    - que `title` va en el idioma de la pregunta;
    - que la narrativa no menciona el gráfico, porque puede omitirse (pendiente: pregunta 2).
  - **Cantidad total de filas en el input de insights:** ya la manda #8, así que este issue solo la menciona en las instrucciones del prompt. El LLM ve solo una muestra de las filas y necesita el total para elegir el tipo (p. ej., para no proponer un `pie` de 80 porciones).
  - **Validación y armado en el backend:** una función que recibe la spec y el resultado de la consulta de #6 (`columns` + `rows`) y devuelve el bloque `chart` o, si la spec no sirve, ningún bloque y el motivo. Las reglas están en *Expected behavior*.
  - **El bloque en la respuesta:** `POST /api/chat` agrega el bloque `chart` al final de `blocks`, después de la tabla. Se extiende el tipo de los bloques, y su schema de respuesta si #8 define uno.
  - **La spec para #12:** el resultado del pipeline en proceso deja disponible la spec validada (o `null` si no hay gráfico), además del bloque, para que #12 la juzgue sin rearmarla. No viaja en la respuesta de `POST /api/chat`.
  - **Frontend:**
    - un componente que dibuja el bloque `chart` con vue-chartjs, para los cuatro tipos, con su título y la paleta por defecto de Chart.js (plugin `Colors`);
    - el renderer de bloques de #8 lo usa para los bloques `chart`;
    - se extiende el tipo de bloques del frontend.
  - Dependencias `chart.js` y `vue-chartjs` en `frontend/package.json`.
  - Docs: la descripción de la respuesta en `docs/ARCHITECTURE.md` lista los campos del bloque `chart`.
  - Tests unitarios del backend y del frontend.
- NOT in:
  - Transformar los datos para graficar: pivotar de formato largo a ancho, agregar, ordenar o recortar filas (ver *Deferred decisions*).
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
  - `chart: null`: la respuesta no trae bloque `chart` y el resto queda igual. Cuándo lo devuelve el LLM depende de la pregunta 1 (pendiente: pregunta 1).
  - Resultado sin filas: no hay bloque `chart`, aunque venga una spec.
  - Una sola fila: el gráfico es válido, con un punto o una barra.
  - Un `null` en una serie queda como `null` en los datos, y Chart.js deja el hueco.
  - Valores de `x` repetidos: quedan como puntos separados. El backend respeta el orden de las filas del SQL: no agrupa, no ordena y no recorta.
  - `pie` o `doughnut` con una serie: una porción por fila.
- Errores. La spec es inválida para el resultado, y el backend no arma el bloque, si:
  - `x` o alguna serie no nombran exactamente una columna del resultado: el nombre no está en `columns`, o está más de una vez (#6 conserva las columnas repetidas, p. ej. `SELECT a.id, b.id`);
  - `series` está vacía, o alguna serie es la misma columna que `x`;
  - algún valor de una serie no es un número ni `null` (p. ej., un texto, aunque parezca un número);
  - `type` es `pie` o `doughnut` y `series` no tiene exactamente una columna.

  En esos casos la respuesta sale igual: `200` con narrativa, tabla y sugerencias, sin bloque `chart`, y un warning en el log con el motivo (pendiente: pregunta 2).
- El frontend no revalida el bloque: lo dibuja tal como llega.

## Data
- Entrada de la llamada de insights, que arma #8: pregunta, SQL, columnas, muestra de filas y cantidad total de filas (ver *Scope*). Como #6 rechaza los resultados de más de N filas en vez de truncarlos, el total es el largo de `rows`.
- Entrada del armado: el resultado de #6, `{ columns: string[], rows: unknown[][] }`, con cada fila alineada con `columns`. Los valores son `number`, `string`, `null` o `Uint8Array` (BLOB).
- Salida del LLM: lo que ya devuelve en #8 (narrativa y sugerencias) más `chart`, que es `{ type, x, series, title }` o `null`.
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
- Persistencia: nada nuevo. El bloque viaja dentro de la respuesta que #8 guarda en el turno.

## Dependencies
- Depende de #8: la llamada de insights, la lista de `blocks`, la persistencia del turno y el renderer de bloques de la UI. A través de #8 usa el resultado de la consulta de #6 (`columns` + `rows`) y el módulo de OpenAI de #7, con su cliente falso para los tests.
- Bloquea a #12, que juzga la spec del gráfico ("el gráfico es adecuado") y marca "no aplica" cuando no hay gráfico.
- No se cruza con #11: el historial no incluye bloques `chart`, pero la spec se pide en la llamada de insights, que ya recibe ese historial.
- Servicios externos: la Responses API, dentro de la llamada de insights que ya existe. Sin variables de entorno nuevas.

## Acceptance criteria
- [ ] El request de insights que recibe el cliente falso incluye:
  - en su JSON schema, el campo `chart` nullable, con `type` limitado a `bar`, `line`, `pie` y `doughnut`, más `x`, `series` y `title`;
  - en su input, la cantidad total de filas.
- [ ] Con una spec válida (una columna `x` y dos series numéricas), `POST /api/chat` responde con un bloque `chart` después de la tabla:
  - `chartType` y `title` vienen de la spec;
  - `labels` son los valores de `x` como texto, en el orden de las filas y sin agrupar, aunque se repitan;
  - hay un dataset por serie, con el nombre de la columna y los valores de las filas reales, no números escritos por el LLM.
- [ ] Una spec `pie` y otra `doughnut` con una sola serie dan un bloque válido. Un resultado de una sola fila también.
- [ ] Con `chart: null`, o con un resultado sin filas, la respuesta no trae bloque `chart` y el resto de los bloques no cambia.
- [ ] Un `null` en una serie aparece como `null` en `data`.
- [ ] Cada caso inválido de *Expected behavior* da `200` con narrativa, tabla y sugerencias y sin bloque `chart` (pendiente: pregunta 2). Los casos son: `x` inexistente, `x` con un nombre repetido en `columns`, `series` vacía, una serie inexistente, una serie igual a `x`, un texto en una serie, y `pie` o `doughnut` con dos series. La función de armado devuelve el motivo y el endpoint lo loguea como warning.
- [ ] El resultado del pipeline en proceso trae la spec validada cuando hay bloque `chart`, y `null` cuando no lo hay. La respuesta HTTP no la incluye.
- [ ] El componente del gráfico le pasa a vue-chartjs el tipo, `labels` y `datasets` del bloque, y muestra el título, para los cuatro tipos. Los tests mockean vue-chartjs, porque jsdom no implementa canvas.
- [ ] El chat dibuja un bloque `chart` en su lugar dentro de la lista de bloques.
- [ ] `chart.js` y `vue-chartjs` quedan en las `dependencies` de `frontend/package.json`. El backend no suma dependencias ni variables de entorno.
- [ ] `docs/ARCHITECTURE.md` lista los campos del bloque `chart` (`chartType`, `title`, `labels`, `datasets`).
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85% (líneas, sentencias, funciones y ramas), y el código nuevo queda cubierto.

## Non-functional notes
- Fidelidad: los números del gráfico salen siempre de las filas del resultado. El LLM solo nombra columnas, y esos nombres se aceptan solo si están entre las columnas del resultado.
- Volumen: el gráfico usa todas las filas del resultado, que ya vienen acotadas por el tope de filas de #6. No tiene un tope propio. Los valores viajan dos veces (tabla y gráfico), y con ese tope el tamaño de la respuesta no preocupa.
- Costo y latencia: la spec viene en la misma llamada de insights, sin llamadas extra.
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

## Deferred decisions
- **Pivotar de formato largo a ancho**, con una columna "grupo" en la spec, como la transformación long-to-wide del proyecto de referencia.
  - No se hace: la spec aprobada es `type`, `x`, `series` y `title`.
  - Costo: "ventas por mes y por producto" en formato largo da etiquetas repetidas en vez de una serie por producto.
  - Se revisa si #12 muestra que esas preguntas son comunes.
- **Tope de categorías o series, con agregación** (p. ej., "Otros", o el `MAX_CHART_SERIES` del proyecto de referencia). Para un POC alcanza con el tope de filas de #6.
- **Nombres legibles para las series y formato de ejes** (moneda, %, fechas). Las leyendas usan el nombre de la columna, igual que la tabla.

## Open questions
1. **¿Cuándo propone un gráfico el LLM?** Si el resultado no se puede graficar (un único valor, sin columnas numéricas), devuelve `chart: null` en cualquier caso. La duda es qué hace cuando sí se puede.
   - A) Solo cuando aporta: si el gráfico no suma nada a la tabla (p. ej., 1 o 2 filas), devuelve `null`. Es lo que hace el proyecto de referencia.
   - B) Siempre que se pueda: `null` solo si el resultado no se puede graficar.
   - Recomendación: **A**. Evita gráficos de relleno, como una sola barra para "total de ventas de 2024", y el criterio "el gráfico es adecuado" de #12 mide si el LLM acierta.
2. **¿Qué pasa si la spec del LLM no es válida para el resultado?**
   - A) Se omite el bloque `chart`: la respuesta sale igual con narrativa, tabla y sugerencias, y se loguea un warning con el motivo.
   - B) Se reintenta una vez la llamada de insights con el error como feedback; si vuelve a fallar, se hace lo mismo que en A.
   - C) Falla toda la respuesta con un error.
   - Recomendación: **A**. Es lo más simple y no suma latencia ni costo. Además, el gráfico es un complemento: los datos ya están en la tabla. B se puede agregar más adelante si #12 muestra que pasa seguido.
