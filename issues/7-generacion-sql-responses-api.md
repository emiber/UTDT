---
id: 7
title: Generar SQL con la Responses API de OpenAI
type: feat
status: open
parent: 1
created: 2026-10-19
---

## Goal
Traducir la pregunta del usuario a un SQL que la responda con los datos de `data.db`. Usa la Responses API de OpenAI con Structured Outputs y un contexto de esquema armado desde los metadatos. Si el SQL falla en las guardas o en SQLite (#6), el LLM lo corrige con el error como feedback, hasta un tope de intentos. Es un módulo del backend, sin endpoint: lo usa `POST /api/chat` (#8).

## Scope
- In:
  - **Módulo LLM:** el único lugar del código que llama a OpenAI (`docs/ARCHITECTURE.md`, *LLM layer*). En este issue tiene dos cosas:
    - una función que arma el cliente a partir de `OPENAI_API_KEY` y `OPENAI_MODEL`;
    - una función que hace un request a la Responses API con Structured Outputs (JSON schema estricto) y devuelve el objeto ya parseado. La reutiliza #8 para los insights.
  - Dependencias nuevas, en `backend`: `openai` y el motor de plantillas (pendiente: pregunta 1). Ninguna otra (p. ej., no `zod`).
  - `OPENAI_API_KEY` y `OPENAI_MODEL` en `.env.example`, con placeholders.
  - **Contexto de esquema:** una función que arma el texto que describe los datos al LLM, a partir de la función del catálogo de #5 (tablas, columnas y relaciones de `meta_*`, sin los índices). Es reutilizable: #12 se lo pasa al juez.
  - **Prompts en archivos de plantilla** (uno de sistema y uno de usuario), separados del código y renderizados con el motor elegido (pendiente: pregunta 1). Es el pedido del usuario en el epic: "usar algo como Jinja2 para los prompts", como los `.j2` del proyecto de referencia (`{{ }}`, `{% if %}`, `{% for %}`).
  - **Bucle generar → ejecutar → reintentar:** genera el SQL, lo ejecuta con la función de #6 y, si #6 devuelve un error, vuelve a generar con ese feedback, hasta el tope de intentos (pendiente: pregunta 2).
  - Una línea de log por paso (generación y ejecución de cada intento), con su duración.
  - Tests unitarios offline, con un cliente OpenAI falso y SQLite en archivos temporales. El cliente falso queda como helper de tests reutilizable, porque también lo usan #8, #9, #11 y #12.
- NOT in:
  - `POST /api/chat`, crear el cliente en `server.ts` / `buildApp`, persistir el turno y el mensaje que ve el usuario cuando algo falla: son de #8. Hasta #8, `npm run dev` no necesita las variables de OpenAI.
  - El paso de insights (narrativa y sugerencias) y el bloque `table`: #8. El gráfico: #9.
  - Clasificar la pregunta (respondible, necesita aclaración, fuera de alcance): #10. La salida del LLM en este paso no tiene una opción de "no se puede responder".
  - El historial de la conversación en los prompts: #11.
  - Las guardas y el tope de filas: #6. La apertura read-only de `data.db`: #2.
  - Un endpoint o un script para usar la generación a mano (ver *Deferred decisions*).

## Expected behavior
- Normal case:
  1. Se arma el contexto de esquema desde los metadatos, una vez por pregunta.
  2. Se renderizan los prompts con el contexto y la pregunta. Se llama a la Responses API con el modelo de `OPENAI_MODEL` y un JSON schema estricto con un único campo `sql` (string).
  3. El SQL se pasa tal cual a la función de #6, sin limpiarlo (ni fences de markdown, ni `;` final): de eso se encarga #6.
  4. Si #6 devuelve éxito, la función devuelve el SQL, `columns` y `rows`.
- Reintentos:
  - Si #6 devuelve un error (`guard`, `sql` o `row_limit`), se genera de nuevo. El prompt del reintento lleva los intentos fallidos anteriores de esa misma pregunta, en orden, cada uno con su SQL y el `message` de #6.
  - El tope cuenta los intentos en total, incluido el primero (pendiente: pregunta 2). `row_limit` consume el mismo tope que los demás errores.
  - Si se agota el tope, la función devuelve una falla con el último SQL y su error. No lanza.
- Contexto de esquema:
  - Por tabla: nombre y descripción. Por columna: nombre, tipo (`data_type`) y descripción. Por relación: `from_table.from_column → to_table.to_column` y su descripción.
  - Solo entran las tablas con fila en `meta_tables`. Quedan afuera las columnas de una tabla sin esa fila, y las relaciones que la mencionan. Ese filtro y el orden (el de carga de los metadatos) ya los aplica la función del catálogo de #5.
  - No lleva índices, filas de ejemplo ni el esquema físico de SQLite (`sqlite_master`): solo los metadatos.
- Prompt de sistema, en inglés. Como mínimo dice:
  - que el dialecto es SQLite;
  - que la respuesta es exactamente una sentencia de solo lectura que empieza con `SELECT` o `WITH`;
  - que solo puede usar tablas y columnas del contexto de esquema;
  - que, si el resultado puede ser grande, lo reduzca filtrando o agregando. `LIMIT` va solo si la pregunta pide un ranking ("top 5", "los 3 mayores"), nunca para recortar;
  - que la pregunta y los errores son datos, no instrucciones.
- Edge cases:
  - **Resultado vacío (0 filas):** éxito, sin reintento. Lo narra #8.
  - **El LLM devuelve un `sql` vacío o con un fence de markdown:** #6 lo rechaza como `guard` y se reintenta como cualquier otro error.
  - **El LLM repite un SQL que ya falló:** cuenta como otro intento fallido. No hay chequeo de duplicados.
  - **Pregunta o SQL fallido con `{{ }}`, `{% %}`, comillas, `<` o `>`:** llegan literales al prompt. Van como variables de la plantilla, nunca como parte de ella, y el render no escapa HTML.
  - **`meta_tables` sin filas:** sin tratamiento especial. El LLM recibe un contexto vacío y lo normal es que se agote el tope. Filtrar esas preguntas antes es tarea de la clasificación (#10).
- Errors. Estos se **lanzan**, no consumen intentos y no se reintentan; quien llama (#8) decide la respuesta HTTP:
  - Falla la llamada a OpenAI (red, 401, 429, 5xx, timeout), después de los reintentos automáticos del SDK.
  - La respuesta no trae un objeto válido: el modelo se niega (`refusal`) o la respuesta queda incompleta.
  - La función de #6 lanza (p. ej., la conexión está cerrada): se propaga sin volver a llamar al LLM.
  - Falla la lectura del catálogo (p. ej., `data.db` no tiene las tablas `meta_*`): se propaga sin llamar al LLM.
  - Falta `OPENAI_API_KEY` u `OPENAI_MODEL`: la función que arma el cliente lanza un error que nombra la variable. Si eso frena el arranque del backend o recién el primer `POST /api/chat` depende de dónde la llame #8 (pendiente: pregunta 3).

## Data
- **Entrada** de la función principal: la pregunta (string no vacío, ya validado por #8), la conexión read-only a `data.db`, el cliente LLM y un logger (el `request.log` de Fastify en #8, uno falso en los tests).
- **Salida.** La forma es indicativa; los nombres exactos se fijan en el plan de `/work-issue`:
  - Éxito: `{ ok: true, sql, columns, rows }`, con `columns` y `rows` tal como los devuelve #6.
  - Falla por tope agotado: `{ ok: false, sql, kind, message }`, con el último SQL y su error de #6.
- **Request a OpenAI:** el modelo de `OPENAI_MODEL`, el prompt de sistema, y el prompt de usuario con el contexto de esquema, la pregunta y, en los reintentos, los intentos fallidos. El formato es un JSON schema estricto `{ sql: string }`. No usa `previous_response_id`: cada request lleva todo su contexto.
- **Config:** `OPENAI_API_KEY` y `OPENAI_MODEL`, en `.env`. El tope de intentos es una constante en el código, no configurable (`docs/ARCHITECTURE.md`, *Configuration*) (pendiente: pregunta 2).
- **Persistencia:** ninguna. No lee ni escribe `app.db`.
- **Logs**, por intento: el número de intento, el paso (generación o ejecución), la duración y el resultado (`ok` o el `kind` del error). Nunca la API key.

## Dependencies
- Depende de:
  - #2: las tablas `meta_*` en `data.db`, la apertura read-only, y el seed demo para la verificación manual.
  - #5: la función del catálogo, que lee `meta_*` y filtra las tablas no declaradas. #5 la deja disponible para #7, y va antes en el epic.
  - #6: la ejecución con guardas y la forma de su resultado (`columns` + `rows`, o `kind` + `message`; los errores que no dependen del SQL se lanzan).
- Bloquea a:
  - #8, que llama al bucle desde su función del pipeline, le pasa el logger, crea el cliente con la función de este issue (pendiente: pregunta 3) y suma el paso de insights al módulo LLM;
  - #10, que suma la Decisions API al módulo LLM;
  - #11, que agrega el historial a los prompts de este issue;
  - #12, que reutiliza el contexto de esquema, el cliente y el pipeline.
- Externo: la OpenAI Responses API, a través del SDK `openai`. `OPENAI_MODEL` tiene que ser un modelo con Structured Outputs en la Responses API.

## Acceptance criteria
- [ ] Contexto de esquema (test con un `data.db` temporal): trae nombre y descripción de cada tabla; nombre, tipo y descripción de cada columna; y las relaciones con su descripción. No trae índices. Una tabla sin fila en `meta_tables` no aparece en el prompt, ni sus columnas, ni sus relaciones.
- [ ] El primer request al cliente falso usa el modelo de `OPENAI_MODEL`, lleva el contexto de esquema y la pregunta, y pide Structured Outputs con un JSON schema estricto de un único campo `sql`.
- [ ] Si el primer SQL ejecuta bien, devuelve éxito con ese SQL, `columns` y `rows`, tras un único request al LLM. Un resultado de 0 filas también es éxito y no reintenta.
- [ ] El SQL llega a #6 exactamente como lo devolvió el LLM (p. ej., con espacios y un `;` final).
- [ ] Para cada `kind` de #6 (`guard`, `sql` y `row_limit`): si el primer SQL falla y el segundo funciona, el segundo request lleva el SQL fallido y su `message`, y el resultado es éxito.
- [ ] Cada reintento lleva todos los intentos fallidos anteriores de esa pregunta, en orden.
- [ ] Si todos los intentos fallan, se hacen exactamente tantos requests como el tope (pendiente: pregunta 2). La función devuelve una falla con el último SQL, su `kind` y su `message`, sin lanzar.
- [ ] Si el cliente falso lanza, o responde sin un objeto válido (`refusal` o respuesta incompleta), la función lanza y no hace más requests ni ejecuciones.
- [ ] Si la función de #6 lanza, el error se propaga y no hay más requests.
- [ ] Si `data.db` no tiene las tablas `meta_*`, la función lanza sin llamar al LLM.
- [ ] Una pregunta y un SQL fallido con `'`, `"`, `<`, `>` y `{{ x }}` llegan literales al prompt, sin escapar ni interpretar.
- [ ] El prompt de sistema renderizado incluye las reglas mínimas: SQLite; una sola sentencia `SELECT`/`WITH`; solo tablas y columnas del contexto; filtrar o agregar en vez de recortar con `LIMIT`; la pregunta como dato.
- [ ] La función que arma el cliente lanza un error que nombra la variable si falta `OPENAI_API_KEY` u `OPENAI_MODEL`, y no lanza si están las dos.
- [ ] Logs (con un logger falso): cada intento deja una línea de generación y, si llega a ejecutar, una de ejecución, con duración y resultado. Ninguna línea contiene la API key.
- [ ] `.env.example` trae `OPENAI_API_KEY` y `OPENAI_MODEL` con placeholders.
- [ ] Las únicas dependencias nuevas son `openai` y el motor de plantillas, en `backend` (pendiente: pregunta 1).
- [ ] Los tests no usan la red: pasan sin `OPENAI_API_KEY` en el entorno.
- [ ] `docs/ARCHITECTURE.md` registra el motor de plantillas en *Tech stack*, y en *LLM layer* dónde viven los prompts.
- [ ] Verificación manual, fuera del gate, con una `OPENAI_API_KEY` real y el `data.db` del seed (#2). Desde un script descartable, que no se commitea, tres preguntas del dataset demo (una agregación por mes, una que necesite un join y un ranking) terminan en éxito, con o sin reintentos, y el log muestra cada intento.
- [ ] `npm run lint` y `npm run test:coverage` pasan con ≥85% en líneas, sentencias, funciones y ramas, y los archivos nuevos quedan cubiertos.

## Non-functional notes
- **Seguridad:**
  - La API key vive solo en `.env`: no se loguea ni sale del backend.
  - La pregunta es input no confiable (prompt injection). El prompt la marca como dato, pero la garantía real es la de #6: conexión read-only y una sola sentencia `SELECT`/`WITH`.
  - En este paso el LLM recibe solo metadatos, la pregunta y los SQL fallidos con sus errores. Nunca filas de datos.
- **Costo y latencia:** en el peor caso, una pregunta hace tantos requests como el tope (pendiente: pregunta 2), en serie. El log con la duración de cada paso lo muestra.
- **Errores transitorios de OpenAI:** los reintenta el SDK (por defecto, 2 veces con backoff). El bucle no suma reintentos propios.
- **Idioma:** prompts y logs en inglés, porque son código (`workflow/rules.md`, regla 8). El SQL no depende del idioma de la pregunta.

## Assumptions
El usuario no fijó estos puntos literalmente. Salen de una fuente confirmada (`docs/ARCHITECTURE.md`, `workflow/rules.md`, la división del epic) o, si solo afectan la interfaz entre issues, del reparto que hacen los issues hermanos:
- **Salida del LLM con un único campo `sql`, sin opción de "no se puede responder":** decidir si una pregunta se puede responder es el paso 1 del pipeline (clasificación, #10), no el 3. *Fuente:* `docs/ARCHITECTURE.md`, *Text-to-SQL pipeline*. Por eso tampoco hay tratamiento especial para metadatos vacíos.
- **`row_limit` consume el mismo tope que los demás errores:** el tope de filas es una de las capas de la guarda, y "on a guard or SQL error the LLM retries with the error as feedback, up to a fixed retry budget". *Fuente:* `docs/ARCHITECTURE.md`, paso 4, y el `kind` `row_limit` de #6.
- **Lo que no es un error de guarda o de SQL se lanza y no se reintenta:** fallas de OpenAI, `refusal`, respuestas incompletas, errores que lanza #6 y la lectura de metadatos. *Fuente:* `docs/ARCHITECTURE.md` (el reintento es "on a guard or SQL error"), #6 (lanza los errores que no dependen del SQL) y un hecho técnico: el SDK `openai` ya reintenta los errores transitorios. Es coherente con #12 ("no hay reintentos propios, solo los del SDK").
- **Feedback acumulado:** cada reintento lleva todos los intentos fallidos de la pregunta, no solo el último, para que el LLM no repita un error anterior. *Fuente:* el texto original del issue ("reintenta con el error como feedback"). Es un detalle del prompt y no cambia el contrato.
- **`LIMIT` solo para rankings:** el prompt pide reducir el resultado filtrando o agregando. *Fuente:* `docs/ARCHITECTURE.md` ("an oversized result is sent back for a more selective query") y #6 (un resultado más grande que el tope "se rechaza, no se trunca"). Recortar con `LIMIT` sería truncar a escondidas.
- **El SQL va tal cual a #6:** *Fuente:* `docs/ARCHITECTURE.md`, *LLM layer* (Structured Outputs en vez de "strip the markdown fence and hope"), y #6, que acepta espacios y un `;` final y rechaza los fences como `guard`.
- **Contexto de esquema solo con metadatos (sin índices ni filas):** *Fuente:* `docs/ARCHITECTURE.md`, *Data*: "The schema context sent to the LLM is built only from these tables. A table without a `meta_tables` row doesn't exist as far as the bot is concerned."
- **Sin historial ni endpoint:** el historial lo suma #11, y el endpoint y el cableado del cliente en el server, #8. *Fuente:* la división del epic (#1: #8 es el chat y #11 la memoria multi-turn) y `docs/ARCHITECTURE.md` (cada issue trae sus dependencias, variables y tests).
- **Logs por paso en este módulo:** *Fuente:* `docs/ARCHITECTURE.md`, *Observability* ("one log line per pipeline step and its duration"), y #6, que deja el log al que orquesta (#7/#8).
- **La función que arma el cliente valida las variables:** *Fuente:* `docs/ARCHITECTURE.md` (los ids de modelo vienen de `.env`) y un hecho técnico: sin `OPENAI_MODEL`, el error recién aparece en el primer request, y es confuso.
- **Contexto de esquema reutilizable:** *Fuente:* #12, cuyo juez recibe "el contexto de esquema, el mismo que #7 arma desde los metadatos".
- **El contexto se arma con la función del catálogo de #5:** no se duplica la lectura de `meta_*`. *Fuente:* #5, que ofrece esa función para que #7 la reutilice y le deja a #7 decidir si el contexto lleva índices; y `docs/ARCHITECTURE.md` (el catálogo y el contexto salen de las mismas tablas).
- **Cliente falso reutilizable:** *Fuente:* `docs/ARCHITECTURE.md` ("Tests never hit the network: they pass a fake client") y #9, que testea "con su cliente falso", el de #7. #8, #11 y #12 también testean con cliente falso.
- **Prompts en inglés:** *Fuente:* `workflow/rules.md`, regla 8 (el código va en inglés).

## Deferred decisions
- **Endpoint o script para probar la generación a mano:** el primer uso de punta a punta es `POST /api/chat` (#8). La verificación manual de este issue usa un script descartable.
- **Timeout y parámetros del modelo** (`max_output_tokens`, temperatura): se usan los valores por defecto del SDK y del modelo. El timeout por defecto del SDK es de 10 minutos por request. Revisarlos si una llamada se cuelga o sale cara.
- **Caché del contexto de esquema:** se arma en cada pregunta, porque son tres consultas chicas a SQLite.
- **Detectar en este paso las preguntas que no se pueden responder** (como el `not_related` del proyecto de referencia): lo hace la clasificación (#10).

## Open questions
1. **¿Qué motor de plantillas usamos para los prompts?**
   - a) **LiquidJS:** la misma sintaxis base que Jinja2 (`{{ }}`, `{% if %}`, `{% for %}`). Tiene mantenimiento activo (v10.30, release de octubre de 2026), trae sus tipos de TypeScript, tiene una sola dependencia (`commander`) y no escapa HTML por defecto.
   - b) **Nunjucks:** casi idéntico a Jinja2 (incluye macros y expresiones inline). Pero no tiene releases desde abril de 2023 (v3.2.4) ni tipos propios (hace falta `@types/nunjucks`), y escapa HTML por defecto: hay que desactivarlo para que no corrompa el SQL.
   - c) **Sin motor:** template literals de TypeScript. Cero dependencias, pero los prompts quedan dentro del código, y se aparta de "algo como Jinja2".
   - **Recomendación: a) LiquidJS**, porque cubre todo lo que usan los prompts del proyecto de referencia, con mantenimiento y tipos.
2. **¿Cuántos intentos de generar SQL hay por pregunta, en total?** Cada intento es un request a OpenAI, en serie.
   - a) **3** (1 + 2 reintentos).
   - b) **4** (1 + 3 reintentos), como `MAX_RETRIES = 3` del proyecto de referencia.
   - c) **2** (1 + 1 reintento).
   - **Recomendación: a) 3**, porque dos correcciones suelen alcanzar para una columna mal escrita o un `row_limit`, y acota la latencia del peor caso.
3. **¿Qué pasa si faltan `OPENAI_API_KEY` u `OPENAI_MODEL`?** #8 le deja a #7 decidir si se detecta al arrancar o en el primer request. La función que arma el cliente lanza en los dos casos: lo que cambia es dónde la llama #8.
   - a) **El backend no arranca:** #8 arma el cliente al iniciar, y el error nombra la variable. Desde #8, `npm run dev` necesita el `.env` con las dos variables.
   - b) **El backend arranca:** `/api/health` y `/api/catalog` funcionan, y `POST /api/chat` falla con el error que nombra la variable. #8 arma el cliente en el primer request.
   - **Recomendación: a)**, con la misma regla que se elija para `APP_ACCESS_KEY` (#3, pregunta 1, que recomienda que no arranque). El error de configuración aparece enseguida y con un mensaje claro, y queda un solo criterio para todas las variables obligatorias.
