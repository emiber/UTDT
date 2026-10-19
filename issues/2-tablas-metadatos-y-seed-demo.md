---
id: 2
title: Crear tablas de metadatos y seed demo
type: feat
status: refined
parent: 1
created: 2026-10-19
---

## Goal
Generar `data/data.db` con `npm run seed`. La base trae las tablas de metadatos que le describen el dataset al bot y un dataset demo chico de ventas para ejercitar el pipeline. La leen el catálogo (#5), el ejecutor de SQL (#6), la generación de SQL (#7) y la evaluación (#12). El usuario aprobó el planteo general en el epic: "Ok con esto, armá el issue."

## Scope
- In:
  - **Tablas de metadatos** en `data.db`: `meta_tables`, `meta_columns` y `meta_relationships`, con las columnas de `docs/ARCHITECTURE.md` (ver *Data*).
    - Las crea una función genérica que recibe una conexión y no sabe nada del demo.
    - La usan el seed y los tests de otros issues, para armar sus propias bases de prueba sin depender del demo.
  - **Dataset demo** en un único archivo reemplazable: las tablas `customers`, `products` y `orders`, con sus filas, sus índices y sus filas de metadatos, tal como se detallan en *Data*. Un producto por pedido, sin tabla de líneas de pedido.
  - **`npm run seed`** (script de la raíz): crea `data/data.db` y la carpeta `data/` si falta, con las tablas de metadatos y el demo. Si `data/data.db` ya existe, lo recrea desde cero: borra todo lo que tenga, incluidos los datos y metadatos cargados a mano, y deja solo el contenido del seed.
  - **Acceso de la app a `data.db`**, para que lo usen #5 y #6:
    - la constante `DATA_DB_PATH`: `data/data.db` relativo a la raíz del repo, igual que `APP_DB_PATH`;
    - una función que abre `data.db` en modo read-only.
  - Tests unitarios del código nuevo. El entry point del seed solo llama funciones testeadas, así que se excluye de coverage en `vitest.config.ts`, igual que `server.ts`.
  - Docs:
    - `README.md`, en *Getting started*: el paso `npm run seed` y dos advertencias:
      - correrlo de nuevo recrea `data/data.db` desde cero y borra todo lo que tenga, incluidos los datos cargados a mano;
      - hay que frenar el backend antes de re-seedear, porque desde #5 el backend mantiene `data.db` abierto y en Windows el archivo queda bloqueado.
    - `docs/ARCHITECTURE.md`, sección *Data*: quitar *(later issue)* de *Initial data*, decir dónde vive el archivo del demo y documentar que re-seedear recrea `data.db` desde cero.
- NOT in:
  - Abrir `data.db` desde el servidor o desde un endpoint, y qué hace el backend si el archivo no existe. Eso le toca a #5: `server.ts` abre `data.db` al arrancar con la función read-only de este issue y, si falta el archivo, el backend no arranca y muestra el error de esa función. En este issue, `server.ts` y `app.ts` no cambian.
  - Leer los metadatos para mostrarlos (#5) o para armar el contexto del LLM (#7).
  - Las guardas del SQL (#6).
  - Las tablas de `app.db` (conversaciones y turnos, #8).
  - Validar metadatos cargados a mano (ver *Deferred decisions*).
  - Conservar datos cargados a mano al re-seedear (ver *Deferred decisions*).
  - La importación de CSV/Excel, diferida en `docs/ARCHITECTURE.md`.
  - Las preguntas golden de la evaluación (#12).

## Expected behavior
- Caso normal: desde la raíz, `npm run seed` crea `data/data.db` con las 3 tablas de metadatos y las 3 tablas del demo con sus filas. Imprime la ruta del archivo y termina con código 0.
- Edge cases:
  - Si `data.db` ya existe, `npm run seed` lo recrea desde cero, sin pedir confirmación: borra todo lo que tenga (tablas, filas y metadatos, incluidos los cargados a mano) y deja exactamente el contenido del seed, idéntico al de la primera corrida. Imprime la ruta y termina con código 0.
  - El contenido es determinístico: cada corrida carga las mismas filas. No hay valores aleatorios ni fechas relativas al día de la corrida.
  - Las tablas `meta_*` no tienen fila en `meta_tables`, así que para el bot no existen.
  - La ruta no depende del directorio desde el que se corre: siempre es `data/data.db` en la raíz del repo.
  - La función read-only abre un `data.db` existente. Cualquier escritura (`INSERT`, `UPDATE`, `DELETE`, `CREATE`, `DROP`) falla con el error de SQLite `attempt to write a readonly database`.
- Errores:
  - Si la carga falla en el medio (por ejemplo, por una fila inválida en el archivo del demo o porque otro proceso tiene el archivo bloqueado), el script termina con código distinto de 0 y un mensaje claro.
  - La carga corre en una sola transacción, así que una falla no deja `data.db` con tablas a medio cargar.
  - Si `data.db` no existe, la función read-only lanza un error cuyo mensaje nombra la ruta del archivo y dice que hay que correr `npm run seed`. No crea el archivo. Es el mensaje que ve el usuario si arranca el backend sin haber sembrado (#5).

## Data
**Tablas de metadatos.** Todas las columnas son `TEXT NOT NULL`.

| Tabla | Columnas | Clave primaria |
|---|---|---|
| `meta_tables` | `table_name`, `description` (qué guarda la tabla) | `table_name` |
| `meta_columns` | `table_name`, `column_name`, `data_type`, `description` (significado, unidades, cómo agregarla) | `table_name`, `column_name` |
| `meta_relationships` | `from_table`, `from_column`, `to_table`, `to_column`, `description` | `from_table`, `from_column`, `to_table`, `to_column` |

- `data_type` es el tipo declarado de la columna en SQLite (`INTEGER`, `REAL`, `TEXT`). El formato y las unidades (fecha ISO, moneda) van en `description`.
- No hay foreign keys entre las tablas `meta_*`, así que ocultarle una tabla al bot es borrar su fila de `meta_tables`.
- Son tablas comunes con `rowid` (sin `WITHOUT ROWID`), así que se puede recuperar el orden de carga. #5 muestra columnas y relaciones en ese orden.
- Las filas de `meta_columns` y `meta_relationships` de una tabla sin fila en `meta_tables` se ignoran. Ese filtro lo aplica la función de catálogo de #5, y #7 lo hereda porque arma su contexto con esa función.

**Dataset demo.** Los datos son ficticios y todo va en inglés: nombres, descripciones y valores.

| Tabla | Columnas | Filas (orden de magnitud) |
|---|---|---|
| `customers` | `customer_id` INTEGER PK, `name` TEXT, `country` TEXT, `segment` TEXT (`Consumer` / `Business`) | ~20, en 4 o 5 países |
| `products` | `product_id` INTEGER PK, `name` TEXT, `category` TEXT, `unit_price` REAL (USD) | ~15, en 3 o 4 categorías |
| `orders` | `order_id` INTEGER PK, `customer_id` INTEGER → `customers`, `product_id` INTEGER → `products`, `order_date` TEXT (`YYYY-MM-DD`), `quantity` INTEGER, `amount` REAL (USD) | algunos cientos, repartidos en todos los meses de 2024 y 2025 |

- Cada pedido tiene un solo producto: no hay tabla de líneas de pedido.
- `amount` es `quantity` × `unit_price` del producto, redondeado a 2 decimales. Los precios no cambian en el tiempo.
- Hay índices explícitos en `orders(customer_id)` y `orders(product_id)`, para que el catálogo (#5) tenga índices que mostrar.
- Metadatos del demo:
  - una fila de `meta_tables` por tabla, y una de `meta_columns` por columna, cargadas en el orden de las columnas de cada tabla;
  - una fila de `meta_relationships` por foreign key: `orders.customer_id` → `customers.customer_id` y `orders.product_id` → `products.product_id`.
- Las descripciones de las columnas numéricas dicen la unidad y cómo agregarlas. Por ejemplo, para `amount`: "Order total in USD. Sum it to get revenue."

**Persistencia.** Solo `data/data.db`, que ya está gitignored por la entrada `data/` de `.gitignore`. Cada `npm run seed` lo reemplaza entero. `app.db` no cambia.

## Dependencies
- No depende de otros issues: se apoya en el scaffold (`openDatabase` y `APP_DB_PATH` en `backend/src/db.ts`).
- Bloquea a:
  - #5, que abre `data.db` al arrancar el backend con `DATA_DB_PATH` y la función read-only de este issue, y lee las tablas de metadatos y los índices del demo (vía `PRAGMA`);
  - #6, que ejecuta SQL sobre `data.db` con la función read-only de este issue;
  - #7, que arma el contexto de esquema desde los metadatos;
  - #12, porque las preguntas golden se escriben contra el dataset demo.
- Servicios externos: ninguno. No agrega dependencias, porque `node:sqlite` viene con Node.

## Acceptance criteria
- [ ] `npm run seed` desde la raíz crea `data/data.db` (y `data/` si falta), imprime la ruta y termina con código 0. Correrlo de nuevo con el archivo ya creado también termina con código 0. Se verifica a mano en el PR.
- [ ] Las tablas de metadatos tienen exactamente las columnas de *Data*, todas `TEXT NOT NULL`. Un insert con clave primaria repetida falla. Test sobre una base en memoria.
- [ ] Consistencia del demo, con un test sobre una base sembrada en memoria o en un archivo temporal:
  - cada tabla del demo tiene una fila en `meta_tables`, y ninguna tabla `meta_*` la tiene;
  - las filas de `meta_columns` de cada tabla, en orden de carga, coinciden con sus columnas reales y en el mismo orden (`PRAGMA table_info`), y `data_type` coincide con el tipo declarado;
  - hay exactamente una fila de `meta_relationships` por cada foreign key declarada (`PRAGMA foreign_key_list`);
  - ninguna descripción está vacía.
- [ ] Contenido del demo, con un test sobre una base sembrada:
  - sin contar las tablas internas `sqlite_*`, la base tiene exactamente seis tablas: las tres `meta_*`, `customers`, `products` y `orders` (no hay tabla de líneas de pedido);
  - `customers`, `products` y `orders` tienen las columnas, tipos, claves primarias y foreign keys de *Data*;
  - `customers` y `products` tienen decenas de filas (entre 10 y 99 cada una) y `orders` tiene cientos (entre 100 y 999);
  - `customers.country` tiene 4 o 5 valores distintos, `customers.segment` solo toma `Consumer` o `Business`, y `products.category` tiene 3 o 4 valores distintos;
  - no hay pedidos huérfanos: `PRAGMA foreign_key_check` no devuelve filas;
  - todas las `order_date` tienen formato `YYYY-MM-DD` y caen en 2024 o 2025, y hay pedidos en cada uno de los 24 meses de esos dos años;
  - en cada pedido, `amount` es `quantity` × `unit_price` del producto, redondeado a 2 decimales;
  - `orders` tiene un índice explícito sobre `customer_id` y otro sobre `product_id` (`PRAGMA index_list` y `PRAGMA index_info`).
- [ ] Re-seedear recrea desde cero. Test sobre un archivo temporal: sembrar; agregar a mano una tabla extra, una fila extra en `meta_tables` y una fila extra en `orders`; volver a sembrar. El resultado tiene exactamente el contenido de la primera corrida: la tabla extra y las filas extra ya no están y no hay filas duplicadas.
- [ ] Si la carga falla en el medio, la transacción se revierte y `data.db` no queda con tablas a medio cargar. Test con un dataset de prueba inválido.
- [ ] Función read-only, con un `data.db` temporal sembrado: lee, pero `INSERT` y `CREATE TABLE` fallan. Con un archivo inexistente lanza un error que nombra la ruta y menciona `npm run seed`, y no crea el archivo.
- [ ] `DATA_DB_PATH` apunta a `data/data.db` en la raíz del repo, con un test como el de `APP_DB_PATH`.
- [ ] La app sigue siendo agnóstica al dominio: en `backend/src` y `frontend/src`, `customers`, `products` y `orders` aparecen solo en el archivo del demo y sus tests. Se verifica con `git grep`.
- [ ] Los tests no leen ni escriben `data/data.db`: usan bases en memoria o archivos temporales.
- [ ] No se agregan dependencias: los `package.json` de la raíz y de `backend` no suman ninguna.
- [ ] `README.md` (*Getting started*) incluye el paso `npm run seed` y dos advertencias: que correrlo de nuevo recrea `data/data.db` desde cero y borra todo lo que tenga, incluidos los datos cargados a mano, y que hay que frenar el backend antes de re-seedear. `docs/ARCHITECTURE.md` (*Data*) ya no marca *Initial data* como *(later issue)*, dice dónde vive el archivo del demo y documenta que re-seedear recrea `data.db` desde cero.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85% (líneas, sentencias, funciones y ramas), y el código nuevo queda cubierto.

## Non-functional notes
- Seguridad:
  - La conexión read-only es la barrera dura contra escrituras (`docs/ARCHITECTURE.md`). Desde el código, solo el seed escribe `data.db`.
  - `app.db` queda en otro archivo, así que nada de esto lo toca.
- Datos ficticios: el demo no tiene datos personales reales.
- Tamaño: el seed termina en segundos. Correr todo en una sola transacción también lo hace rápido.

## Assumptions
- **Re-seedear recrea `data.db` desde cero.** Decisión propuesta en el refinamiento y confirmada por el usuario el 2026-10-19 (opción A): `npm run seed` siempre rehace el archivo y borra todo, incluso los datos cargados a mano, y el README lo advierte.
- **Dataset demo tal como se propuso en *Data*.** Decisión propuesta en el refinamiento y confirmada por el usuario el 2026-10-19 (opción A): `customers`, `products` y `orders`, un producto por pedido, con los volúmenes, los años 2024 y 2025, los montos en USD y los valores en inglés de *Data*.
- **Demo de 3 tablas, sin líneas de pedido.** Fuente: `docs/ARCHITECTURE.md`, *Initial data* ("sales: customers, products, orders"). Agregar más tablas inflaría el alcance.
- **Propiedades del demo**: columnas categóricas (país, segmento, categoría), montos, y fechas fijas que cubren dos años completos. Fuente: el pipeline de `docs/ARCHITECTURE.md`, que el demo tiene que poder ejercitar:
  - los gráficos bar/line/pie/doughnut (#9) necesitan categorías y una serie temporal;
  - el ejemplo multi-turn "and for last year?" (#11) necesita más de un año de datos;
  - las fechas fijas hacen que los tests sean determinísticos.
- **Índices explícitos en `orders`.** Fuente: el comentario del usuario en #5, que pide que el catálogo muestre los índices. Sin índices explícitos, el demo no tendría ninguno que mostrar.
- **Restricciones de las tablas `meta_*`: `TEXT NOT NULL`, claves primarias y ninguna foreign key.** Fuente: `docs/ARCHITECTURE.md` define las columnas y la regla "a table without a `meta_tables` row doesn't exist as far as the bot is concerned".
  - Sin foreign keys, ocultar una tabla es borrar una sola fila.
  - Las claves primarias evitan dos descripciones distintas para la misma tabla o columna.
  - Con `NOT NULL`, #5 y #7 siempre reciben strings.
  - Las tablas tienen `rowid` y el demo carga `meta_columns` en el orden de las columnas, porque #5 muestra columnas y relaciones en orden de carga. `docs/ARCHITECTURE.md` no define una columna de posición.
- **`data_type` es el tipo declarado y la semántica va en `description`.** Fuente: `docs/ARCHITECTURE.md`, donde `description` lleva "meaning, units, how to aggregate".
- **Nombres, descripciones y valores en inglés.** Fuente: `workflow/rules.md`, regla 8 (el código y sus identificadores van en inglés).
- **`DATA_DB_PATH` y la apertura read-only viven en este issue.** Fuente: el contexto original de este issue ("La app abre `data.db` con una conexión read-only; solo el seed escribe") y `docs/ARCHITECTURE.md` (rutas fijas, conexión read-only). #5 y #6 los reutilizan; si la apertura vive acá, ninguno de los dos la duplica.
- **Una función genérica crea las tablas de metadatos.** Fuente: el contexto original de este issue ("el código no debe depender de él"). Con ella, los tests de otros issues arman sus fixtures sin usar el demo.
- **El entry point del seed queda fuera de coverage.** Fuente: `docs/ARCHITECTURE.md`, *Quality gate* ("scripts that just call tested functions").
- **La carga corre en una sola transacción.** Fuente: un hecho técnico de SQLite. Es la forma estándar de hacer una carga masiva rápida y atómica, y no cuesta nada.

## Deferred decisions
- **Validar los metadatos cargados a mano** (que apunten a tablas y columnas reales): no se hace ahora. Recién hace falta cuando se carguen datos reales, y la consistencia del demo ya la cubren sus tests.
- **Conservar datos cargados a mano al re-seedear** (fallar si el archivo existe, o reemplazar solo lo del demo): no se hace. Cargar datos reales a mano es un flujo posterior, y en un POC de un solo usuario alcanza con la advertencia del README.
- **Un modo "solo metadatos" del seed**, para arrancar con datos reales: no hace falta. Según `docs/ARCHITECTURE.md`, reemplazar el demo es editar su archivo.
- **Una tabla "oculta" en el demo** (sin fila en `meta_tables`), para mostrar que el bot no la ve: no se agrega. Los tests de #5 y #7 lo cubren con sus propios fixtures.
