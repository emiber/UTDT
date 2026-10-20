---
id: 8
title: "Agregar POST /api/chat: pipeline, insights y persistencia"
type: feat
status: closed
parent: 1
created: 2026-10-19
---

## Goal
Que el backend responda en `POST /api/chat` una pregunta en lenguaje natural con una narrativa breve y una tabla con los datos reales, dentro de una conversación que se guarda en `app.db` para poder seguir el hilo. Es el primer issue que une el pipeline de punta a punta: #7 genera y ejecuta el SQL con las guardas de #6, y acá se suman los insights, la respuesta en bloques y la persistencia. La UI del chat es #13. Gráficos (#9), clasificación (#10) y contexto multi-turn (#11) se agregan después.

## Scope
- In:
  - **`POST /api/chat`**: `{ conversationId?, question }` → `{ conversationId, turnId, blocks, suggestions }`. Queda protegido por el chequeo deny-by-default de #3. La ruta valida el body, busca la conversación, llama a la función del pipeline, persiste el turno y traduce el resultado a HTTP (ver *Expected behavior*).
  - **Función del pipeline**, separada de la ruta y de la persistencia. Recibe sus dependencias como parámetros: el cliente de OpenAI, la conexión read-only a `data.db` y el logger que le pasa a #7.
    - Genera y ejecuta el SQL con #7, que usa #6 y hace hasta 3 intentos en total.
    - Llama al paso de insights.
    - Arma los bloques.
    - Devuelve el SQL final, el resultado (columnas y filas), la narrativa, las sugerencias y los bloques.
    - Si #7 agota los 3 intentos, devuelve el motivo y el último SQL intentado, sin lanzar y sin llamar a los insights. Los fallos de OpenAI y los errores inesperados se lanzan. Es la misma separación que hace #6 entre errores devueltos y lanzados.
    - #12 la reutiliza en proceso, sin HTTP y sin escribir en `app.db`.
  - **Paso de insights** (paso 5 del pipeline en `docs/ARCHITECTURE.md`):
    - una llamada a la Responses API con Structured Outputs, a través de la función de #7 que hace el request y devuelve el objeto parseado;
    - sus prompts son plantillas LiquidJS, junto a las de #7;
    - recibe la pregunta, el SQL, la lista de columnas, una muestra de las primeras N filas y la cantidad total de filas;
    - devuelve solo `narrative` (markdown) y 3 `suggestions`, en el idioma de la pregunta. El schema no tiene ningún campo para datos.
  - **Bloque `table`**: lo arma el backend con las columnas y filas reales del resultado de #6, sin pasar por el LLM. Si el resultado no tiene filas, no hay bloque `table`.
  - **Persistencia en `app.db`**: una tabla de conversaciones y una de turnos, creadas al arrancar si no existen. Qué guarda cada turno está en *Data*.
  - **Cableado** en `buildApp` y `server.ts`:
    - la conexión read-only a `data.db` es la que #5 ya pasa a `buildApp`, y se reutiliza;
    - `server.ts` arma el cliente de OpenAI al arrancar, con la función de #7, antes de construir la app y de escuchar en el puerto. Sin `OPENAI_API_KEY` u `OPENAI_MODEL`, el backend no arranca;
    - el cliente entra a `buildApp` como una opción nueva, igual que `db`, para que los tests pasen un cliente falso.
  - **Logs**: una línea por paso del pipeline (SQL, insights, persistencia) con su duración.
  - Docs:
    - en `docs/ARCHITECTURE.md`:
      - quitar *(later issue)* de `POST /api/chat` y reflejar que los pasos 5 y 6 del pipeline ya existen (el gráfico del paso 5 sigue siendo de #9);
      - documentar la forma de los bloques `text` y `table`;
      - en *Configuration*, decir que `OPENAI_API_KEY` y `OPENAI_MODEL` son obligatorias: sin ellas el backend no arranca;
    - en `README.md`:
      - en *Status*, que el backend ya responde preguntas en `POST /api/chat` con narrativa y tabla;
      - en *Getting started*, que el `.env` también necesita `OPENAI_API_KEY` y `OPENAI_MODEL`, porque desde este issue `npm run dev` no arranca sin ellas. #7 las agrega a `.env.example`, pero no toca el README.
  - Tests unitarios del backend.
- NOT in:
  - La UI del chat: la vista, la función del frontend que llama a este endpoint, el renderer de bloques, las sugerencias como botones y los estados de espera y de error. Es #13.
  - El gráfico y el campo `chart` en los insights: son de #9.
  - Clasificar la pregunta: es de #10. Hasta entonces, toda pregunta va directo a la generación de SQL.
  - Mandar turnos anteriores como contexto al LLM: es de #11. Acá el `conversationId` solo agrupa los turnos.
  - Un endpoint para leer o listar conversaciones: no está en `docs/ARCHITECTURE.md`.
  - Convertir BLOBs para la tabla: #6 los devuelve sin convertir y el dataset demo no tiene.
  - Las descripciones de `meta_columns` en el prompt de insights: el diseño manda solo la lista de columnas.
  - Lo que `docs/ARCHITECTURE.md` difiere (ver *Deferred decisions*).

## Expected behavior
- Caso normal:
  1. Llega `POST /api/chat` con una key válida y un body válido.
  2. Sin `conversationId`, se crea una conversación nueva. Con uno existente, el turno se agrega a esa conversación.
  3. Se genera y ejecuta el SQL con #7, solo a partir de la pregunta.
  4. El paso de insights recibe la pregunta, el SQL, las columnas, hasta N filas de muestra y el total de filas.
  5. Se persiste el turno y se responde `200` con `blocks = [text, table]`, en ese orden, y las 3 sugerencias. `turnId` es el id del turno persistido.
- Edge cases:
  - Resultado con 0 filas: la narrativa dice que no hay resultados, en el idioma de la pregunta. La respuesta trae solo el bloque `text`, sin `table`, y las 3 sugerencias.
  - Resultado con más filas que la muestra: el LLM ve solo las primeras N filas y el total. La tabla trae todas: como #6 rechaza los resultados de más de 500 filas (y #7 reintenta), son 500 como máximo.
  - Columnas con el mismo nombre (`SELECT a.id, b.id …`) o con alias numéricos (`AS "2023"`): la tabla conserva todas, en el orden del `SELECT`.
  - Valores: números y textos tal como los devuelve SQLite. `NULL` viaja como `null`.
  - Pregunta sin relación con los datos: como todavía no hay clasificación (#10), sigue el mismo camino. Si #7 no logra un SQL válido en 3 intentos, es el caso de intentos agotados (ver *Errores*).
  - Narrativa con HTML (p. ej. `<img src=x onerror=…>`): el backend la devuelve tal como la escribió el LLM. Mostrarla sin interpretar el HTML es de #13.
- Errores:
  - Sin key válida: `401` (#3).
  - Body inválido: `400` con el formato de error estándar de Fastify. No se llama a OpenAI ni se persiste nada. Es inválido si:
    - falta `question`, no es un string, o está vacía o solo con espacios;
    - `conversationId` viene, pero no es un string o está vacío.
  - `conversationId` que no existe en `app.db`: `404` con el formato de error estándar de Fastify. Se chequea antes de correr el pipeline, así que no se llama a OpenAI, y no se persiste nada (ni conversación ni turno). Solo pasa si se borró `app.db` con la pestaña abierta, o si alguien manda un id a mano.
  - #7 agota los 3 intentos sin un SQL válido: `200` con el `conversationId`, el `turnId`, un único bloque `text` con un mensaje fijo en inglés (p. ej. *I couldn't answer that with the available data. Try rephrasing the question.*) y `suggestions: []`. Así el hilo sigue.
    - No se llama a los insights.
    - El mensaje va en inglés, como los demás textos hardcodeados, aunque la pregunta esté en otro idioma: traducirlo requeriría otra llamada al LLM.
    - El turno se persiste con el último SQL intentado y su error.
  - Falla una llamada a OpenAI, en el SQL o en los insights (red, key de OpenAI inválida, rate limit, `refusal` o respuesta incompleta), después de los reintentos automáticos del SDK: `502`.
  - Error inesperado (p. ej. lo que #6 lanza en vez de devolver, o una falla al leer el catálogo): `500`.
  - En los casos `502` y `500`:
    - la respuesta usa el formato de error estándar de Fastify, con un mensaje genérico. El detalle queda en el log y en el turno;
    - el turno se persiste con el error y, si lo hubo, el SQL (p. ej. el SQL final, cuando fallan los insights);
    - si la conversación era nueva, queda creada con ese turno, pero su id no vuelve, así que la próxima pregunta abre otra;
    - cómo se distingue un fallo de OpenAI de un error inesperado (p. ej. por la clase de error) se fija en el plan.
  - Falla la escritura en `app.db`: `500`, y el turno no queda guardado. Es la única falla del pipeline que no deja el turno persistido.
  - No existe `data/data.db` (no se corrió `npm run seed`): el backend no arranca (#5), así que este endpoint no suma un comportamiento propio.
  - Falta `OPENAI_API_KEY` u `OPENAI_MODEL`: el backend no arranca, y tampoco responde `/api/health`. `server.ts` arma el cliente al iniciar, y la función de #7 lanza un error que nombra la variable. Es la misma regla que `APP_ACCESS_KEY` (#3) y `data/data.db` (#5).

## Data
- Request y respuesta. La forma es indicativa: los nombres exactos se fijan en el plan, salvo `type`, que es el discriminador que usa #9.

  ```ts
  // Request
  { conversationId?: string; question: string }

  // Respuesta 200
  {
    conversationId: string; // opaco: el frontend solo lo guarda y lo devuelve
    turnId: number;         // el frontend todavía no lo usa
    blocks: Block[];        // [text, table]; [text] con 0 filas o con los intentos agotados
    suggestions: string[];  // 3; [] con los intentos agotados
  }

  type Block =
    | { type: 'text'; markdown: string }
    | { type: 'table'; columns: string[]; rows: (string | number | null)[][] };
  ```

  - Los errores (`400`, `404`, `502` y `500`) usan el formato estándar de Fastify: `{ statusCode, error, message }`.
- Resultado de la función del pipeline (indicativo):
  - éxito: el SQL final, `columns`, `rows`, la narrativa, las sugerencias y los bloques;
  - intentos agotados: el motivo (el `kind` y el `message` del último error de #6) y el último SQL intentado.
- Paso de insights:
  - Entrada: la pregunta, el SQL, los nombres de las columnas, las primeras N filas y el total de filas.
  - N es una constante fija en el código, como los demás valores de tuning (`docs/ARCHITECTURE.md`, *Configuration*). Su valor se elige en el plan.
  - Salida (Structured Outputs): `{ narrative: string, suggestions: string[] }`, con 3 sugerencias.
- Persistido en `app.db`. Las columnas exactas se fijan en el plan.
  - Conversación: id y fecha de creación.
  - Turno:
    - id, conversación y fecha;
    - pregunta;
    - SQL final; en un turno fallido, el último SQL intentado, si lo hubo;
    - la narrativa del paso de insights, si la hubo;
    - respuesta completa (bloques y sugerencias), como JSON, si hubo un `200`, incluido el de los intentos agotados;
    - error, si lo hubo: el motivo de los intentos agotados, o el error de un `502` o un `500`;
    - duración del request en ms.
  - Un `400` o un `404` no persisten nada.
  - La clasificación la agrega #10. #11 lee pregunta, SQL y narrativa de los últimos turnos.
- `data.db` se lee solo a través del ejecutor read-only de #6.

## Dependencies
- Depende de:
  - #7: la generación y ejecución del SQL, con 3 intentos en total; el módulo de OpenAI (la función que arma el cliente y valida `OPENAI_API_KEY` y `OPENAI_MODEL`, y la que hace el request con Structured Outputs); las plantillas LiquidJS; y el cliente falso para los tests.
  - #6, a través de #7: la ejecución read-only con guardas, el tope de 500 filas y el resultado como `columns` + `rows` (listas).
  - #3: el chequeo de key deny-by-default. Los tests construyen la app con una key y mandan el header.
  - #5: la conexión read-only a `data.db` en `buildApp`, que `server.ts` abre al arrancar (sin `data.db`, el backend no arranca).
  - #2: `data.db` con el seed demo, para la prueba manual.
- Bloquea a:
  - #13, la UI del chat, que consume este contrato;
  - #9, en su parte de backend: el campo `chart` en el schema de insights y el bloque `chart`. Su parte de frontend extiende el renderer de #13;
  - #10, que clasifica antes del SQL y guarda la clasificación en el turno;
  - #11, que lee los turnos persistidos;
  - #12, que reutiliza la función del pipeline.
- Servicio externo: la Responses API de OpenAI, solo en ejecución. Los tests usan un cliente falso.

## Acceptance criteria
- [ ] `POST /api/chat` sin key válida da `401`.
- [ ] Con un cliente OpenAI falso y un `data.db` de prueba, una pregunta sin `conversationId` da `200` con:
  - un `conversationId` nuevo y un `turnId`;
  - `blocks = [text, table]`, en ese orden;
  - 3 `suggestions`.

  La conversación y el turno quedan en `app.db`.
- [ ] Una segunda pregunta con ese `conversationId` devuelve el mismo id y otro `turnId`, y su turno queda en la misma conversación.
- [ ] La tabla trae exactamente las columnas y filas del resultado, en el orden del `SELECT` e incluidas las columnas repetidas, aunque la narrativa del cliente falso diga otros números.
- [ ] El request de insights que recibe el cliente falso:
  - usa la Responses API con Structured Outputs, con un JSON schema de `narrative` y `suggestions` y sin campos para datos;
  - incluye la pregunta, el SQL, las columnas, el total de filas y la instrucción de responder en el idioma de la pregunta.
- [ ] Con un resultado de más de N filas, el request de insights lleva N filas y la tabla las trae todas.
- [ ] Con un resultado de 0 filas, la respuesta es `200` con `blocks = [text]`, sin bloque `table`, y 3 `suggestions`.
- [ ] Cada body inválido de *Expected behavior* da `400`, sin llamar al cliente falso y sin persistir nada.
- [ ] Un `conversationId` que no existe da `404` con el formato de error estándar de Fastify, sin llamar al cliente falso y sin persistir nada.
- [ ] Si los 3 intentos de #7 fallan, la respuesta es `200` con el `conversationId`, un `turnId`, un único bloque `text` con el mensaje fijo y `suggestions: []`. No hay request de insights, y el turno queda guardado con el último SQL y su error.
- [ ] Si el cliente falso lanza o responde con un `refusal`, en el SQL o en los insights, la respuesta es `502`. Cuando fallan los insights, el turno guarda el SQL final y el error.
- [ ] Un error inesperado (p. ej. un `data.db` sin las tablas `meta_*`) da `500`, y el turno queda guardado con el error.
- [ ] Los `502` y `500` usan el formato de error estándar de Fastify con un mensaje genérico: no traen el detalle del error original, que sí queda en el log y en el turno.
- [ ] El turno persistido guarda pregunta, SQL, narrativa, respuesta, error (o nada) y duración.
- [ ] Al arrancar con un `app.db` sin tablas, se crean las de conversaciones y turnos. Si ya existen, sus datos se conservan.
- [ ] Cada paso del pipeline loguea una línea con su duración.
- [ ] La función del pipeline corre sin HTTP y sin `app.db`, con un cliente falso y un `data.db` de prueba:
  - con éxito, devuelve el SQL, el resultado, la narrativa, las sugerencias y los bloques;
  - con los intentos agotados, devuelve el motivo y el último SQL, sin lanzar;
  - si falla OpenAI, lanza.
- [ ] El backend no suma dependencias ni variables de entorno: `openai`, LiquidJS, `OPENAI_API_KEY` y `OPENAI_MODEL` vienen de #7.
- [ ] `docs/ARCHITECTURE.md` y `README.md` quedan actualizados como dice *Scope*.
- [ ] Los tests son offline: cliente OpenAI falso y SQLite en memoria o en archivos temporales.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85% (líneas, sentencias, funciones y ramas), y el código nuevo queda cubierto.
- [ ] Verificación manual, fuera del gate:
  - sin `OPENAI_MODEL` en el `.env`, `npm run dev` no levanta el backend y el error nombra la variable. Se prueba a mano porque `server.ts` queda fuera de la cobertura;
  - con una `OPENAI_API_KEY` real, el seed demo y la key de la app en el header, una pregunta en español y otra en inglés a `POST /api/chat` (p. ej. con `curl`) devuelven la narrativa en su idioma y una tabla con datos reales.

## Non-functional notes
- Seguridad:
  - `data.db` se lee solo por el ejecutor read-only de #6.
  - La narrativa sale de un LLM que recibe texto del usuario y datos. El backend la devuelve tal cual, y #13 la renderiza sin HTML crudo para evitar XSS.
  - Los `502` y `500` no exponen el detalle del error: queda en el log y en el turno.
  - La key de la app no se loguea (#3), y la de OpenAI tampoco (#7).
- Costo y latencia:
  - Cada pregunta hace entre 2 y 4 llamadas a OpenAI, en serie: de 1 a 3 intentos de SQL (#7) y, si alguno funciona, la de insights. Con los intentos agotados son 3, sin insights. A eso se suman los reintentos automáticos del SDK ante errores transitorios.
  - El paso de insights recibe solo una muestra de las filas, para ahorrar tokens.
  - No hay streaming: la respuesta llega completa.
- `node:sqlite` es sincrónico: mientras se ejecuta una consulta, el servidor no atiende otros requests. Está aceptado en `docs/ARCHITECTURE.md`.
- No hay un límite propio para el largo de la pregunta: aplica el `bodyLimit` por defecto de Fastify (1 MiB).

## Assumptions
Decisiones propuestas en el refinamiento y confirmadas por el usuario el 2026-10-19 (aceptó todas las recomendaciones):
- **División en backend y frontend** (pregunta 1, opción A). Este issue queda con el backend, y la UI del chat pasa entera a #13, que depende de este. Es el mismo corte que #3 y #4, y cada mitad se prueba sola.
  - Se descartaron separar también los insights en otro issue (quedarían sin quien los use hasta el endpoint) y dejar un solo issue.
- **`conversationId` desconocido** (pregunta 2, opción A): `404` con el formato de error estándar de Fastify, sin persistir nada.
  - Un id desconocido es un error del cliente. Crear otra conversación en silencio escondería bugs (p. ej. un frontend que manda el id equivocado) y, con #11, perdería el contexto sin aviso.
  - Se descartó crear una conversación nueva y devolver su id. Lo que hace la UI ante el `404` está en #13.
- **Fallos del pipeline** (pregunta 3, opción C). Los intentos agotados de #7 dan `200` con un bloque `text` fijo en inglés y `suggestions: []`. Un fallo de OpenAI da `502`, y un error inesperado, `500`. En todos los casos el turno se guarda con su error.
  - Los intentos agotados son un resultado esperable del pipeline (el bot "responde" que no pudo), mientras que un `200` escondería una falla real de OpenAI. Es la misma separación que hace #6 entre errores devueltos y lanzados, y la que usa #12 para marcar una pregunta "sin respuesta".
  - Se descartaron responder todo fallo con un `200` y responder todo fallo con un error HTTP.
- **0 filas** (pregunta 5, opción A): solo el bloque `text`, sin `table`. Una tabla vacía no agrega nada a "no hay resultados", y #9 tampoco arma gráfico sin filas. Se descartó una tabla con encabezados y sin filas.
- La pregunta 4 (qué hacen las sugerencias) pasó a #13 con el frontend.

Decisiones de otros issues, confirmadas el mismo día, que este issue aplica:
- **El backend no arranca sin `OPENAI_API_KEY` u `OPENAI_MODEL`** (#7, pregunta 3): `server.ts` arma el cliente al iniciar con la función de #7. Es la misma regla que `APP_ACCESS_KEY` (#3) y `data/data.db` (#5). Por eso, desde este issue, `npm run dev` necesita esas variables en el `.env`.
- **#7 hace 3 intentos en total y usa LiquidJS para las plantillas.** Los insights reutilizan su función de request a la Responses API y LiquidJS.
- **El tope de filas de #6 es 500.**

Derivadas de una fuente, sin pregunta:
- **División con #11.** Acá se persisten conversaciones y turnos y el `conversationId` va y vuelve. #11 manda los turnos como contexto al LLM.
  - Fuente: los comentarios del usuario en el epic. En #8: "tiene que recibir el id del chat para poder seguir el hilo". En #11: "#8, que es donde se recibe el id del chat y se persiste el hilo".
  - También `docs/ARCHITECTURE.md`, paso 6 y *Multi-turn*.
- **Qué recibe y qué devuelve el paso de insights.** Recibe pregunta, SQL, columnas y una muestra de filas. Devuelve solo narrativa y 3 sugerencias, y el backend arma la tabla.
  - Fuente: `docs/ARCHITECTURE.md`, paso 5, y el contexto original del issue ("El LLM devuelve solo la narrativa y las sugerencias").
  - El campo `chart` queda para #9.
- **El total de filas también va a los insights.** Fuente: un hecho técnico. Si el LLM ve solo una muestra, sin el total no puede hablar de cantidades. #9 lo necesita por lo mismo.
- **El orden de los bloques es `text` y después `table`.** Fuente: `docs/ARCHITECTURE.md` describe la respuesta como "a short narrative, a table, and a chart" y enumera los bloques como `text`, `table`, `chart`. #9 pone el gráfico al final.
- **Los turnos fallidos también se persisten, con el error y el último SQL intentado.** Fuente: `docs/ARCHITECTURE.md`, paso 6 (el turno guarda "error") y *Observability* ("The persisted turns in app.db are the query log"). La pregunta 3 lo confirmó.
- **El backend genera el `conversationId`.** Fuente: el contrato de `docs/ARCHITECTURE.md`, donde el `conversationId` es opcional en el request y siempre vuelve en la respuesta.
- **El pipeline es una función aparte de la ruta y de la persistencia, con sus dependencias como parámetros.** Fuente: `docs/ARCHITECTURE.md` ("Pipeline functions receive the client as a parameter") y #12, que corre el pipeline en proceso sin escribir en `app.db`.
- **El idioma.** La narrativa y las sugerencias van en el idioma de la pregunta. Fuente: `docs/ARCHITECTURE.md`, *Frontend* ("The bot answers in the language of the question"). El mensaje fijo de los intentos agotados va en inglés (pregunta 3).
- **N es una constante, no una variable de `.env`.** Fuente: `docs/ARCHITECTURE.md`, *Configuration* (los valores de tuning son fijos).

## Deferred decisions
Ya están diferidos en `docs/ARCHITECTURE.md`:
- Streaming de la respuesta.
- Prompts estándar con SQL prevalidado.
- Timeout de consultas o worker thread.

## Pull request
Branch: `feat/8-chat-narrativa-y-tabla` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- **`POST /api/chat`** (`backend/src/chat.ts`), detrás del hook de key de #3:
  - **Validación:** el body se valida sin coerción de tipos. `question` necesita al menos un carácter que no sea espacio, y `conversationId`, si viene, un string no vacío. Si no cumple, da `400`.
  - **Conversación:** un `conversationId` desconocido da `404`, sin llamar a OpenAI ni guardar nada.
  - **Respuesta:** `200` con `{ conversationId, turnId, blocks, suggestions }`. Los bloques son `[text, table]`, o solo `[text]` con 0 filas.
  - **Intentos agotados:** `200` con un bloque `text` fijo en inglés y `suggestions: []`.
  - **Errores:** `502` si falla OpenAI y `500` ante un error inesperado, los dos con mensaje genérico. El detalle queda en el log y en el turno. Si falla la lectura de la conversación o el guardado del turno, también da `500`, y no se guarda nada.
- **`answerQuestion`** (`backend/src/pipeline.ts`) corre la generación de SQL (#7), los insights y arma los bloques, sin HTTP ni `app.db`.
  - Con los intentos agotados devuelve el motivo.
  - Lo que lanza sale como `PipelineError`, con el error original como `cause` y el último SQL generado. Ese SQL lo recibe por un callback `onSql` nuevo en `generateSql`.
- **`buildInsights`** (`backend/src/insights.ts`):
  - es un request Structured Outputs con un schema de solo `narrative` y exactamente 3 `suggestions` (`minItems`/`maxItems`);
  - recibe la pregunta, el SQL, las columnas, las primeras 50 filas (`SAMPLE_ROWS`) y el total;
  - las plantillas son `prompts/insights-system.liquid` e `insights-user.liquid`.
- **`LlmError`** (`backend/src/llm.ts`): todo lo que falla en `requestStructured`, incluidos los errores del SDK, sale como `LlmError`. Es lo que separa el `502` del `500`.
- **`backend/src/conversations.ts`:**
  - las tablas `conversations` y `turns` se crean al construir la app si no existen, y conservan los datos;
  - `saveTurn` guarda en una transacción: pregunta, SQL, narrativa, respuesta en JSON, error y duración.
- **Cableado:**
  - `buildApp` recibe `llm`, y acepta opciones de logger para los tests;
  - `server.ts` arma el cliente al arrancar, así que sin `OPENAI_API_KEY` u `OPENAI_MODEL` el backend no arranca.
- **Logs:** una línea por paso (`sql`, `insights` y `persist`), con duración y resultado, también cuando el paso falla. No incluyen la pregunta, el SQL ni las keys.
- **Tests:**
  - `testing/dataset.ts` es un dataset en memoria para los tests;
  - `timing.ts` tiene un único `elapsed()`;
  - el proyecto backend de Vitest usa un timeout de 20 s, porque el primer request de Fastify en un archivo pasaba los 5 s con todo el gate en paralelo.
- **Docs:**
  - `docs/ARCHITECTURE.md`: la fila de la API, los pasos 5 y 6, la forma de los bloques, *Chat endpoint*, *LLM layer*, *Observability* y *Configuration*, con las 3 variables obligatorias;
  - `README.md`: *Status*, *Getting started* con las variables de OpenAI y la estructura;
  - `docs/ARCHITECTURE_DIAGRAM.md`: chat, insights y persistencia pasan a sólidos;
  - `.env.example`: las variables de OpenAI marcadas como obligatorias.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (20 archivos, 259 tests).
  - El primer test de `chat.test.ts` pasó dos veces los 5 s con el gate completo; corrido solo tarda 0,3 s. Se resolvió con el timeout de 20 s del backend.
  - El flake de arranque de los workers del frontend no apareció.
- Coverage: 100% en sentencias, funciones y líneas, y 99,36% en ramas (umbral 85%). La única rama sin cubrir es el `if (db.isTransaction)` falso en `conversations.ts:78`. Archivos nuevos o cambiados bajo el umbral: ninguno.
- Manual: pass, con el `.env` real y `OPENAI_MODEL=gpt-5.4-mini`.
  - **Sin `OPENAI_MODEL`:** con la variable vacía, el backend sale con código 1 y el error `OPENAI_MODEL is not set…`, y `/api/health` no responde.
  - **Español:** por el proxy de Vite, "¿Cuáles fueron las ventas totales por país en 2025?" dio `200` con la narrativa en español, una tabla `country,total_sales` de 5 filas y 3 sugerencias en español.
  - **Inglés:** "And which product category sold the most units?", en la misma conversación, dio `200` con la narrativa en inglés, una tabla de 1 fila y 3 sugerencias en inglés.
  - **Errores:** pregunta en blanco `400`, conversación inexistente `404`, sin key `401`.
  - **Persistencia y logs:** los dos turnos quedaron en `data/app.db` con su SQL. El log tiene los pasos `generate_sql`, `execute_sql`, `sql`, `insights` y `persist`, y ninguna key.
  - Después de los ajustes de la review, otra pregunta en español dio `200` con `text,table` y 3 sugerencias.
- Self-review: 3 rondas con agente separado, sin blockers. Sugerencias aplicadas:
  - el último SQL intentado queda en el turno aunque falle un reintento;
  - línea de log para los pasos que fallan;
  - `500` genérico si falla la lectura de la conversación;
  - test de punta a punta con más filas que la muestra;
  - tests que fijan el contrato de `LlmError` y la línea de `persist`;
  - doc de la coerción apagada en toda la app;
  - un solo `elapsed()`;
  - docs y diagrama al día.

  El último cambio, un refactor de `elapsed()`, el timeout y una frase del doc, se verificó con el gate y una corrida real. (separate agent)
- Plan: aprobado de antemano por el usuario para el trabajo desatendido del 2026-10-19.
- Security: pass.
  - La ruta queda detrás del hook deny-by-default, con test de `401`.
  - El body se valida en el borde, y el SQL de `app.db` usa parámetros.
  - `data.db` solo se lee por el ejecutor read-only de #6.
  - Los `502` y `500` son genéricos: un 401 de OpenAI, que trae un fragmento enmascarado de la key, no llega al cliente.
  - Los logs no tienen keys, y un test lo chequea.
- Docs: updated `README.md`, `docs/ARCHITECTURE.md`, `docs/ARCHITECTURE_DIAGRAM.md`, `.env.example`

### Out of scope / follow-ups
- Tu `.env` no tenía `OPENAI_MODEL` y, desde este issue, el backend no arranca sin esa variable. Agregué al final la línea `OPENAI_MODEL=gpt-5.4-mini`, sin leer ni tocar el resto del archivo. Cambiala si preferís otro modelo.
- Propuesto, sin crear: el timeout de 20 s del backend es un parche para el arranque en frío bajo carga. Es la misma familia que el flake de los workers del frontend (follow-up pendiente de #3).
