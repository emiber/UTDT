---
id: 34
title: Sumar objetivos mensuales para comparar las ventas contra la meta
type: feat
status: closed
parent: 32
created: 2026-10-23
---

## Goal
Que el bot compare lo vendido contra una meta ("¿Llegamos al objetivo de marzo?", "¿Qué categorías quedaron por debajo de la meta en 2025?"), como en un tablero de BI. Es para quien muestra la demo. Hoy no hay metas en el dataset.

## Scope
- In:
  - Una tabla `sales_targets` con un objetivo de ventas en USD por mes y por categoría de producto, de 2024-01 a 2025-12 (ver *Data*).
  - Sus valores, armados con una fórmula fija alrededor de lo vendido, para que unas veces se cumplan y otras no.
  - Sus metadatos: la tabla y sus columnas, con cómo se cruzan con `orders` y `products`.
  - Tests en `demo-dataset.test.ts`, 2 casos en el golden y las docs del dataset (`README.md` y `docs/ARCHITECTURE.md`).
- NOT in:
  - Objetivos de unidades, por país o por cliente.
  - Objetivos de meses sin pedidos (2026 en adelante).
  - Una tabla de categorías: la categoría sigue siendo el texto de `products.category`.

## Expected behavior
- **El cruce:** el objetivo de un mes y una categoría se compara con la suma de `orders.amount` de los pedidos de ese mes cuyos productos son de esa categoría. El objetivo total de un mes es la suma de sus 4 categorías.
- **Cumplimiento variado:**
  - Unos meses y categorías superan la meta y otros quedan por debajo.
  - Al menos una categoría queda por debajo de su meta en la mayoría de los meses de 2025.
  - El objetivo total de 2025 de al menos una categoría queda sin cumplir, y el de al menos otra se cumple.

  Así las preguntas de cumplimiento tienen respuestas variadas.
- **Edge case:** si una categoría no vendió nada en un mes, igual tiene un objetivo mayor que 0 ese mes.
- Las preguntas de ventas que ya existen se responden igual que hoy.

## Data
- **Tabla:**
  ```sql
  CREATE TABLE sales_targets (
    month TEXT NOT NULL,          -- 'YYYY-MM'
    category TEXT NOT NULL,       -- one of products.category
    target_amount REAL NOT NULL,  -- USD
    PRIMARY KEY (month, category)
  );
  ```
  Son 96 filas: 24 meses × 4 categorías. Las categorías son las mismas de `products`. No hay foreign key, porque la categoría no es una tabla, así que `meta_relationships` no cambia.
- **Valores:** lo vendido en ese mes y esa categoría (o un piso, si fue 0), por un factor fijo de entre 0,85 y 1,15 que varía por mes y categoría. Se redondean a un número redondo (por ejemplo, a la decena), para que parezcan metas.
- **Metadatos:**
  - tabla: el objetivo de ventas mensual por categoría, en USD, de 2024–2025, para comparar con la suma de `orders.amount`;
  - `month`: un texto `YYYY-MM`, igual a `strftime('%Y-%m', orders.order_date)`;
  - `category`: igual a `products.category`;
  - `target_amount`: el objetivo en USD de ese mes y esa categoría; el del mes completo es la suma de las categorías.
- **Golden:** 2 casos nuevos, sin historial:

  | id | Pregunta |
  |---|---|
  | `target-march-2025` | "¿Llegamos al objetivo de ventas en marzo de 2025?" |
  | `categories-below-target-2025` | "Which categories missed their total sales target for 2025?" |

- Se persiste en `data/data.db` al correr `npm run seed`.

## Dependencies
- Segundo hijo del epic #32, después de #33.
- Externo: OpenAI para la corrida real del eval.

