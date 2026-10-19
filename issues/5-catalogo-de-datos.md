---
id: 5
title: Exponer el catálogo de datos (GET /api/catalog) y mostrarlo en el frontend
type: feat
status: open
parent: 1
created: 2026-10-19
---

## Goal
Que quien usa la demo vea qué datos conoce el bot: las tablas con sus columnas, las relaciones entre ellas y sus índices. Para eso, un endpoint protegido `GET /api/catalog` y una vista en el frontend que lo muestra.

Comentario en el epic: "tiene que traer el detalle de las tablas y las columnas, junto con sus relaciones e índices".

## Scope
- In:
  - Backend:
    - Una función que recibe la conexión a `data.db` y devuelve el catálogo. Tablas, columnas y relaciones salen de `meta_tables`, `meta_columns` y `meta_relationships` (#2). Los índices salen del propio SQLite (`pragma_index_list` / `pragma_index_info`). Vive aparte de la ruta HTTP, así se testea sin HTTP y #7 o #10 pueden reutilizarla.
    - La ruta `GET /api/catalog`. Queda protegida por el chequeo deny-by-default de #3, sin cablear nada extra.
    - Abrir `data.db` con la función read-only de #2 (`DATA_DB_PATH`) y pasar esa conexión a `buildApp` como una opción nueva, igual que `db`.
      - Es la primera ruta que lee `data.db`. #2 no toca `server.ts` ni `app.ts`: abrir `data.db` desde el servidor le toca al primer issue que lo use.
      - Esa misma conexión es la que después usa el ejecutor de SQL (#6, #8).
      - Cuándo se abre y qué pasa si el archivo no existe (pendiente: pregunta 2).
  - Frontend:
    - `getCatalog()` en `frontend/src/api.ts`, que llama a `/api/catalog` con la función de request de #4. Así manda `Authorization: Bearer <key>`, y un `401` vuelve a pedir la key sin que el catálogo lo maneje.
    - Un componente que muestra el catálogo, con estados de carga, error y catálogo vacío, ubicado en la pantalla principal (pendiente: pregunta 1).
    - El catálogo se pide al mostrar la pantalla principal, aunque la vista esté plegada u oculta. Así es la primera llamada protegida, y una key incorrecta se detecta apenas se ingresa (#4).
  - Docs:
    - `docs/ARCHITECTURE.md`:
      - en *Backend API*, la fila de `GET /api/catalog` pierde *(later issue)* y describe el contenido real (tablas, columnas, relaciones e índices);
      - en *Data*, se aclara que los índices se leen de SQLite y no de los metadatos;
      - en *Frontend*, se suma la vista del catálogo (pendiente: pregunta 1);
      - qué pasa sin `data.db` (pendiente: pregunta 2).
    - `README.md`, en *Getting started*: qué pasa si se corre `npm run dev` sin haber corrido `npm run seed` (pendiente: pregunta 2).
  - Tests unitarios del backend y del frontend.
- NOT in:
  - Las tablas de metadatos, el seed y la ruta de `data.db` (#2).
  - El chequeo de la key y la pantalla de la key (#3, #4).
  - El contexto de esquema que se manda al LLM, ni decidir si lleva los índices (#7).
  - Datos que el comentario no pide: claves primarias, `NOT NULL`, los tipos reales de SQLite (`PRAGMA table_info`), cantidad de filas, valores de ejemplo.
  - Validar que los metadatos coincidan con el esquema real de `data.db`.
  - Búsqueda, filtros, botón de refrescar o edición de metadatos en la UI.
  - Cache del catálogo.

## Expected behavior
- Caso normal:
  - con una key válida, `GET /api/catalog` responde `200` con el JSON de *Data*;
  - el frontend lo pide al mostrar la pantalla principal y muestra:
    - para cada tabla, su nombre y descripción, sus columnas (nombre, tipo y descripción) y sus índices (nombre, si es único y sus columnas);
    - cada relación (`from_table.from_column → to_table.to_column`) con su descripción.
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
  - Sin key válida: `401` (lo da #3).
  - Si faltan las tablas de metadatos en `data.db`, o falla cualquier lectura de SQLite: `500` con el formato de error estándar de Fastify. La UI muestra un mensaje de error con el status, p. ej. `Could not load the data catalog: HTTP 500`.
  - Error de red en el frontend: la UI muestra el mensaje del error.
  - Si `data.db` no existe (pendiente: pregunta 2).

## Data
- Entrada, leída de `data.db` por la conexión read-only:
  - `meta_tables`, `meta_columns` y `meta_relationships` (#2);
  - los índices de cada tabla declarada (`pragma_index_list`, `pragma_index_info`).
- Salida de `GET /api/catalog`:

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
  - #2: las tablas de metadatos, `DATA_DB_PATH`, la función que abre `data.db` en read-only y la función genérica que crea las tablas de metadatos (los tests la usan para armar sus fixtures);
  - #3: el chequeo de la key que protege la ruta. Los tests construyen la app con una key y mandan el header;
  - #4: la función de request del frontend, el manejo del `401` y la pantalla principal donde va la vista.
- Lo usan:
  - #6 y #8: la conexión read-only a `data.db` que este issue abre y pasa a `buildApp`;
  - #7 y #10 pueden reutilizar la función del catálogo, para el contexto de esquema y para las respuestas fuera de alcance;
  - #8 ubica el chat junto a la vista del catálogo (pendiente: pregunta 1).
- Servicios externos: ninguno. Sin dependencias nuevas.

## Acceptance criteria
- Backend (tests con fixtures propias, armadas con la función de #2 que crea las tablas de metadatos; nunca con el seed demo ni con `data/data.db`):
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
  - [ ] Si faltan las tablas de metadatos, la respuesta es `500`.
  - [ ] Con metadatos cargados fuera de orden, la respuesta respeta el orden de *Expected behavior*.
  - [ ] Un cambio en los metadatos entre dos requests se ve en el segundo, sin reconstruir la app.
  - [ ] La app abre `data.db` solo con la función read-only de #2, nunca de otra forma.
  - [ ] Si `data.db` no existe, se cumple lo que defina la pregunta 2 (pendiente: pregunta 2).
- Frontend:
  - [ ] `getCatalog()` pide `/api/catalog` con la función de request de #4 (lleva `Authorization: Bearer <key>`) y devuelve el JSON. Ante un status de error o un error de red, lanza un error.
  - [ ] El componente muestra el estado de carga, el de error (con el mensaje) y el de catálogo vacío.
  - [ ] El catálogo se pide al montar la pantalla principal, aunque la vista esté plegada u oculta.
  - [ ] Con datos de prueba, el componente muestra:
    - el nombre y la descripción de cada tabla;
    - sus columnas (nombre, tipo y descripción) y sus índices (nombre, si es único, columnas), o el texto corto si no tiene;
    - cada relación con su descripción.
  - [ ] La vista está en la pantalla principal, como defina la pregunta 1 (pendiente: pregunta 1).
- General:
  - [ ] Ni el backend ni el frontend tienen nombres de tablas o columnas del dominio en el código.
  - [ ] No se agregan dependencias: `backend/package.json` y `frontend/package.json` no cambian.
  - [ ] `docs/ARCHITECTURE.md` y `README.md` quedan actualizados como dice *Scope*.
  - [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85% (líneas, sentencias, funciones y ramas), y el código nuevo queda cubierto.
  - [ ] Verificación manual: con `npm run seed` y `npm run dev`, después de ingresar la key, la vista muestra las tablas del seed demo con sus columnas, relaciones e índices.

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

## Deferred decisions
- **Validar los metadatos contra el esquema real** (avisar de tablas o columnas declaradas que no existen). Sería útil con la carga manual, pero no hace falta para probar el concepto.
- **Claves primarias, `NOT NULL` y cantidad de filas en el catálogo.** No se pidieron. Se agregan si hacen falta.
- **Búsqueda, filtros y refresco en la vista.** El catálogo de la demo es chico.

## Open questions
1. **¿Dónde y cómo se muestra el catálogo en la pantalla principal?** Hoy no hay chat, pero #8 lo va a sumar en la misma pantalla. `docs/ARCHITECTURE.md` fija dos pantallas, sin router.
   - A) Una sección plegable `Available data` (`<details>` nativo) arriba del chat, cerrada por defecto.
   - B) Un panel lateral fijo, siempre visible; el chat ocupa la columna principal.
   - C) Un botón `Available data` en el encabezado que abre el catálogo en un overlay y se cierra para volver al chat.
   - Recomendación: **A**. Es HTML nativo, sin estado ni JS extra, no le quita espacio al chat y se testea fácil.
2. **¿Qué pasa si `data/data.db` no existe (no se corrió `npm run seed`)?** Una conexión read-only no puede crear el archivo, así que la función de #2 lanza un error que remite a `npm run seed`. #2 le deja a este issue decidir qué hace el backend.
   - A) `server.ts` abre `data.db` al arrancar, así que sin el archivo el backend no arranca y muestra el error de #2.
     - No suma código: es el patrón del scaffold, que abre las bases al arrancar y las inyecta en `buildApp`.
     - `/api/health` también queda caído hasta correr el seed. El README dice que el seed es obligatorio antes de `npm run dev`.
   - B) El backend arranca y `/api/health` sigue andando. `GET /api/catalog` (y después `/api/chat`) responde `503` con un mensaje que remite a `npm run seed`.
     - Hay que abrir `data.db` recién al usarlo, o reintentar, con más código y más casos de test.
   - Recomendación: **A**. Es lo más simple, el error aparece enseguida y con la solución, y es coherente con la recomendación A de la pregunta 1 de #3 (sin `APP_ACCESS_KEY`, el backend no arranca).
