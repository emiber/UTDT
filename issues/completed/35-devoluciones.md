---
id: 35
title: Sumar devoluciones para preguntar por la tasa de devolución
type: feat
status: closed
parent: 32
created: 2026-10-23
---

## Goal
Que el bot responda por devoluciones ("Tasa de devolución por producto", "¿Qué categoría se devuelve más?", "¿Cuál es el motivo de devolución más común?"). Es para quien muestra la demo. Hoy el dataset no tiene devoluciones.

## Scope
- In:
  - Una tabla `returns`, con a lo sumo una devolución por pedido, ligada a `orders` con una foreign key (ver *Data*).
  - Sus filas, armadas con una fórmula fija a partir de los pedidos, con un motivo de una lista fija.
  - Sus metadatos: la tabla, sus columnas y la relación con `orders`.
  - Tests en `demo-dataset.test.ts`, 2 casos en el golden y las docs del dataset (`README.md` y `docs/ARCHITECTURE.md`).
- NOT in:
  - Restar las devoluciones de las ventas por defecto: las ventas siguen siendo brutas.
  - Cambiar `orders`: ni sus columnas, ni sus filas, ni la descripción de `amount`.
  - Más de una devolución por pedido, o devoluciones de pedidos que no existen.

## Expected behavior
- **Las ventas siguen brutas:** `orders.amount` no cambia, y "ventas" sigue siendo lo pedido. Las devoluciones van aparte, y se restan solo cuando la pregunta pide ventas netas. La descripción de `returns.refund_amount` lo dice. Las respuestas de hoy y los historiales del golden no cambian.
- **Devoluciones coherentes con los pedidos:**
  - cada una es de un pedido que existe, con a lo sumo una por pedido;
  - la cantidad devuelta va de 1 a la cantidad pedida;
  - la fecha es posterior a la del pedido y no pasa de 2025-12-31;
  - el monto devuelto es la cantidad devuelta por el precio unitario del producto, con 2 decimales.
- **Una respuesta clara:** Electronics es la categoría con más devoluciones, tanto en unidades devueltas sobre vendidas como en pedidos devueltos sobre pedidos. Así "¿qué categoría se devuelve más?" tiene una sola respuesta, se mida como se mida. Office Supplies es la que menos se devuelve.
- **El volumen:** se devuelve entre el 5% y el 15% de los pedidos.
- **Edge case:** un pedido de fines de diciembre de 2025 cuya devolución caería en 2026 no tiene devolución.

## Data
- **Tabla:**
  ```sql
  CREATE TABLE returns (
    return_id INTEGER PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders (order_id),
    return_date TEXT NOT NULL,      -- ISO date, after the order's date
    quantity INTEGER NOT NULL,      -- units returned, 1 to the units ordered
    refund_amount REAL NOT NULL,    -- USD: quantity × unit price
    reason TEXT NOT NULL            -- one of a fixed list
  );
  CREATE INDEX idx_returns_order_id ON returns (order_id);
  ```
- **Motivos**, en inglés como los demás valores del dataset: `Defective`, `Wrong item`, `No longer needed` y `Damaged in shipping`. Todos aparecen, y uno es claramente el más común.
- **La fecha:** entre 3 y 30 días después del pedido, con la fórmula.
- **Metadatos:**
  - la tabla: una fila por devolución, de todo o parte de un pedido;
  - una descripción por columna, con la lista de motivos en `reason`;
  - en `refund_amount`, que `orders.amount` no lo resta (las ventas son brutas) y que se resta solo para las ventas netas;
  - la relación `returns.order_id` → `orders.order_id` en `meta_relationships`.
- **Golden:** 2 casos nuevos, sin historial:

  | id | Pregunta |
  |---|---|
  | `return-rate-by-category` | "¿Qué categoría tiene la mayor tasa de devolución?" |
  | `most-common-return-reason` | "What is the most common return reason?" |

- Se persiste en `data/data.db` al correr `npm run seed`.

## Dependencies
- Tercer hijo del epic #32, después de #34.
- Externo: OpenAI para la corrida real del eval.

