---
id: 35
title: Sumar devoluciones para preguntar por la tasa de devolución
type: feat
status: refined
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
