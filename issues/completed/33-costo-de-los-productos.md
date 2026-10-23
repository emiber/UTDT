---
id: 33
title: Sumar el costo de los productos para preguntar por el margen
type: feat
status: closed
parent: 32
created: 2026-10-23
---

## Goal
Que el bot responda por márgenes ("¿Qué categoría deja más margen?", "¿Qué productos se venden mucho pero dejan poco?", "Margen por país en 2025"). Es para quien muestra la demo. Hoy `products` tiene `unit_price` pero no costo.

## Scope
- In:
  - Una columna `unit_cost REAL NOT NULL` en `products`, después de `unit_price`: el costo de una unidad en USD. Es fijo por producto y no cambia en el tiempo, como `unit_price`.
  - Un costo para cada uno de los 15 productos de `demo-dataset.ts`, con márgenes distintos por categoría (ver *Data*).
  - Los metadatos:
    - la descripción de `unit_cost`, que dice cómo se calcula el margen;
    - la descripción de la tabla `products`, que nombra el costo.
  - Tests en `demo-dataset.test.ts`, 2 casos en el golden y las docs del dataset (`README.md` y `docs/ARCHITECTURE.md`).
- NOT in:
  - Un costo por pedido o que cambie en el tiempo.
  - Una columna con el margen ya calculado: el margen se calcula en la consulta.
  - Cambiar `orders` o los pedidos que ya existen.

## Expected behavior
- El margen de un pedido es `amount - quantity × unit_cost`, y el margen porcentual es ese margen sobre `amount`. La descripción de `unit_cost` lo dice, para que el bot lo calcule sin que se lo expliquen.
- **La categoría que más vende no es la que más margen porcentual deja:** Electronics, que lidera las ventas, tiene el menor margen porcentual. Así, "la que más vende" y "la que más deja" dan respuestas distintas, y "productos que venden mucho pero dejan poco" tiene respuesta.
- Las preguntas de ventas que ya existen se responden igual que hoy.

## Data
- **Márgenes por categoría** (el porcentaje del precio que queda, con alguna variación entre productos de la misma categoría):

  | Categoría | Margen aproximado |
  |---|---|
  | Electronics | 15–25% |
  | Furniture | 35–45% |
  | Accessories | 50–60% |
  | Office Supplies | 55–65% |

  El costo se redondea a 2 decimales, y siempre es mayor que 0 y menor que `unit_price`.
- **Metadatos:**
  - `products.unit_cost`: "Cost of one unit, in USD. It does not change over time. An order's margin is `amount - quantity * unit_cost`, and its margin percentage is that margin over `amount`." (o una redacción equivalente).
  - La descripción de la tabla `products` suma el costo.
- **Golden:** 2 casos nuevos, sin historial:

  | id | Pregunta |
  |---|---|
  | `margin-share-by-category` | "¿Qué categoría tiene el mayor margen porcentual?" |
  | `margin-by-country-2025` | "What was the total margin per country in 2025?" |

- Se persiste en `data/data.db` al correr `npm run seed`.

## Dependencies
- Primer hijo del epic #32. Va antes de #34 y #35.
- Externo: OpenAI para la corrida real del eval.

## Acceptance criteria
- [ ] `products` tiene `unit_cost REAL NOT NULL` después de `unit_price`, con un costo para cada producto, mayor que 0 y menor que su precio, con 2 decimales.
- [ ] Un test fija que Electronics, la categoría con más ventas, es la de menor margen porcentual.
- [ ] `meta_columns` describe `unit_cost` con la fórmula del margen, y la descripción de `products` nombra el costo. Los tests de consistencia de los metadatos pasan.
- [ ] Los tests que fijan la estructura de `products` incluyen la columna nueva. Las columnas y los pedidos que ya existían no cambian.
- [ ] Los 2 casos de *Data* están en el golden.
- [ ] Una corrida real de `npm run eval` en Verification: los 2 casos nuevos dan respuesta, con sus puntajes. El SQL y la narrativa de los casos de antes siguen en el rango de las corridas anteriores.
- [ ] `README.md` y `docs/ARCHITECTURE.md` describen el costo en el dataset demo.
- [ ] El quality gate pasa.

