---
id: 33
title: Sumar el costo de los productos para preguntar por el margen
type: feat
status: refined
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
