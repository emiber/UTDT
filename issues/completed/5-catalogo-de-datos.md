---
id: 5
title: Exponer el catálogo de datos (GET /api/catalog) y mostrarlo en el frontend
type: feat
status: closed
parent: 1
created: 2026-10-19
---

## Goal
Que quien usa la demo vea qué datos conoce el bot: las tablas con sus columnas, las relaciones entre ellas y sus índices. Para eso, un endpoint protegido `GET /api/catalog` y una sección plegable `Available data` en la pantalla principal del frontend que lo muestra.

Comentario en el epic: "tiene que traer el detalle de las tablas y las columnas, junto con sus relaciones e índices".

## Scope
- In:
  - Backend:
    - Una función que recibe la conexión a `data.db` y devuelve el catálogo con la forma de *Data*. Tablas, columnas y relaciones salen de `meta_tables`, `meta_columns` y `meta_relationships` (#2). Los índices salen del propio SQLite (`pragma_index_list` / `pragma_index_info`). Vive aparte de la ruta HTTP, así se testea sin HTTP y #7 o #10 pueden reutilizarla. #7 arma su contexto de esquema con ella, así que estas reglas son de la función y no de la ruta:
      - filtra las tablas sin fila en `meta_tables`, con sus columnas y sus relaciones (ver *Expected behavior*);
      - devuelve tablas, columnas y relaciones en el orden de carga de los metadatos;
      - si faltan las tablas `meta_*`, lanza un error: no devuelve un catálogo vacío.
    - La ruta `GET /api/catalog`. Queda protegida por el chequeo deny-by-default de #3, sin cablear nada extra.
    - Abrir `data.db` en `server.ts` al arrancar, con la función read-only de #2 y `DATA_DB_PATH`, y pasar esa conexión a `buildApp` como una opción nueva, igual que `db`.
      - Es la primera ruta que lee `data.db`. #2 no toca `server.ts` ni `app.ts`: abrir `data.db` desde el servidor le toca al primer issue que lo use.
      - Esa misma conexión es la que después usa el ejecutor de SQL (#6, #8).
      - Si `data/data.db` no existe, la función de #2 lanza su error (nombra la ruta y dice que hay que correr `npm run seed`) y el backend no arranca. Este issue no le suma manejo propio: ni apertura diferida, ni reintentos, ni `503`.
  - Frontend:
    - `getCatalog()` en `frontend/src/api.ts`, que llama a `/api/catalog` con la función de request de #4. Así manda `Authorization: Bearer <key>`, y un `401` vuelve a pedir la key sin que el catálogo lo maneje.
    - Un componente que muestra el catálogo, con estados de carga, error y catálogo vacío.
    - El componente va en la pantalla principal (#4), dentro de una sección `<details>` nativa con `<summary>` `Available data`, cerrada por defecto.
      - Abrir y cerrar la sección es comportamiento nativo del navegador: sin estado ni JS propio.
      - Los estados de carga, error y catálogo vacío se muestran dentro de la sección.
      - Hoy comparte la pantalla con el estado del backend del scaffold. #13 suma el chat en la misma pantalla, junto a esta sección, sin cambiarla.
    - El catálogo se pide al montar la pantalla principal, aunque la sección esté cerrada. Así es la primera llamada protegida, y una key incorrecta se detecta apenas se ingresa (#4).
  - Docs:
    - `docs/ARCHITECTURE.md`:
      - en *Backend API*, la fila de `GET /api/catalog` pierde *(later issue)* y describe el contenido real (tablas, columnas, relaciones e índices);
      - en *Data*, se aclara que los índices se leen de SQLite y no de los metadatos, y que el backend abre `data.db` read-only al arrancar: sin el archivo no arranca, y hay que correr `npm run seed` antes;
      - en *Frontend*, se suma la sección `Available data` de la pantalla principal (`<details>` cerrado por defecto), que pide el catálogo al montarse.
    - `README.md`, en *Getting started*: `npm run seed` es obligatorio antes de `npm run dev`. Sin `data/data.db` el backend no arranca (tampoco `/api/health`) y su error dice que hay que correr el seed.
  - Tests unitarios del backend y del frontend.
- NOT in:
  - Las tablas de metadatos, el seed, `DATA_DB_PATH` y la función read-only que abre `data.db` (#2).
  - El chequeo de la key y la pantalla de la key (#3, #4).
  - La vista de chat y su ubicación en la pantalla principal (#13).
  - El contexto de esquema que se manda al LLM, ni decidir si lleva los índices (#7).
  - Datos que el comentario no pide: claves primarias, `NOT NULL`, los tipos reales de SQLite (`PRAGMA table_info`), cantidad de filas, valores de ejemplo.
  - Validar que los metadatos coincidan con el esquema real de `data.db`.
  - Búsqueda, filtros, botón de refrescar o edición de metadatos en la UI.
  - Cache del catálogo.

## Expected behavior
- Caso normal:
  - con una key válida, `GET /api/catalog` responde `200` con el JSON de *Data*;
  - el frontend lo pide al montar la pantalla principal, con la sección `Available data` cerrada;
  - al abrir la sección se ve el catálogo:
    - para cada tabla, su nombre y descripción, sus columnas (nombre, tipo y descripción) y sus índices (nombre, si es único y sus columnas);
    - cada relación (`from_table.from_column → to_table.to_column`) con su descripción.
  - Si la respuesta todavía no llegó o falló, al abrir la sección se ve el estado de carga o el de error.
- Para el catálogo solo existen las tablas que tienen fila en `meta_tables`:
  - las filas de `meta_columns` de una tabla no declarada se ignoran;
  - una relación cuya tabla de origen o de destino no está declarada se omite.
- Índices:
  - son todos los que SQLite reporta para la tabla, incluidos los automáticos de `PRIMARY KEY` y `UNIQUE` (`sqlite_autoindex_*`);
  - sus columnas van en el orden del índice;
  - una `INTEGER PRIMARY KEY` no crea índice en SQLite, así que no aparece.
- Orden estable:
  - tablas, columnas y relaciones en el orden en que se cargaron en los metadatos;
  - índices por nombre.
- El catálogo se lee en cada request: un cambio en los metadatos se ve en el próximo request, sin reiniciar el backend. En el frontend, recargando la página.
- Edge cases:
  - Metadatos vacíos: `200` con `{ "tables": [], "relationships": [] }`. La UI muestra un mensaje de catálogo vacío.
  - Una tabla sin filas en `meta_columns` sale con `columns: []`, y una tabla sin índices, con `indexes: []`. La UI lo indica con un texto corto en vez de una tabla vacía.
  - Una tabla declarada en `meta_tables` que no existe en `data.db` (carga manual incompleta) aparece igual, con `indexes: []`, sin error.
  - Un índice sobre una columna que no está en `meta_columns` se muestra igual, con el nombre que reporta SQLite.
- Errores:
  - Sin key válida: `401` (lo da #3). En el frontend, la función de request de #4 vuelve a pedir la key. Como el catálogo se pide al montar la pantalla principal, una key incorrecta se detecta apenas se ingresa.
  - Si faltan las tablas de metadatos en `data.db`, la función del catálogo lanza un error. Ese error, o cualquier otra falla al leer SQLite, da `500` con el formato de error estándar de Fastify. La UI muestra un mensaje de error con el status, p. ej. `Could not load the data catalog: HTTP 500`.
  - Error de red en el frontend: la UI muestra el mensaje del error.
  - Si `data/data.db` no existe al arrancar: el backend no arranca y muestra el error de #2, que nombra la ruta y dice que hay que correr `npm run seed`. `/api/health` tampoco responde. Corriendo `npm run seed` y de nuevo `npm run dev`, arranca normal. Con el backend arrancado, `GET /api/catalog` no tiene un caso de archivo faltante.

## Data
- Entrada, leída de `data.db` por la conexión read-only que `server.ts` abre al arrancar:
  - `meta_tables`, `meta_columns` y `meta_relationships` (#2);
  - los índices de cada tabla declarada (`pragma_index_list`, `pragma_index_info`).
- Salida de la función del catálogo y de `GET /api/catalog` (la misma forma):

  ```json
  {
    "tables": [
      {
        "name": "orders",
        "description": "One row per order.",
        "columns": [
          { "name": "order_id", "dataType": "INTEGER", "description": "Order id." },
          { "name": "customer_id", "dataType": "INTEGER", "description": "Customer who placed it." }
        ],
        "indexes": [
          { "name": "idx_orders_customer_id", "unique": false, "columns": ["customer_id"] }
        ]
      }
    ],
    "relationships": [
      {
        "fromTable": "orders",
        "fromColumn": "customer_id",
        "toTable": "customers",
        "toColumn": "customer_id",
        "description": "The customer who placed the order."
      }
    ]
  }
  ```

  - El ejemplo es ilustrativo: el código no conoce ninguna tabla.
  - `name`, `description`, `dataType` y los campos de las relaciones son los de los metadatos, tal cual: todos strings, porque en #2 son `TEXT NOT NULL`. `dataType` es `meta_columns.data_type`.
  - Los índices salen de SQLite: `name`, `unique` (booleano) y `columns` (nombres, en el orden del índice).
- Persistencia: ninguna. La app nunca escribe `data.db`.

## Dependencies
- Depende de:
  - #2: las tablas de metadatos, `DATA_DB_PATH`, la función que abre `data.db` en read-only (y su error cuando falta el archivo) y la función genérica que crea las tablas de metadatos (los tests la usan para armar sus fixtures);
  - #3: el chequeo de la key que protege la ruta. Los tests construyen la app con una key y mandan el header;
  - #4: la función de request del frontend, el manejo del `401` y la pantalla principal donde va la sección `Available data`.
- Lo usan:
  - #6 y #8: la conexión read-only a `data.db` que este issue abre en `server.ts` y pasa a `buildApp`. Como se abre al arrancar, no necesitan manejar un `data.db` faltante;
  - #7: arma el contexto de esquema con la función del catálogo, y depende de su contrato (filtra las tablas no declaradas, respeta el orden de carga y lanza un error si faltan las `meta_*`);
  - #10 puede reutilizar la función del catálogo para las respuestas fuera de alcance;
  - #13 ubica el chat en la pantalla principal, junto a la sección `Available data`.
- Servicios externos: ninguno. Sin dependencias nuevas.

## Acceptance criteria
- Backend (tests con fixtures propias, armadas con la función de #2 que crea las tablas de metadatos; nunca con el seed demo ni con `data/data.db`):
  - [ ] La función del catálogo, llamada directo con una conexión y sin HTTP, devuelve la forma de *Data*.
  - [ ] Si faltan las tablas `meta_*`, la función del catálogo lanza un error (no devuelve `{ "tables": [], "relationships": [] }`).
  - [ ] `GET /api/catalog` con la key correcta responde `200` con la forma de *Data*: tablas con columnas e índices, y relaciones.
  - [ ] `GET /api/catalog` sin key responde `401`.
  - [ ] Las filas de `meta_columns` de una tabla no declarada no aparecen. Una relación con la tabla de origen o de destino sin declarar se omite.
  - [ ] Aparecen, con su `unique` correcto:
    - un índice creado con `CREATE INDEX`;
    - un `CREATE UNIQUE INDEX`;
    - el índice automático de una restricción `UNIQUE`.
  - [ ] Un índice de varias columnas las lista en el orden del índice.
  - [ ] Una tabla sin columnas descritas da `columns: []`. Una sin índices da `indexes: []`. Una declarada pero inexistente en `data.db` da `indexes: []`, y la respuesta es `200`.
  - [ ] Con los metadatos vacíos, la respuesta es `200` con `{ "tables": [], "relationships": [] }`.
  - [ ] Si faltan las tablas de metadatos, `GET /api/catalog` responde `500`.
  - [ ] Con metadatos cargados fuera de orden, la respuesta respeta el orden de *Expected behavior*.
  - [ ] Un cambio en los metadatos entre dos requests se ve en el segundo, sin reconstruir la app.
  - [ ] `buildApp` recibe la conexión a `data.db` como opción, y los tests la inyectan con su fixture.
  - [ ] `server.ts` abre `data.db` al arrancar, antes de `listen`, con la función read-only de #2 y `DATA_DB_PATH`, y le pasa la conexión a `buildApp`. La app no abre `data.db` de ninguna otra forma.
- Frontend:
  - [ ] `getCatalog()` pide `/api/catalog` con la función de request de #4 (lleva `Authorization: Bearer <key>`) y devuelve el JSON. Ante un status de error o un error de red, lanza un error.
  - [ ] La pantalla principal tiene un `<details>` con `<summary>` `Available data`, sin el atributo `open` al montarse, y el catálogo se renderiza dentro.
  - [ ] El catálogo se pide al montar la pantalla principal, con el `<details>` cerrado.
  - [ ] El componente muestra el estado de carga, el de error (con el mensaje) y el de catálogo vacío.
  - [ ] Con datos de prueba, el componente muestra:
    - el nombre y la descripción de cada tabla;
    - sus columnas (nombre, tipo y descripción) y sus índices (nombre, si es único, columnas), o el texto corto si no tiene;
    - cada relación con su descripción.
- General:
  - [ ] Ni el backend ni el frontend tienen nombres de tablas o columnas del dominio en el código.
  - [ ] No se agregan dependencias: `backend/package.json` y `frontend/package.json` no cambian.
  - [ ] `docs/ARCHITECTURE.md` y `README.md` quedan actualizados como dice *Scope*.
  - [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85% (líneas, sentencias, funciones y ramas), y el código nuevo queda cubierto.
  - [ ] Verificación manual: con `npm run seed` y `npm run dev`, después de ingresar la key, la sección `Available data` está cerrada; al abrirla muestra las tablas del seed demo con sus columnas, relaciones e índices.
  - [ ] Verificación manual (`server.ts` está fuera de la cobertura): sin `data/data.db`, `npm run dev` deja el backend sin arrancar, con el error de #2 que nombra la ruta y menciona `npm run seed`, y `/api/health` no responde. Después de `npm run seed`, el backend arranca y `/api/health` responde `200`.

## Non-functional notes
- Seguridad:
  - El catálogo se lee por la conexión read-only: SQLite rechaza cualquier escritura.
  - Son consultas fijas del código, no SQL del LLM, así que la guarda de #6 (que bloquea `PRAGMA`) no aplica.
  - Los nombres de tabla vienen de los metadatos, que se cargan a mano: se pasan como parámetros (p. ej. `SELECT … FROM pragma_index_list(?)`), nunca interpolados en el SQL.
  - El catálogo expone nombres de tablas, columnas e índices a quien tenga la key. Alcanza para la demo local.
- Rendimiento: sin cache, unas pocas consultas síncronas (`node:sqlite`) por tabla en cada request. Alcanza para un catálogo chico.

## Assumptions
- **Los índices se leen de SQLite, no de una tabla de metadatos nueva.**
  - Fuente: el comentario en el epic pide los índices, y el esquema de metadatos aprobado en `docs/ARCHITECTURE.md` no tiene dónde guardarlos.
  - SQLite ya los conoce. Copiarlos a mano en una tabla sería una segunda fuente que se puede desincronizar (`workflow/principles.md`, Ponytail).
- **"Índices" son todos los que SQLite reporta**, incluidos los automáticos de `PRIMARY KEY` y `UNIQUE`. Fuente: lectura literal del comentario en el epic.
- **"Detalle de las columnas" son los campos de `meta_columns`**: nombre, tipo y descripción. Fuente: `docs/ARCHITECTURE.md`, donde todo lo que el bot sabe de los datos sale de los metadatos. El comentario no pide claves primarias ni `NOT NULL`.
- **Solo existen las tablas declaradas en `meta_tables`**, y una relación con una tabla no declarada se omite. Fuente: `docs/ARCHITECTURE.md`: "A table without a `meta_tables` row doesn't exist as far as the bot is concerned".
- **Los metadatos no se validan contra el esquema real**: una tabla declarada que no existe aparece igual. Fuente: en `docs/ARCHITECTURE.md` los metadatos son la fuente; validarlos no se pidió (Ponytail).
- **La forma del JSON**: campos en camelCase y las relaciones a nivel raíz, como en `meta_relationships`. Fuente: las columnas de los metadatos de `docs/ARCHITECTURE.md`, con la convención camelCase del contrato de `/api/chat` (`conversationId`, `turnId`).
- **Un error al leer los metadatos da `500` estándar de Fastify.** Fuente: el patrón del scaffold, donde `/api/health` con la base no disponible da `500`.
- **El catálogo se lee en cada request, sin cache.** Fuente: Ponytail. Además, `docs/ARCHITECTURE.md` prevé cargar datos y metadatos a mano (DB Browser), y así los cambios se ven sin reiniciar.
- **El orden: el de carga de los metadatos; los índices, por nombre.**
  - Fuente: los tests necesitan un orden determinístico.
  - Las tablas de metadatos no tienen columna de posición (`docs/ARCHITECTURE.md`, #2), así que el orden de carga es el único que respeta el que eligió quien las cargó.
  - Los índices no se cargan en los metadatos: salen de SQLite, y se ordenan por nombre para que el orden sea estable.
- **El filtro, el orden y el error por falta de `meta_*` son contrato de la función del catálogo, no solo de la ruta.** Fuente: #7 arma su contexto de esquema con esta función y necesita las mismas reglas. Se explicitó al cerrar el refinamiento, en la pasada de coherencia entre issues.
- **Dónde se muestra el catálogo.** Fuente: decisión propuesta durante el refinamiento y confirmada por el usuario el 2026-10-19.
  - Opción elegida (A): una sección `<details>` nativa `Available data` en la pantalla principal, cerrada por defecto, que pide el catálogo al montarse.
  - Se descartaron un panel lateral fijo y un overlay abierto desde el encabezado: la sección es HTML nativo, sin estado ni JS extra, y no le quita espacio al chat de #13.
- **Qué pasa si falta `data/data.db`.** Fuente: decisión propuesta durante el refinamiento y confirmada por el usuario el 2026-10-19.
  - Opción elegida (A): `server.ts` abre `data.db` read-only al arrancar con la función de #2, así que sin el archivo el backend no arranca (tampoco `/api/health`) y muestra el error de #2, que remite a `npm run seed`.
  - Se descartó arrancar igual y responder `503` en `GET /api/catalog`: pedía apertura diferida o reintentos, con más código y más tests. Es el mismo criterio fail-fast que `APP_ACCESS_KEY` (#3) y `OPENAI_API_KEY` / `OPENAI_MODEL` (#8, que arma el cliente al arrancar).

## Deferred decisions
- **Validar los metadatos contra el esquema real** (avisar de tablas o columnas declaradas que no existen). Sería útil con la carga manual, pero no hace falta para probar el concepto.
- **Claves primarias, `NOT NULL` y cantidad de filas en el catálogo.** No se pidieron. Se agregan si hacen falta.
- **Búsqueda, filtros y refresco en la sección `Available data`.** El catálogo de la demo es chico.

## Pull request
Branch: `feat/5-catalogo-de-datos` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- **`backend/src/catalog.ts`:** `readCatalog(db)` arma el catálogo con la forma de *Data*.
  - Solo cuenta las tablas declaradas en `meta_tables`: descarta las columnas y relaciones de tablas no declaradas.
  - Respeta el orden de carga (`ORDER BY rowid`) y ordena los índices por nombre.
  - Lee los índices de SQLite (`pragma_index_list` / `pragma_index_info`), con los nombres como parámetros. Una parte de expresión de un índice sale como `(expression)`, en vez de `null`.
  - Lanza un error si faltan las tablas `meta_*`.
- **`backend/src/app.ts`:** `GET /api/catalog`, protegida por el hook de #3. `buildApp` recibe la conexión `dataDb`.
- **`backend/src/server.ts`:** abre `data.db` read-only al arrancar, antes de `listen`. Sin el archivo, el backend no arranca.
- **Frontend:**
  - `getCatalog()` en `api.ts`, con `apiFetch`.
  - `DataCatalog.vue`: un `<details>` `Available data`, cerrado, que pide el catálogo al montarse. Muestra los estados de carga, error y vacío, y cada tabla con sus columnas e índices, más las relaciones.
  - `App.vue`: la pantalla principal suma la sección.
- **Docs:** `docs/ARCHITECTURE.md` (*Data*, *Catalog*, *Backend API*, *Auth* y *Frontend*) y `README.md` (*Status*, seed obligatorio antes de `npm run dev`, aviso de Windows y estructura).

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (12 archivos, 122 tests)
- Coverage: 100% en sentencias, ramas, funciones y líneas (umbral 85%); archivos nuevos o cambiados bajo el umbral: ninguno
- Build: `npm run build -w frontend` — pass
- Manual: pass, con el `.env` real y sin imprimir la key.
  - Sin `data/data.db`, el backend no arranca y muestra `Database not found at …\data\data.db. Run \`npm run seed\` to create it.`; `/api/health` no responde.
  - Con `npm run seed` y `npm run dev`, por el proxy de Vite:
    - health da `200`;
    - `/api/catalog` da `401` sin key;
    - con la key da `200`, con `customers`, `products` y `orders`, sus columnas, `idx_orders_customer_id` e `idx_orders_product_id`, y las 2 relaciones.
  - La key no aparece en el log.
  - La sección en un navegador real no se probó (no hay navegador en esta sesión): la cubren los tests de componentes.
- Self-review: 2 rondas con agente separado, sin blockers.
  - Aplicadas: documentar el `(expression)` (JSDoc y *Catalog*) y reacomodar el párrafo del doc.
  - No aplicada: responder el `500` sin el mensaje de SQLite. El issue pide el `500` estándar de Fastify, igual que `/api/health`. Queda como follow-up.

  (separate agent; el último cambio, solo de formato del doc, se verificó inline)
- Plan: aprobado de antemano por el usuario para el trabajo desatendido del 2026-10-19.
- Security: pass.
  - La ruta nueva queda detrás del hook deny-by-default, con test de `401`.
  - Los nombres de tabla e índice van como parámetros, y la conexión es read-only.
  - El `500` incluye el mensaje de SQLite (p. ej. `no such table: meta_tables`) solo para quien tiene la key (ver follow-ups).
- Docs: updated `README.md`, `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
- Propuesto, sin crear: un manejador de errores que, en los `5xx`, loguee el error y responda un mensaje genérico. Así no viajan al cliente mensajes internos de SQLite, algo que pesa más cuando #6/#8 ejecuten SQL del LLM.
