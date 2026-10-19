---
id: 8
title: "Agregar el chat: POST /api/chat y UI con narrativa y tabla"
type: feat
status: open
parent: 1
created: 2026-10-19
---

## Goal
Que el usuario haga una pregunta en lenguaje natural desde la UI y reciba una narrativa breve y una tabla con los datos reales, dentro de una conversación que se guarda en `app.db` para poder seguir el hilo. Es el primer issue que une el pipeline de punta a punta: #7 genera y ejecuta el SQL con las guardas de #6, y acá se suman los insights, la respuesta en bloques, la persistencia y la UI. Gráficos (#9), clasificación (#10) y contexto multi-turn (#11) se agregan después.

## Scope
La división entre backend y frontend está pendiente (pendiente: pregunta 1). El alcance se agrupa así para que, si se divide, cada mitad salga entera.

- In, backend:
  - **`POST /api/chat`**: `{ conversationId?, question }` → `{ conversationId, turnId, blocks, suggestions }`. Queda protegido por el chequeo deny-by-default de #3.
  - **Función del pipeline**, separada de la ruta y de la persistencia. Recibe sus dependencias como parámetros: el cliente de OpenAI y la conexión read-only a `data.db`.
    - Genera y ejecuta el SQL con #7, que usa #6 y sus reintentos.
    - Llama al paso de insights.
    - Arma los bloques.
    - Devuelve el SQL final, el resultado (columnas y filas), la narrativa, las sugerencias y los bloques.
    - Si #7 agota los reintentos, devuelve el motivo y el último SQL intentado. Los fallos de OpenAI y los errores inesperados se lanzan. Es la misma separación que hace #6 entre errores devueltos y lanzados. Cómo se traduce cada caso a HTTP está pendiente (pendiente: pregunta 3).
    - #12 la reutiliza en proceso, sin HTTP y sin escribir en `app.db`.
  - **Paso de insights** (paso 5 del pipeline en `docs/ARCHITECTURE.md`):
    - una llamada a la Responses API con Structured Outputs, dentro del módulo de OpenAI que crea #7;
    - su prompt usa el mismo mecanismo de templates que elija #7;
    - recibe la pregunta, el SQL, la lista de columnas, una muestra de las primeras N filas y la cantidad total de filas;
    - devuelve solo `narrative` (markdown) y 3 `suggestions`, en el idioma de la pregunta. El schema no tiene ningún campo para datos.
  - **Bloque `table`**: lo arma el backend con las columnas y filas reales del resultado de #6, sin pasar por el LLM.
  - **Persistencia en `app.db`**: una tabla de conversaciones y una de turnos, creadas al arrancar si no existen. Qué guarda cada turno está en *Data*.
  - **Cableado** en `buildApp` y `server.ts`:
    - la conexión read-only a `data.db` es la que #5 ya pasa a `buildApp`, y se reutiliza;
    - el cliente de OpenAI entra como una opción nueva, igual que `db`, para que los tests pasen un cliente falso.
  - **Logs**: una línea por paso del pipeline (SQL, insights, persistencia) con su duración.