## Acceptance criteria
- [ ] `returns` existe con las columnas de *Data*, la foreign key a `orders` y el índice por `order_id`.
- [ ] Tests de los invariantes de *Expected behavior*:
  - [ ] ningún huérfano y a lo sumo una devolución por pedido;
  - [ ] la cantidad va de 1 a la pedida, y la fecha es posterior al pedido y no pasa de 2025-12-31;
  - [ ] el monto es la cantidad por el precio, y el motivo está en la lista;
  - [ ] entre el 5% y el 15% de los pedidos;
  - [ ] Electronics tiene la mayor tasa de devolución medida de las dos formas, y Office Supplies la menor;
  - [ ] hay un único motivo más común.
- [ ] Los metadatos describen la tabla, sus 6 columnas y la relación con `orders`, y dicen que las ventas son brutas. Los tests de consistencia de los metadatos pasan, con la foreign key nueva.
- [ ] Los tests que fijan la lista de tablas y los índices incluyen `returns`. `orders` y sus filas no cambian.
- [ ] Los 2 casos de *Data* están en el golden.
- [ ] Una corrida real de `npm run eval` en Verification:
  - [ ] los 2 casos nuevos dan respuesta, con sus puntajes;
  - [ ] el SQL y la narrativa de los casos de antes siguen en el rango de las corridas anteriores;
  - [ ] ninguna pregunta de ventas de antes resta las devoluciones.
- [ ] `README.md` y `docs/ARCHITECTURE.md` describen las devoluciones en el dataset demo, y que las ventas son brutas.
- [ ] El quality gate pasa.