## Acceptance criteria
- [ ] `sales_targets` existe con `month`, `category` y `target_amount`, y la clave primaria `(month, category)`. Tiene 96 filas, una por cada mes de 2024-01 a 2025-12 y cada categoría de `products`, todas con un objetivo mayor que 0.
- [ ] Tests de los invariantes de *Expected behavior*: hay meses y categorías por encima y por debajo de la meta, una categoría falla la mayoría de los meses de 2025, y en 2025 hay al menos una categoría que cumple su total y otra que no.
- [ ] Los metadatos describen la tabla y sus 3 columnas, con el cruce por mes y categoría. Los tests de consistencia de los metadatos pasan.
- [ ] El test que fija la lista de tablas incluye `sales_targets`. Las tablas y los pedidos que ya existían no cambian.
- [ ] Los 2 casos de *Data* están en el golden.
- [ ] Una corrida real de `npm run eval` en Verification: los 2 casos nuevos dan respuesta, con sus puntajes. El SQL y la narrativa de los casos de antes siguen en el rango de las corridas anteriores.
- [ ] `README.md` y `docs/ARCHITECTURE.md` describen los objetivos en el dataset demo.
- [ ] El quality gate pasa.

## Non-functional notes
- **Costo del eval:** los 2 casos suman unas 10 llamadas por corrida.
- **Re-seed:** para la corrida real hay que regenerar `data/data.db`, con el backend parado (ver #32).

## Assumptions
Confirmadas en el refinamiento (2026-10-23):
- Un objetivo por mes y por categoría.
- Solo de ventas en USD.
- Armados por fórmula alrededor de lo vendido, con cumplimiento variado y al menos una categoría que falla la mayoría de 2025.
- 2 casos en el golden, uno en español y uno en inglés.

Propuestas al escribir el issue, sin una pregunta aparte:
- El nombre `sales_targets` y sus columnas `month` (texto `YYYY-MM`), `category` y `target_amount`.
- El factor de entre 0,85 y 1,15, el redondeo a un número redondo, y el piso para un mes sin ventas.
- Sin foreign key ni fila en `meta_relationships`: el cruce se explica en las descripciones de las columnas.
- La pregunta del golden en inglés pide el total del año ("total sales target for 2025"), para que no sea ambigua entre el total y la cuenta de meses.

## Deferred decisions
- **Objetivos de unidades o por país.** Se suman si la demo los pide.
- **Una tabla de categorías** con su foreign key. Hoy la categoría es un texto en `products`, y no hace falta cambiarlo.

## Notes
- 2026-10-23: en la corrida real, la narrativa de `separate-lists` dio 0,19, fuera del rango de las corridas anteriores (de 0,85 a 1,85).
  - Las mismas respuestas se volvieron a juzgar con el esquema de antes (sin `sales_targets`) y con el nuevo. `separate-lists` pasó de 0,83 a 0,19 y `top-products-after-spanish` de 1,94 a 1,50 de narrativa. El SQL de `as-pie-chart` pasó de 1,30 a 1,77. Las otras 10 respuestas se movieron 0,06 o menos.
  - Las respuestas son correctas: lo que baja el puntaje es el esquema más largo que el judge ve en su input.
  - El usuario decidió cerrar #34 con el criterio "la narrativa de los casos de antes sigue en su rango" sin cumplirse por `separate-lists`. Se abre un follow-up, hijo de #32, para hacer al judge menos sensible al esquema antes de #35.
- 2026-10-23: en la misma corrida, `capital-of-france-after-spanish` respondió en español (idioma 0,00): es el bug de #22. Repetido 10 veces, 5 con cada esquema, salió en inglés las 10. El usuario decidió abrir un issue aparte, fuera del epic.

## Pull request
Branch: `feat/34-objetivos-mensuales` → `epic/32-ampliar-el-dataset-demo`

### Qué hace
- **Dataset** (`backend/src/demo-dataset.ts`): una tabla `sales_targets` (`month`, `category`, `target_amount`, con la clave primaria `(month, category)`). Tiene 96 filas, una por cada mes de 2024-01 a 2025-12 y cada categoría.
- **La fórmula** (`generateTargets`): el objetivo es lo vendido ese mes en esa categoría por un factor, redondeado a la decena y nunca menor que 10.
  - El factor es la base de la categoría más una variación fija de ±0,06 por mes y categoría, y queda entre 0,91 y 1,11.
  - La base de Furniture es 1,05; las otras van de 0,97 a 0,99.
  - Resultado: 50 celdas cumplidas y 46 falladas. En 2025, Furniture falla 11 de 12 meses y su total por 4,8%, y las otras tres cumplen el total, por entre 0,7% y 2,9%. Marzo de 2025 se cumple en total (13.274,49 contra 12.960).
- **Metadatos:** la tabla y sus 3 columnas, con el cruce por `strftime('%Y-%m', orders.order_date)` y por `products.category`. No hay foreign key, porque la categoría no es una tabla, así que `meta_relationships` no cambia.
- **Tests** (`demo-dataset.test.ts`):
  - la tabla en la lista y en la estructura;
  - un objetivo mayor que 0 y múltiplo de 10 por cada mes y categoría;
  - celdas por encima y por debajo de la meta, una categoría que falla más de 6 meses de 2025, y en 2025 una categoría que cumple su total y otra que no.
- **Golden:** `target-march-2025` y `categories-below-target-2025`. Pasa de 19 a 21 casos.
- **Docs:** la descripción del dataset demo en `README.md` y `docs/ARCHITECTURE.md`.

### Hallazgos de la verificación
- **El judge cambia sus puntajes con el esquema** (ver *Notes*). Las mismas respuestas de la corrida, juzgadas con el esquema sin `sales_targets` y con el nuevo:

  | Caso | Sin `sales_targets` | Con `sales_targets` |
  |---|---|---|
  | `separate-lists`, narrativa | 0,83 | 0,19 |
  | `top-products-after-spanish`, narrativa | 1,94 | 1,50 |
  | `as-pie-chart`, SQL | 1,30 | 1,77 |
  | `chart-not-shown`, SQL | 1,37 | 1,24 |
  | Las otras 10 | — | ±0,06 o menos |

- **El bug de #22 vuelve a veces.** `capital-of-france-after-spanish` respondió en español en la corrida, y el criterio de idioma lo marcó con 0,00. Repetido 10 veces, 5 con cada esquema, salió en inglés las 10. No es de este cambio: el pipeline no cambió, y con el esquema de antes tampoco falló en esas repeticiones.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (33 archivos, 633 tests; antes 627). Se corrió sobre el último commit (`5e9b70e`), después de reiniciar la PC. Antes fallaron 3 corridas con "Timeout waiting for worker to respond", con la máquina cargada por procesos de otro proyecto. Es el corte de workers descrito en `docs/ARCHITECTURE.md` (Quality gate).
- Coverage: 99,74% de statements, 97,41% de branches, 99,61% de funciones y 100% de líneas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno.
  - `demo-dataset.ts` tiene 87,5% de branches. La rama sin cubrir (línea 139) es la de un mes sin ventas, el edge case que pide el issue: los datos fijos no tienen ninguno, así que ningún test la puede recorrer.
- Criterios de aceptación (con los cambios de *Notes*):
  - **`sales_targets` con sus columnas, la clave `(month, category)` y 96 filas mayores que 0: pass** (tests).
  - **Los invariantes de *Expected behavior*: pass** (tests).
  - **Metadatos de la tabla y sus 3 columnas, con el cruce: pass**, y los tests de consistencia pasan.
  - **La lista de tablas con `sales_targets`, y lo de antes sin cambios: pass.** La self-review comprobó que `customers`, `products` y los pedidos no cambian.
  - **Los 2 casos en el golden: pass.**
  - **Corrida real: los 2 casos nuevos responden, con sus puntajes: pass. El SQL y la narrativa de los casos de antes en su rango: no se cumple por `separate-lists` (0,19), aceptado por el usuario** (ver *Notes* y *Hallazgos*).
  - **`README.md` y `docs/ARCHITECTURE.md`: pass.**
  - **Quality gate: pass.**
- `npm run seed` y `npm run eval` reales (2026-10-23, pipeline `gpt-5.4-mini`, judge `gpt-6-luna`), 21 casos, salida 0:
  ```
  sales-by-month-2025: classification ok | sql 2.00/2 | narrative 1.74/2 | chart 0.99 | language 1.00
  revenue-by-country: classification ok | sql 1.98/2 | narrative 2.00/2 | chart 0.98 | language 1.00
  top-products-by-units: classification ok | sql 2.00/2 | narrative 2.00/2 | chart 1.00 | language 1.00
  category-share: classification ok | sql 1.98/2 | narrative 2.00/2 | chart 1.00 | language 1.00
  customer-count: classification ok | sql 2.00/2 | narrative 2.00/2 | chart n/a | language 1.00
  average-order-by-segment: classification ok | sql 1.98/2 | narrative 2.00/2 | chart 1.00 | language 1.00
  orders-2024: classification ok | sql 2.00/2 | narrative 2.00/2 | chart n/a | language 1.00
  separate-lists: classification ok | sql 1.99/2 | narrative 0.19/2 | chart 0.96 | language 0.97
  greeting: classification ok | language 1.00
  capital-of-france: classification ok | language 1.00
  how-are-we-doing: classification ok | language 1.00
  chart-not-shown: classification ok | sql 1.24/2 | narrative 1.94/2 | chart 0.99 | language 1.00
  as-pie-chart: classification ok | sql 1.77/2 | narrative 2.00/2 | chart 0.99 | language 0.92
  and-in-2024: classification ok | sql 1.92/2 | narrative 1.99/2 | chart 0.98 | language 0.98
  thanks-after-answer: classification ok | language 1.00
  capital-of-france-after-spanish: classification ok | language 0.00
  top-products-after-spanish: classification ok | sql 1.95/2 | narrative 1.50/2 | chart 1.00 | language 1.00
  margin-share-by-category: classification ok | sql 1.98/2 | narrative 1.91/2 | chart n/a | language 0.75
  margin-by-country-2025: classification ok | sql 2.00/2 | narrative 1.94/2 | chart 0.98 | language 1.00
  target-march-2025: classification ok | sql 1.92/2 | narrative 2.00/2 | chart n/a | language 1.00
  categories-below-target-2025: classification ok | sql 1.97/2 | narrative 2.00/2 | chart n/a | language 1.00
  Summary: 21 questions, 16 answered, 0 without an answer, 5 with another label, 0 errors
    The SQL answers the question: 1.92/2 (16 judged, 0 refused, 0 not applicable)
    The narrative is faithful to the data: 1.83/2 (16 judged, 0 refused, 0 not applicable)
    The chart fits: 0.99 average probability (11 judged, 0 refused, 5 not applicable)
    The answer is in the language of the message: 0.93 average probability (21 judged, 0 refused, 0 not applicable)
    Classification: 21/21 correct (0 without a label)
  ```
  - **Los 2 casos nuevos responden bien.**
    - `target-march-2025`: "Sí, se alcanzó el objetivo de ventas en marzo de 2025. Las ventas fueron 13,274.49 frente a un objetivo de 12,960".
    - `categories-below-target-2025`: "Only Furniture missed its 2025 total sales target … 30,831.3 against a target of 32,390".
    - Las dos coinciden con los datos.
  - `margin-share-by-category` dio 0,75 de idioma. Su respuesta está en español, como la pregunta: "La categoría con el mayor margen porcentual es Office Supplies, con un 63.43%".
- Self-review: 1 ronda con un agente nuevo (separado), sin bloqueantes.
  - **Aplicadas:** el chequeo de múltiplo de 10 ya no deja pasar un objetivo con decimales (el `%` de SQLite convierte a entero), y se sacó un `sort` que sobraba.
  - **Anotada:** crear y listar los dos follow-ups (abajo).
- Plan: aprobado por el usuario ("si", 2026-10-23). Después, el usuario decidió cerrar con el criterio de la narrativa sin cumplirse y abrir los dos follow-ups (ver *Notes*).
- Security: no se tocó superficie de seguridad. Son datos del seed, tests, el golden y docs. No hay secretos en el diff.
- Docs: updated `README.md` y `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
- #36: que los puntajes del judge no cambien al sumar tablas al esquema. Es hijo de #32, para antes de #35.
- #37: que el bot responda siempre en el idioma del mensaje después de turnos en otro idioma, porque el bug de #22 vuelve a veces. Es un issue suelto.