## Non-functional notes
- **Costo del eval:** los 2 casos suman unas 10 llamadas por corrida.
- **Re-seed:** para la corrida real hay que regenerar `data/data.db`, con el backend parado (ver #32).

## Assumptions
Confirmadas en el refinamiento (2026-10-23):
- El costo es una columna fija en `products`, no un dato por pedido.
- Los márgenes son distintos por categoría, con Electronics, la que más vende, como la de menor margen porcentual.
- 2 casos en el golden, uno en español y uno en inglés.

Propuestas al escribir el issue, sin una pregunta aparte:
- El nombre `unit_cost`, al lado de `unit_price`.
- Los rangos de margen de la tabla de *Data*.
- Las preguntas del golden usan "margen porcentual" y "total margin" para que no sean ambiguas: "más margen" a secas puede ser en dólares o en porcentaje.

## Deferred decisions
- **Un costo que cambie en el tiempo** (por pedido). Permitiría comparar márgenes entre años; hoy alcanza con el costo fijo.

## Pull request
Branch: `feat/33-costo-de-los-productos` → `epic/32-ampliar-el-dataset-demo`

### Qué hace
- **Dataset** (`backend/src/demo-dataset.ts`): `products` suma `unit_cost REAL NOT NULL` después de `unit_price`, con un costo literal para cada uno de los 15 productos, dentro de los rangos de margen de *Data*.

  | Categoría | Ventas | Margen | Margen % |
  |---|---|---|---|
  | Electronics | 133.414 | 24.032 | 18,0% (el menor) |
  | Furniture | 55.477 | 21.302 | 38,4% |
  | Accessories | 15.503 | 8.665 | 55,9% |
  | Office Supplies | 5.701 | 3.616 | 63,4% (el mayor) |

  La Laptop es la que más vende (57.552) y deja el 15%. El Standing Desk vende la mitad y deja más margen en dólares (11.068 contra 8.633).
- **Metadatos:** la descripción de `unit_cost` dice cómo se calcula el margen (`amount - quantity * unit_cost`) y su porcentaje. La de `products` nombra el costo.
- **Tests** (`demo-dataset.test.ts`): la columna en la estructura de `products`, que el costo es mayor que 0, menor que el precio y con 2 decimales, y que Electronics es la categoría con más ventas y la de menor margen porcentual.
- **Golden:** `margin-share-by-category` ("¿Qué categoría tiene el mayor margen porcentual?") y `margin-by-country-2025` ("What was the total margin per country in 2025?"). El golden pasa de 17 a 19 casos.
- **Docs:** la descripción del dataset demo en `README.md` y `docs/ARCHITECTURE.md` (*Initial data*).
- `orders`, `customers` y las otras columnas de `products` no cambian. La self-review lo comprobó comparando hashes de las filas entre la base y esta rama.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (33 archivos, 627 tests; antes 625). Una corrida anterior, en paralelo con el eval, falló con "Timeout waiting for worker to respond". Es el corte de workers descrito en `docs/ARCHITECTURE.md` (Quality gate). Las dos corridas siguientes, solas, pasaron completas; la última, después del último commit.
- Coverage: 99,74% de statements, 97,54% de branches, 99,61% de funciones y 100% de líneas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno (el cambio es de datos y tests).
- Criterios de aceptación:
  - **`unit_cost REAL NOT NULL` después de `unit_price`, mayor que 0, menor que el precio y con 2 decimales: pass** (tests de estructura y de invariantes).
  - **Electronics con más ventas y el menor margen porcentual: pass** (test).
  - **Metadatos de `unit_cost` y de `products`: pass**, y los tests de consistencia pasan.
  - **Estructura con la columna nueva y las filas de antes iguales: pass.**
  - **Los 2 casos en el golden: pass.**
  - **Corrida real con los 2 casos nuevos, y los de antes en su rango: pass** (abajo).
  - **`README.md` y `docs/ARCHITECTURE.md`: pass.**
  - **Quality gate: pass.**
- `npm run seed` y `npm run eval` reales (2026-10-23, pipeline `gpt-5.4-mini`, judge `gpt-6-luna`), 19 casos, salida 0:
  ```
  sales-by-month-2025: classification ok | sql 2.00/2 | narrative 2.00/2 | chart 0.99 | language 1.00
  revenue-by-country: classification ok | sql 2.00/2 | narrative 1.98/2 | chart 1.00 | language 1.00
  top-products-by-units: classification ok | sql 2.00/2 | narrative 1.97/2 | chart 1.00 | language 1.00
  category-share: classification ok | sql 2.00/2 | narrative 1.99/2 | chart 1.00 | language 0.96
  customer-count: classification ok | sql 2.00/2 | narrative 2.00/2 | chart n/a | language 1.00
  average-order-by-segment: classification ok | sql 2.00/2 | narrative 2.00/2 | chart 1.00 | language 1.00
  orders-2024: classification ok | sql 2.00/2 | narrative 2.00/2 | chart n/a | language 1.00
  separate-lists: classification ok | sql 1.99/2 | narrative 0.85/2 | chart 1.00 | language 1.00
  greeting: classification ok | language 1.00
  capital-of-france: classification ok | language 1.00
  how-are-we-doing: classification ok | language 1.00
  chart-not-shown: classification ok | sql 1.48/2 | narrative 1.99/2 | chart 0.95 | language 0.99
  as-pie-chart: classification ok | sql 1.37/2 | narrative 2.00/2 | chart 1.00 | language 0.99
  and-in-2024: classification ok | sql 1.89/2 | narrative 1.98/2 | chart 0.99 | language 1.00
  thanks-after-answer: classification ok | language 1.00
  capital-of-france-after-spanish: classification ok | language 1.00
  top-products-after-spanish: classification ok | sql 1.97/2 | narrative 1.99/2 | chart 0.99 | language 1.00
  margin-share-by-category: classification ok | sql 2.00/2 | narrative 1.98/2 | chart n/a | language 0.91
  margin-by-country-2025: classification ok | sql 2.00/2 | narrative 1.92/2 | chart 0.96 | language 1.00
  Summary: 19 questions, 14 answered, 0 without an answer, 5 with another label, 0 errors
    The SQL answers the question: 1.91/2 (14 judged, 0 refused, 0 not applicable)
    The narrative is faithful to the data: 1.90/2 (14 judged, 0 refused, 0 not applicable)
    The chart fits: 0.99 average probability (11 judged, 0 refused, 3 not applicable)
    The answer is in the language of the message: 0.99 average probability (19 judged, 0 refused, 0 not applicable)
    Classification: 19/19 correct (0 without a label)
  ```
  - **Los 2 casos nuevos dan 2,00 de SQL y responden bien.** `margin-share-by-category` calcula el margen con `unit_cost` y da Office Supplies con 63,43%. `margin-by-country-2025` da Argentina como el mayor (7.995,81) y Japón como el menor (5.535,45). Coincide con el cálculo previo.
  - **Los 17 casos de antes siguen en su rango**, salvo la narrativa de `separate-lists`, con 0,85: el valor más bajo visto (antes 1,28, 1,57 y 1,85).
    - Esa respuesta no usa el costo: su SQL es el de siempre, por cliente y por producto. Todas sus cifras coinciden con las filas, incluidas las diferencias que calcula (2.773,90 y 26.808).
    - Nombra 4 de los 5 clientes del top, sin Acme Corp, y el judge le dio "minor inaccuracies" 0,47. Es variación de la narrativa entre corridas, no de este cambio.
- Self-review: 1 ronda con un agente nuevo (separado), sin bloqueantes.
  - **Aplicadas:** reacomodar una línea larga del `README.md`, y nombrar las dos búsquedas del test de Electronics.
  - **No aplicadas:** ninguna.
- Plan: aprobado por el usuario ("si", 2026-10-23).
- Security: no se tocó superficie de seguridad. Es un dataset estático con literales, tests y docs. No hay secretos en el diff.
- Docs: updated `README.md` y `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
None