- In, frontend:
  - **Vista de chat** en la pantalla principal, después de la access key (#4). Tiene el hilo de la conversación, un input para la pregunta y un botón para enviar. Convive con la vista del catálogo de #5 según lo que se decida en la pregunta 1 de #5, sin cambiarla.
  - **Una función para llamar a `POST /api/chat`** en `frontend/src/api.ts`, sobre la función de request autenticada de #4.
  - **Renderer de bloques**, que los muestra en orden: `text` como markdown, sin interpretar HTML crudo, y `table` como tabla HTML simple. #9 le suma el bloque `chart`.
  - **Sugerencias** debajo de cada respuesta (pendiente: pregunta 4).
  - **Estados** de espera y de error.
  - **Una dependencia nueva** para renderizar markdown, que `docs/ARCHITECTURE.md` ya prevé. Se justifica en el PR.
- In, docs:
  - en `docs/ARCHITECTURE.md`, quitar *(later issue)* de `POST /api/chat`, de los pasos 5 y 6 del pipeline y de la vista de chat del *Frontend*, y documentar la forma de los bloques `text` y `table`;
  - en `README.md`, actualizar *Status*: la app ya responde preguntas con narrativa y tabla.
- In, tests unitarios del backend y del frontend.
- NOT in:
  - El gráfico y el campo `chart` en los insights: son de #9.
  - Clasificar la pregunta: es de #10. Hasta entonces, toda pregunta va directo a la generación de SQL.
  - Mandar turnos anteriores como contexto al LLM: es de #11. Acá el `conversationId` solo agrupa los turnos.
  - Un botón de "nueva conversación". Lo trata la pregunta 2 de #11; mientras tanto, recargar la página empieza una conversación nueva.
  - Listar conversaciones o recuperar un hilo después de recargar: no hay un endpoint para leer conversaciones en `docs/ARCHITECTURE.md`.
  - Mostrar el SQL en la UI: no está en el contrato.
  - Formatear valores en la tabla (miles, monedas, fechas): se muestran como los devuelve SQLite.
  - Mostrar BLOBs: #6 los devuelve sin convertir y el dataset demo no tiene.
  - Las descripciones de `meta_columns` en el prompt de insights: el diseño manda solo la lista de columnas.
  - Lo que `docs/ARCHITECTURE.md` difiere (ver *Deferred decisions*).

## Expected behavior
- Caso normal, backend:
  1. Llega `POST /api/chat` con una key válida y un body válido.
  2. Sin `conversationId`, se crea una conversación nueva. Con uno existente, el turno se agrega a esa conversación.
  3. Se genera y ejecuta el SQL con #7, solo a partir de la pregunta.
  4. El paso de insights recibe la pregunta, el SQL, las columnas, hasta N filas de muestra y el total de filas.
  5. Se persiste el turno y se responde `200` con `blocks = [text, table]`, en ese orden, y las 3 sugerencias. `turnId` es el id del turno persistido.
- Caso normal, frontend:
  - Al enviar, la pregunta aparece en el hilo con un indicador de espera. El input y el botón quedan deshabilitados hasta que llega la respuesta.
  - Al llegar, se muestran los bloques en orden y las sugerencias. Las preguntas siguientes mandan el `conversationId` recibido.
  - El hilo y el `conversationId` viven en memoria: recargar la página empieza una conversación nueva.
- Edge cases:
  - Resultado con 0 filas: la narrativa dice que no hay resultados, en el idioma de la pregunta. Si además va un bloque `table` vacío lo define la pregunta 5 (pendiente: pregunta 5).
  - Resultado con más filas que la muestra: el LLM ve solo las primeras N filas y el total. La tabla trae todas, hasta el tope de filas de #6.
  - Columnas con el mismo nombre (`SELECT a.id, b.id …`) o con alias numéricos (`AS "2023"`): la tabla conserva todas, en el orden del `SELECT`.
  - Valores: números y textos tal como los devuelve SQLite. `NULL` viaja como `null`.
  - Pregunta sin relación con los datos: como todavía no hay clasificación (#10), sigue el mismo camino. Si #7 no logra un SQL válido, es el caso de reintentos agotados (pendiente: pregunta 3).
  - Narrativa con HTML (p. ej. `<img src=x onerror=…>`): se muestra como texto y no se interpreta.
  - Input vacío o solo con espacios: no se puede enviar.
- Errores:
  - Sin key válida: `401` (#3). El frontend no lo maneja: la función de request de #4 vuelve a pedir la key.
  - Body inválido: `400` con el formato de error estándar de Fastify. No se llama a OpenAI ni se persiste nada. Es inválido si:
    - falta `question`, no es un string, o está vacía o solo con espacios;
    - `conversationId` viene, pero no es un string o está vacío.
  - `conversationId` que no existe (pendiente: pregunta 2).
  - #7 agota los reintentos sin un SQL válido (pendiente: pregunta 3).
  - Falla una llamada a OpenAI, en el SQL o en los insights, o hay un error inesperado, como los que #6 lanza en vez de devolver (pendiente: pregunta 3).
  - No existe `data/data.db` (no se corrió `npm run seed`): se hereda lo que se decida en la pregunta 2 de #5. Con su opción A el backend no arranca. Con la B, `POST /api/chat` también responde `503`.
  - Falta `OPENAI_API_KEY` u `OPENAI_MODEL`: las agrega y valida #7, y #8 no suma un comportamiento propio. Si se detecta al arrancar o en el primer request lo define #7, en línea con lo que se decida para `APP_ACCESS_KEY` en la pregunta 1 de #3.
  - En el frontend, ante un error de red o cualquier status de error (salvo el `401`, que maneja #4, y el caso de la pregunta 2), se muestra un mensaje de error en el lugar de la respuesta y se vuelve a habilitar el input.

## Data
- Request y respuesta. La forma es indicativa: los nombres exactos se fijan en el plan, salvo `type`, que es el discriminador que usa #9.

  ```ts
  // Request
  { conversationId?: string; question: string }

  // Respuesta 200
  {
    conversationId: string; // opaco: el frontend solo lo guarda y lo devuelve
    turnId: number;         // el frontend todavía no lo usa
    blocks: Block[];
    suggestions: string[];  // 3
  }

  type Block =
    | { type: 'text'; markdown: string }
    | { type: 'table'; columns: string[]; rows: (string | number | null)[][] };
  ```

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
    - respuesta completa (bloques y sugerencias), como JSON;
    - error, si lo hubo;
    - duración del request en ms.
  - La clasificación la agrega #10. #11 lee pregunta, SQL y narrativa de los últimos turnos.
- `data.db` se lee solo a través del ejecutor read-only de #6.

## Dependencies
- Depende de:
  - #7: la generación y ejecución del SQL con reintentos, el módulo de OpenAI, `OPENAI_MODEL` y el mecanismo de templates.
  - #6, a través de #7: la ejecución read-only con guardas, el tope de filas y el resultado como `columns` + `rows` (listas).
  - #3: el chequeo de key deny-by-default. Los tests construyen la app con una key y mandan el header.
  - #4: la pantalla de key y la función de request autenticada, que maneja el `401`.
  - #2: `data.db` con el seed demo, para la prueba manual.
  - #5: la conexión read-only a `data.db` en `buildApp`, la vista del catálogo con la que convive el chat (su pregunta 1) y qué pasa sin `data.db` (su pregunta 2).
- Bloquea a:
  - #9, que agrega el bloque `chart` y el campo `chart` en los insights;
  - #10, que clasifica antes del SQL y guarda la clasificación en el turno;
  - #11, que lee los turnos persistidos;
  - #12, que reutiliza la función del pipeline.
- Servicio externo: la Responses API de OpenAI, solo en ejecución. Los tests usan un cliente falso.

## Acceptance criteria
Backend (pendiente: pregunta 1):
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
- [ ] Cada body inválido de *Expected behavior* da `400`, sin llamar al cliente falso y sin persistir nada.
- [ ] Un `conversationId` desconocido se maneja según la pregunta 2 (pendiente: pregunta 2).
- [ ] Los reintentos agotados en #7 y un fallo de OpenAI, en el SQL y en los insights, se manejan según la pregunta 3 (pendiente: pregunta 3). En todos esos casos el turno queda persistido con el error.
- [ ] Un resultado con 0 filas se maneja según la pregunta 5 (pendiente: pregunta 5).
- [ ] El turno persistido guarda pregunta, SQL, narrativa, respuesta, error (o nada) y duración.
- [ ] Al arrancar con un `app.db` sin tablas, se crean las de conversaciones y turnos. Si ya existen, sus datos se conservan.
- [ ] Cada paso del pipeline loguea una línea con su duración.

Frontend (pendiente: pregunta 1):
- [ ] Enviar una pregunta llama a `POST /api/chat` a través de la función de request de #4: la primera sin `conversationId` y las siguientes con el recibido.
- [ ] El hilo muestra cada pregunta y sus bloques en orden: el markdown renderizado (p. ej. `**x**` da un `<strong>`) y la tabla con encabezados y filas.
- [ ] Una narrativa con `<img src=x onerror=…>` se muestra escapada: no aparece ningún elemento `img`.
- [ ] Mientras espera la respuesta, se ve un indicador y el input y el botón están deshabilitados. Con el input vacío o solo con espacios no se puede enviar.
- [ ] Ante un error de red o un status de error (p. ej. `500`), se muestra un mensaje de error en el hilo y se puede volver a preguntar.
- [ ] Las sugerencias se comportan según la pregunta 4 (pendiente: pregunta 4).
- [ ] La respuesta del backend a un `conversationId` desconocido se maneja según la pregunta 2 (pendiente: pregunta 2).

General:
- [ ] La única dependencia nueva es la del markdown, en el frontend, justificada en el PR. El backend no suma dependencias ni variables de entorno.
- [ ] `docs/ARCHITECTURE.md` queda actualizado: el endpoint, los pasos 5 y 6 y la vista de chat sin *(later issue)*, y la forma de los bloques `text` y `table`. *Status* de `README.md` menciona el chat.
- [ ] Los tests son offline: cliente OpenAI falso y SQLite en memoria o en archivos temporales.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85% (líneas, sentencias, funciones y ramas), y el código nuevo queda cubierto.
- [ ] Verificación manual, fuera del gate y con una `OPENAI_API_KEY` real: con el seed demo, una pregunta en español y otra en inglés devuelven la narrativa en su idioma y una tabla con datos reales.

## Non-functional notes
- Seguridad:
  - `data.db` se lee solo por el ejecutor read-only de #6.
  - La narrativa sale de un LLM que recibe texto del usuario y datos, así que se renderiza sin HTML crudo para evitar XSS.
  - La key no se loguea (#3).
- Costo y latencia:
  - Cada pregunta hace al menos dos llamadas a OpenAI (SQL e insights), más los reintentos de #7.
  - El paso de insights recibe solo una muestra de las filas, para ahorrar tokens.
  - No hay streaming: el usuario espera la respuesta completa.
- `node:sqlite` es sincrónico: mientras se ejecuta una consulta, el servidor no atiende otros requests. Está aceptado en `docs/ARCHITECTURE.md`.
- No hay un límite propio para el largo de la pregunta: aplica el `bodyLimit` por defecto de Fastify (1 MiB).
- Textos de la UI en inglés y hardcodeados. Estilos en SCSS, con los tokens existentes.

## Assumptions
- **División con #11.** Acá se persisten conversaciones y turnos y el `conversationId` va y vuelve. #11 manda los turnos como contexto al LLM.
  - Fuente: los comentarios del usuario en el epic. En #8: "tiene que recibir el id del chat para poder seguir el hilo". En #11: "#8, que es donde se recibe el id del chat y se persiste el hilo".
  - También `docs/ARCHITECTURE.md`, paso 6 y *Multi-turn*.
- **Qué recibe y qué devuelve el paso de insights.** Recibe pregunta, SQL, columnas y una muestra de filas. Devuelve solo narrativa y 3 sugerencias, y el backend arma la tabla.
  - Fuente: `docs/ARCHITECTURE.md`, paso 5, y el contexto original del issue ("El LLM devuelve solo la narrativa y las sugerencias").
  - El campo `chart` queda para #9.
- **El total de filas también va a los insights.** Fuente: un hecho técnico. Si el LLM ve solo una muestra, sin el total no puede hablar de cantidades. #9 lo necesita por lo mismo.
- **El orden de los bloques es `text` y después `table`.** Fuente: `docs/ARCHITECTURE.md` describe la respuesta como "a short narrative, a table, and a chart" y enumera los bloques como `text`, `table`, `chart`. #9 pone el gráfico al final.
- **Los turnos fallidos también se persisten, con el error y el último SQL intentado.** Fuente: `docs/ARCHITECTURE.md`, paso 6 (el turno guarda "error") y *Observability* ("The persisted turns in app.db are the query log").
- **El backend genera el `conversationId`, y el frontend lo guarda solo en memoria.**
  - Fuente: el contrato de `docs/ARCHITECTURE.md`, donde el `conversationId` es opcional en el request y siempre vuelve en la respuesta.
  - Además, la tabla *Backend API* no tiene un endpoint para leer conversaciones, así que, después de recargar, el hilo no se podría mostrar.
  - Coincide con la opción a) de la pregunta 2 de #11.
- **Una pregunta a la vez, con un indicador de espera.** Fuente: `docs/ARCHITECTURE.md` difiere el streaming ("Fine to wait for the full answer in a POC").
- **El markdown se renderiza sin HTML crudo.** Fuente: un hecho técnico. La narrativa sale de un LLM que recibe texto del usuario y datos, y renderizarla como HTML abre un XSS.
- **El pipeline es una función aparte de la ruta y de la persistencia, con sus dependencias como parámetros.** Fuente: `docs/ARCHITECTURE.md` ("Pipeline functions receive the client as a parameter") y #12, que corre el pipeline en proceso sin escribir en `app.db`.
- **El idioma.** La narrativa y las sugerencias van en el idioma de la pregunta, y los textos de la UI en inglés. Fuente: `docs/ARCHITECTURE.md`, *Frontend*.
- **N es una constante, no una variable de `.env`.** Fuente: `docs/ARCHITECTURE.md`, *Configuration* (los valores de tuning son fijos).

## Deferred decisions
Ya están diferidos en `docs/ARCHITECTURE.md`:
- Streaming de la respuesta.
- Tablas con orden, paginado o exportación (UI kit) y descarga CSV.
- Botones de feedback y prompts estándar con SQL prevalidado.
- Timeout de consultas o worker thread.

## Open questions
1. **¿Se divide en backend y frontend, como la auth (#3 y #4)?** Las dos mitades no son triviales. El backend tiene el paso de insights, la orquestación, la persistencia y la ruta. El frontend tiene la vista, el renderer de bloques con markdown (y una dependencia nueva), la tabla y los estados.
   - A) Dos issues. #8 queda con el backend (`POST /api/chat`), y un issue nuevo toma la vista de chat; depende de #8 y de #4. #9 pasa a depender de los dos.
   - B) Tres issues: el paso de insights solo, como #6 y #7, que son un paso cada uno; después, el endpoint con la persistencia; y por último, la UI.
   - C) Queda como un solo issue.
   - Recomendación: **A**. Cada mitad se prueba sola, y es el mismo corte que #3 y #4. En B, el paso de insights quedaría sin quien lo use hasta el issue siguiente, y el endpoint es su único consumidor.
   - Con A o B, este archivo se recorta a la parte de backend (con su título, p. ej. *Agregar POST /api/chat con narrativa y tabla*), y lo demás pasa al issue nuevo tal como está escrito acá.
2. **¿Qué pasa si llega un `conversationId` que no existe?** Solo pasa si se borró `app.db` con la pestaña abierta, o si alguien manda un id a mano.
   - A) `404` con el formato de error estándar de Fastify, sin persistir nada. El frontend muestra un aviso y descarta el `conversationId`, así que la próxima pregunta empieza una conversación nueva. Para eso, el error de la función de request de #4 tiene que exponer el status HTTP; si no lo hace, #8 lo agrega.
   - B) Se crea una conversación nueva y se devuelve su id. El frontend no necesita nada especial.
   - Recomendación: **A**. Un id desconocido es un error del cliente, y crear otra conversación en silencio esconde bugs (p. ej. un frontend que manda el id equivocado). Con #11, además, se perdería el contexto sin aviso.
