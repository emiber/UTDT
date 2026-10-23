---
id: 34
title: Sumar objetivos mensuales para comparar las ventas contra la meta
type: feat
status: refined
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
