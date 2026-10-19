---
id: 6
title: Ejecutar SQL sobre data.db con guardas de seguridad
type: feat
status: refined
parent: 1
created: 2026-10-19
---

## Goal
Que el pipeline Text-to-SQL pueda ejecutar sobre `data/data.db` el SQL que genera el LLM sin poder modificar datos. Ante cualquier rechazo o fallo que se arregle reescribiendo el SQL, tiene que devolver un error claro que la generación de SQL (#7) use como feedback para reintentar. Es un módulo del backend, todavía sin LLM y sin endpoint.

## Scope
- In:
  - Una función del backend que recibe una conexión a `data.db` y un SQL (string), y devuelve el resultado (columnas + filas) o un error tipado.
  - Las tres capas de seguridad del diseño (paso 4 del pipeline en `docs/ARCHITECTURE.md`):
    1. la ejecución corre sobre una conexión **read-only**;
    2. un chequeo previo acepta exactamente una sentencia que empiece con `SELECT` o `WITH`;
    3. un tope de 500 filas: un resultado más grande se rechaza, no se trunca.
  - Tests unitarios offline, con SQLite en archivos temporales.
  - Los tests que le falten a la apertura read-only de #2 (ver *Acceptance criteria*). Solo los tests: la función no se toca.
- NOT in:
  - `DATA_DB_PATH` y la función que abre `data.db` en read-only: son de #2, y #6 no agrega otra.
  - El LLM, el contexto de esquema y el bucle de reintentos con su tope de intentos: son de #7.
  - Endpoints y la persistencia del turno: son de #8. La conexión a `data.db` en `server.ts` / `buildApp` y el catálogo son de #5.
  - Logs y medición de duración: el log de cada paso con su duración lo hace quien orquesta el pipeline (#7/#8). Este módulo no loguea.
  - Armar los bloques `table` y `chart`: son de #8 y #9.
  - El timeout de consultas, una lista blanca de tablas y la conversión de BLOBs o de enteros grandes (ver *Deferred decisions*).
  - Dependencias nuevas: alcanza con `node:sqlite`.

## Expected behavior
- Normal case:
  - Un `SELECT` o un `WITH … SELECT` válido que devuelve hasta 500 filas responde con éxito. Trae `columns` (los nombres, en el orden del `SELECT`) y `rows` (una lista por fila, alineada con `columns`).
  - Se acepta `SELECT`/`WITH` en mayúsculas o minúsculas, con espacios o saltos de línea al principio y al final, y con un único `;` final.
- Edge cases:
  - **Resultado vacío:** éxito, con `columns` completas y `rows: []`. No es un error: "no hay datos" es una respuesta válida, y la narra #8.
  - **Columnas con el mismo nombre** (`SELECT a.id, b.id …`): se conservan todas. Por eso las filas son listas y no objetos: con objetos, una columna pisa a la otra.
  - **`;` que no separa sentencias:** si está dentro de un string literal, de un identificador entre comillas o de un comentario, no cuenta (`WHERE name = 'a;b'` es válido). Un comentario en medio o al final de la sentencia, sin `;` después, también se acepta.
  - **Texto después del `;` final:** solo pueden venir espacios. Cualquier otra cosa, incluso un comentario, cuenta como otra sentencia.
  - **Tope de filas:** exactamente 500 filas es éxito, y 501 o más es error `row_limit`. La lectura se corta en la fila 501, sin leer el resto del resultado. Así, una CTE recursiva infinita termina en `row_limit` en vez de colgar el servidor.
  - **Funciones de tabla de solo lectura** dentro de un `SELECT` (p. ej. `SELECT name FROM pragma_table_info('t')`): se aceptan, porque son lectura y la conexión es read-only.
- Errors: se **devuelven** (no se lanzan), cada uno con un `kind` y un mensaje en inglés pensado para el LLM. En ningún caso cambia el contenido de `data.db`.
  - **`guard`:** se rechaza antes de tocar la base. El mensaje dice qué regla se violó. Cubre tres casos:
    - SQL vacío o solo espacios;
    - una primera palabra que no es `SELECT` ni `WITH`: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE` (incluido `CREATE TEMP TABLE`, que una conexión read-only sí permite), `ATTACH`, `PRAGMA`, `VACUUM`, `EXPLAIN`, `VALUES`, o un comentario o un fence de markdown al principio;
    - más de una sentencia (`SELECT 1; DROP TABLE t`). Este chequeo hace falta porque `node:sqlite` ejecuta solo la primera sentencia y descarta el resto en silencio: sin él, el LLM nunca se enteraría.
  - **`sql`:** SQLite rechaza la consulta o falla al ejecutarla, o un valor del resultado no se puede leer. El mensaje es el original de SQLite/Node, sin reescribir. Cubre:
    - un error de sintaxis, o una tabla o columna inexistente;
    - un `WITH … DELETE/UPDATE/INSERT`: pasa el chequeo previo, pero la conexión read-only lo rechaza ("attempt to write a readonly database");
    - un entero mayor que 2^53 en el resultado, que no se puede representar como número de JS. El LLM lo puede resolver con un `CAST`.
  - **`row_limit`:** el resultado tiene más de 500 filas. El mensaje indica el tope (500) y pide una consulta más selectiva (agregar o filtrar). No informa el total, porque la lectura se corta en la fila 501.
  - **Errores que no dependen del SQL** (p. ej. la conexión está cerrada): **se lanzan**. Reescribir el SQL no los arregla, así que no tiene sentido mandárselos al LLM. Quien llama los deja subir (en un endpoint, terminan en un 500).

## Data
- **Entrada:** una conexión `DatabaseSync` a `data.db` abierta en read-only, y el SQL como string.
- **Salida:** la forma es indicativa; los nombres exactos se fijan en el plan de `/work-issue`.
  - Éxito: `{ ok: true, columns: string[], rows: unknown[][] }`. Los valores llegan como los entrega `node:sqlite`: `number`, `string`, `null`, y `Uint8Array` para los BLOB.
  - Error: `{ ok: false, kind: 'guard' | 'sql' | 'row_limit', message: string }`.
- **Tope de filas:** 500, una constante fija en el código, no configurable por `.env` (`docs/ARCHITECTURE.md`, *Configuration*).
- **Persistencia:** ninguna. No lee ni escribe `app.db`.

## Dependencies
- Depende de #2, que crea `data/data.db` (la ruta fija, relativa a la raíz del repo) y el dataset demo para probar a mano. Los tests de #6 no lo necesitan: arman su propia base temporal.
- Usa la apertura read-only de `data.db` que agrega #2 (`DATA_DB_PATH` y la función de apertura). La conexión la abre `server.ts` al arrancar y la pasa a `buildApp` desde #5 (sin `data.db`, el backend no arranca), y #8 la reutiliza para este ejecutor.
- Bloquea a:
  - #7, que reintenta con `message` como feedback, con 3 intentos en total por pregunta; un `row_limit` consume el mismo presupuesto que los demás errores;
  - #8, que arma el bloque `table` con `columns` y `rows`;
  - #9, que arma los datos del gráfico desde `rows`;
  - #12, a través del pipeline.
- Servicios externos: ninguno.

## Acceptance criteria
- [ ] Un `SELECT` y un `WITH … SELECT` válidos devuelven éxito, con `columns` en el orden del `SELECT` y `rows` como listas alineadas con `columns`.
- [ ] Se aceptan mayúsculas o minúsculas, espacios al principio y al final, y un `;` final. Un `;` dentro de un string literal no provoca rechazo.
- [ ] Un resultado vacío devuelve éxito con `columns` y `rows: []`.
- [ ] Con dos columnas del mismo nombre, se conservan los dos valores.
- [ ] Estos casos devuelven `guard`, y la tabla de prueba conserva sus filas:
  - SQL vacío;
  - `INSERT`, `UPDATE`, `DELETE`, `DROP`, `CREATE TEMP TABLE`, `ATTACH` y `PRAGMA`;
  - un comentario al principio;
  - `SELECT 1; DROP TABLE t`;
  - `SELECT 1; -- fin`.
- [ ] `WITH x AS (SELECT 1) DELETE FROM t` devuelve `sql` con el error de base read-only, y `t` conserva sus filas.
- [ ] Un error de sintaxis y una columna inexistente devuelven `sql` con el mensaje de SQLite (p. ej., contiene `no such column`).
- [ ] Un entero mayor que 2^53 en el resultado devuelve `sql`, en vez de lanzar.
- [ ] Con exactamente 500 filas hay éxito, con las 500 en `rows`. Con 501 se devuelve `row_limit`, con un mensaje que menciona `500`. Una CTE recursiva infinita devuelve `row_limit`, y el test termina.
- [ ] Con la conexión cerrada, la función lanza en vez de devolver un error.
- [ ] No se agrega otra función para abrir `data.db`: se usa la de #2. Al cerrar #6, los tests de esa función cubren estos dos casos (#6 suma el que falte): una escritura por esa conexión falla, y con el archivo inexistente la apertura falla sin crearlo.
- [ ] No se agregan dependencias ni endpoints.
- [ ] `npm run lint` y `npm run test:coverage` pasan con ≥85% en líneas, sentencias, funciones y ramas, y los archivos nuevos quedan cubiertos.

## Non-functional notes
- **Seguridad:**
  - La garantía dura es la conexión read-only.
  - El chequeo de sentencia única con prefijo `SELECT`/`WITH` no es un parser de SQL. Es barato, da feedback claro y bloquea lo que read-only deja pasar: `CREATE TEMP TABLE`, `ATTACH`, `PRAGMA`, y las sentencias extra que `node:sqlite` descarta.
  - No hay que habilitar `allowExtension` en la conexión: con el valor por defecto, `load_extension()` falla con "not authorized".
- **Rendimiento:** `node:sqlite` es síncrono, así que una consulta lenta bloquea el servidor. Está aceptado para un usuario y un dataset chico (`docs/ARCHITECTURE.md`, *Deferred decisions*).
- **Idioma:** los mensajes de error van en inglés, porque son strings de código (`workflow/rules.md`).

## Assumptions
El usuario aprobó el alcance original del issue ("Ok con esto.", comentario en el epic). Estas decisiones no las dijo literalmente; se derivan de una fuente confirmada:
- **Reintentos:** el bucle de reintentos y su tope quedan en #7; #6 solo devuelve el error. *Fuente:* el texto original de #6 ("Los errores deben devolverse…") y el de #7 ("reintenta con el error como feedback, hasta un tope de reintentos").
- **Qué se devuelve y qué se lanza:** los errores que se arreglan reescribiendo el SQL se devuelven como valor; los que no dependen del SQL se lanzan. *Fuente:* el texto original ("devolverse… para reintentar") y un hecho técnico: reescribir el SQL no arregla una conexión cerrada.
- **Enteros mayores que 2^53:** cuentan como error `sql`. *Fuente:* el diseño ("On a guard or SQL error the LLM retries with the error as feedback") y un hecho verificado en Node 24.15: `node:sqlite` lanza `ERR_OUT_OF_RANGE` y un `CAST` lo evita.
- **Filas como listas:** van alineadas con `columns`, no como objetos. *Fuente:* el bloque `table` del diseño es "columns + rows", y un hecho verificado: con filas-objeto, dos columnas del mismo nombre se pisan.
- **`;` final y comentarios:** se acepta un `;` final, y se rechazan un comentario inicial y cualquier texto después del `;`. *Fuente:* la lectura literal de "exactly one statement starting with SELECT or WITH". Un `;` final no agrega una sentencia.
- **Resultado más grande que el tope:** se rechaza, no se trunca, y se detecta leyendo como máximo 501 filas, así que el mensaje no da el total. *Fuente:* el diseño ("an oversized result is sent back for a more selective query").
- **Logs:** el módulo no loguea; el log del paso con su duración lo hace el orquestador. *Fuente:* el diseño (*Observability*: una línea de log por paso del pipeline). Este módulo es una función sin logger ni endpoint.
- **Campo `kind`:** el error lo lleva para que los tests (y los logs del orquestador) distingan qué capa rechazó. No cambia nada que vea el usuario. *Fuente:* las tres capas del diseño.
- **Apertura read-only de `data.db`:** la agrega #2 y #6 la reutiliza; #6 solo suma los tests que le falten. Así lo dejó la pasada de coherencia entre issues, porque #2 ya la incluye en su alcance. *Fuente:* #2 ("La app abre `data.db` con una conexión read-only; solo el seed escribe") y el diseño (*Data*).

Esta decisión se propuso durante el refinamiento y el usuario la confirmó el 2026-10-19:
- **Tope de filas: 500** (opción B, entre 200, 500 y 1000): entra un año de datos diarios (365) para un gráfico de línea y la tabla sigue manejable sin paginar.

## Deferred decisions
- **Timeout de consultas / worker thread:** ya está diferido en `docs/ARCHITECTURE.md`. Hasta entonces, una consulta que tarda mucho antes de devolver la primera fila bloquea el servidor. Le pasa, p. ej., a un `count(*)` sobre una CTE recursiva infinita: el tope de filas no lo corta.
- **Lista blanca de tablas** (solo las descritas en `meta_tables`): no está entre las capas del diseño, y con read-only, leer `meta_*` o `sqlite_master` no tiene riesgo. Revisarla si el bot empieza a responder sobre tablas no descritas.
- **BLOBs:** se devuelven como `Uint8Array`, sin convertir, y el dataset demo no tiene. Resolverlo cuando un dataset real los traiga.
- **Enteros mayores que 2^53:** hoy son un error `sql` que el LLM resuelve con `CAST`. Leerlos como `bigint` o string solo si un dataset real usa IDs así.
- **Consultas con parámetros:** el SQL del LLM llega literal, así que no hacen falta.