3. **¿Cómo responde `POST /api/chat` cuando el pipeline falla?** Hay dos tipos de fallo: (i) #7 agota los reintentos sin un SQL válido; (ii) falla una llamada a OpenAI (red, key de OpenAI inválida, rate limit, refusal) o hay un error inesperado. En todos los casos el turno se persiste con el error, salvo que falle `app.db`.
   - A) Todo fallo da `200` con un único bloque `text` con un mensaje fijo y `suggestions: []`. El frontend lo muestra como cualquier respuesta.
   - B) Todo fallo da un error HTTP (`502` si falló OpenAI, `500` si es inesperado), con el formato estándar de Fastify y un mensaje genérico. El detalle queda en el log y en el turno, y el frontend muestra un mensaje de error. Si la conversación era nueva, su id no vuelve, así que la próxima pregunta abre otra.
   - C) Mixto. (i) da `200` con un bloque `text` fijo (p. ej. *I couldn't answer that with the available data. Try rephrasing the question.*), `suggestions: []` y el `conversationId`, así que el hilo sigue. (ii) se maneja como en B.
   - El mensaje fijo de A y C va en inglés, como los demás textos hardcodeados, aunque la pregunta esté en otro idioma: traducirlo requeriría otra llamada al LLM.
   - Recomendación: **C**. (i) es un resultado esperable del pipeline (el bot "responde" que no pudo), mientras que (ii) es una falla real que un `200` escondería. Es la misma separación que hace #6 entre errores devueltos y lanzados, y que #12 usa para marcar una pregunta "sin respuesta".
4. **¿Qué hacen las sugerencias?**
   - A) Se muestran como botones debajo de cada respuesta. Un clic manda la sugerencia como pregunta nueva en la misma conversación, y los botones se deshabilitan mientras hay una pregunta en curso.
   - B) Un clic copia la sugerencia en el input, para editarla antes de enviarla. Es lo que hace el proyecto de referencia.
   - C) Se muestran como texto, sin acción.
   - Recomendación: **A**. Las sugerencias ya son preguntas completas, y un solo clic es lo que las hace útiles. B suma un paso, y C las deja como adorno.
5. **¿Qué se muestra cuando la consulta devuelve 0 filas?** La narrativa dice que no hay resultados en los dos casos.
   - A) Solo el bloque `text`, sin `table`. #9 tampoco arma gráfico sin filas.
   - B) El bloque `table` con los encabezados y sin filas; la UI muestra *No rows* debajo.
   - Recomendación: **A**. Una tabla vacía no agrega nada a "no hay resultados", y queda alineado con #9.