## Non-functional notes
- **Costo del eval:** los 2 casos suman unas 10 llamadas por corrida.
- **Re-seed:** para la corrida real hay que regenerar `data/data.db`, con el backend parado (ver #32).
- **Riesgo:** con una tabla de devoluciones en el esquema, el bot podría empezar a restarlas en preguntas de ventas de antes. La descripción dice que las ventas son brutas, y la corrida real lo controla.

## Assumptions
Confirmadas en el refinamiento (2026-10-23):
- Las ventas siguen brutas. Las devoluciones se restan solo si se piden ventas netas.
- La devolución tiene un motivo de una lista fija.
- 2 casos en el golden, uno en español y uno en inglés.

Propuestas al escribir el issue, sin una pregunta aparte:
- El nombre `returns` y sus columnas, con a lo sumo una devolución por pedido y devoluciones parciales.
- Los 4 motivos, en inglés.
- La fecha entre 3 y 30 días después del pedido, sin pasar de 2025-12-31.
- Electronics como la categoría que más se devuelve y Office Supplies como la que menos, medidas de las dos formas, para que la pregunta del golden no dependa de cómo se mida la tasa.
- Entre el 5% y el 15% de los pedidos devueltos.
- Un índice por `order_id`, como los que tiene `orders` por sus foreign keys.

## Deferred decisions
- **Ventas netas por defecto.** Cambiaría las respuestas de hoy y el golden.
- **Varias devoluciones por pedido.** Hoy alcanza con una.

## Notes
- 2026-10-24: en la corrida real, la narrativa de `revenue-by-country` dio 1,60, por debajo de lo que suele dar (de 1,95 a 2,00). Sus cifras son correctas; no nombra a Alemania. No es por la tabla nueva: desde #36 la narrativa se juzga sin el esquema, así que una tabla no la puede mover. El usuario delegó las decisiones para terminar rápido ("Hacé lo que creas para terminar lo antes posible"), y se acepta como variación de la respuesta, sin cumplir al pie de la letra "la narrativa de los casos de antes sigue en su rango".

## Pull request
Branch: `feat/35-devoluciones` → `epic/32-ampliar-el-dataset-demo`

### Qué hace
- **Dataset** (`backend/src/demo-dataset.ts`): una tabla `returns` (`return_id`, `order_id`, `return_date`, `quantity`, `refund_amount`, `reason`), con su foreign key a `orders` y un índice por `order_id`.
- **La fórmula** (`generateReturns`), fija, sobre cada pedido:
  - se devuelve si `(id × 7 + producto × 3) mod 20` queda bajo la cuota de su categoría: 4 de 20 en Electronics, 2 en Accessories y Furniture, 1 en Office Supplies;
  - la cantidad es `(id × 3) mod pedida + 1`, así que hay devoluciones parciales y totales (22 y 13);
  - la fecha va de 3 a 30 días después del pedido, y un pedido cuya devolución caería en 2026 no la tiene (pasa con los pedidos 278 y 279);
  - el motivo sale de una lista por `id mod 10`, y el reembolso es la cantidad por el precio.

  | Categoría | Pedidos devueltos | Unidades devueltas |
  |---|---|---|
  | Electronics | 20,0% (15/75) | 11,6% |
  | Furniture | 13,2% | 8,9% |
  | Accessories | 10,7% | 7,4% |
  | Office Supplies | 5,5% (4/73) | 2,6% |
  | **Total** | **12,5%** (35/280) | |

  Los motivos: `Defective` 19, `No longer needed` 6, `Damaged in shipping` 6, `Wrong item` 4.
- **Metadatos:** la tabla, sus 6 columnas y la relación con `orders`. La tabla y `refund_amount` dicen que las ventas son brutas y que el reembolso se resta solo para las ventas netas. `orders` no cambia.
- **Tests** (`demo-dataset.test.ts`):
  - la tabla en la lista, en la estructura, en las foreign keys y en los índices;
  - un test por cada invariante de *Expected behavior*.
- **Golden:** `return-rate-by-category` y `most-common-return-reason`. Pasa de 21 a 23 casos, lo que pedía el epic.
- **Docs:** las devoluciones y las ventas brutas en `README.md` y `docs/ARCHITECTURE.md`.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (33 archivos, 645 tests; antes 636). La primera corrida cortó con "Timeout waiting for worker to respond", el corte de workers descrito en `docs/ARCHITECTURE.md` (Quality gate), con la self-review corriendo a la vez; la siguiente pasó completa. El último commit (`c2dcd58`) cambia una línea de `docs/ARCHITECTURE.md`, que Prettier no revisa y los tests no leen.
- Coverage: 99,75% de statements, 97,42% de branches, 99,62% de funciones y 100% de líneas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno.
- Criterios de aceptación (con los cambios de *Notes*):
  - **`returns` con sus columnas, la foreign key y el índice: pass** (tests).
  - **Los invariantes de *Expected behavior*: pass** (tests). La self-review confirmó que el corte de 2025 de verdad se aplica, a los pedidos 278 y 279.
  - **Metadatos de la tabla, sus columnas y la relación, con las ventas brutas: pass.**
  - **La lista de tablas y los índices con `returns`, y `orders` sin cambios: pass.**
  - **Los 2 casos en el golden: pass.**
  - **Corrida real:**
    - los 2 casos nuevos responden, con sus puntajes: pass;
    - ninguna pregunta de ventas de antes resta las devoluciones: pass. Solo el SQL de los 2 casos nuevos lee `returns`;
    - el SQL y la narrativa de los casos de antes en su rango: **no se cumple al pie de la letra**. La narrativa de `revenue-by-country` dio 1,60, contra 1,95 a 2,00 en las corridas anteriores. Se aceptó con la delegación del usuario: ver *Notes*, y abajo.
  - **`README.md` y `docs/ARCHITECTURE.md`: pass.**
  - **Quality gate: pass.**
- `npm run seed` y `npm run eval` reales (2026-10-24, pipeline `gpt-5.4-mini`, judge `gpt-6-luna`), 23 casos, salida 0:
  ```
  sales-by-month-2025: classification ok | sql 2.00/2 | narrative 1.31/2 | chart 0.99 | language 1.00
  revenue-by-country: classification ok | sql 1.98/2 | narrative 1.60/2 | chart 1.00 | language 1.00
  top-products-by-units: classification ok | sql 2.00/2 | narrative 2.00/2 | chart 1.00 | language 1.00
  category-share: classification ok | sql 1.98/2 | narrative 2.00/2 | chart 0.95 | language 1.00
  customer-count: classification ok | sql 2.00/2 | narrative 1.98/2 | chart n/a | language 1.00
  average-order-by-segment: classification ok | sql 1.97/2 | narrative 2.00/2 | chart 0.98 | language 1.00
  orders-2024: classification ok | sql 2.00/2 | narrative 1.98/2 | chart n/a | language 1.00
  separate-lists: classification ok | sql 1.99/2 | narrative 1.98/2 | chart 1.00 | language 1.00
  greeting: classification ok | language 1.00
  capital-of-france: classification ok | language 1.00
  how-are-we-doing: classification ok | language 1.00
  chart-not-shown: classification ok | sql 1.26/2 | narrative 2.00/2 | chart 0.94 | language 1.00
  as-pie-chart: classification ok | sql 1.64/2 | narrative 2.00/2 | chart 0.99 | language 0.93
  and-in-2024: classification ok | sql 1.88/2 | narrative 1.99/2 | chart 1.00 | language 0.98
  thanks-after-answer: classification ok | language 1.00
  capital-of-france-after-spanish: classification ok | language 1.00
  top-products-after-spanish: classification ok | sql 1.95/2 | narrative 2.00/2 | chart 0.97 | language 1.00
  margin-share-by-category: classification ok | sql 1.97/2 | narrative 2.00/2 | chart n/a | language 0.64
  margin-by-country-2025: classification ok | sql 2.00/2 | narrative 2.00/2 | chart 0.95 | language 1.00
  target-march-2025: classification ok | sql 1.98/2 | narrative 2.00/2 | chart n/a | language 1.00
  categories-below-target-2025: classification ok | sql 1.90/2 | narrative 2.00/2 | chart 0.94 | language 1.00
  return-rate-by-category: classification ok | sql 1.88/2 | narrative 2.00/2 | chart n/a | language 0.93
  most-common-return-reason: classification ok | sql 2.00/2 | narrative 2.00/2 | chart n/a | language 1.00
  Summary: 23 questions, 18 answered, 0 without an answer, 5 with another label, 0 errors
    The SQL answers the question: 1.91/2 (18 judged, 0 refused, 0 not applicable)
    The narrative is faithful to the data: 1.94/2 (18 judged, 0 refused, 0 not applicable)
    The chart fits: 0.98 average probability (12 judged, 0 refused, 6 not applicable)
    The answer is in the language of the message: 0.98 average probability (23 judged, 0 refused, 0 not applicable)
    Classification: 23/23 correct (0 without a label)
  ```
  - **Los 2 casos nuevos responden bien y coinciden con los datos.**
    - `return-rate-by-category`: Electronics, con 25 unidades devueltas sobre 216 (11,57%).
    - `most-common-return-reason`: `Defective`, con 19.
  - **`revenue-by-country`, 1,60 de narrativa:** todas sus cifras son correctas, y no nombra a Alemania. No es por la tabla nueva: desde #36 la narrativa se juzga sin el esquema, así que una tabla no la puede mover. Es una respuesta nueva del pipeline.
  - **`sales-by-month-2025`, 1,31 de narrativa:** dice otra vez que el primer trimestre fue fuerte, con febrero bajo. Está dentro de lo visto (0,30 en la corrida de #36).
  - **`margin-share-by-category`, 0,64 de idioma:** es el falso negativo que va a #38.
- Self-review: 1 ronda con un agente nuevo (separado), sin bloqueantes. Se le pidió no correr tests, para no chocar con el gate.
  - **Aplicada:** "about 12%" en las docs, para que el número no quede viejo.
  - **Hecha en esta sección:** dejar dicho que el criterio de la narrativa se cumple con una excepción. La self-review marcó que esa excepción se apoya en la delegación general del usuario, no en una aprobación de este caso puntual.
  - **No aplicadas:** un test de la ventana de 3 a 30 días (el criterio pide "posterior al pedido", y los datos la cumplen), y uno del texto de "ventas brutas" (frágil; la corrida real es el control).
- Plan: aprobado con la delegación del usuario ("Hacé lo que creas para terminar lo antes posible", 2026-10-24).
- Security: no se tocó superficie de seguridad. Son datos del seed, tests, el golden y docs. No hay secretos en el diff.
- Docs: updated `README.md` y `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
- #38: el criterio de idioma da falsos negativos en respuestas cortas con nombres en inglés. Es un follow-up de #36, suelto.
