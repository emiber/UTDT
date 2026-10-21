---
id: 21
title: Mostrar nombres de columna legibles en tablas y gráficos
type: feat
status: closed
parent: 1
created: 2026-10-21
---

## Goal
Que los encabezados de la tabla y las leyendas del gráfico sean legibles para quien pregunta, y no los nombres de las columnas de la base. Pedido del usuario: "el nombre de las columnas son los de la tabla y no son descriptivos", p. ej. `product_id`, `name`, `category`, `unit_price`.

## Scope
- In:
  - El prompt de sistema de la generación de SQL (`prompts/sql-system.liquid`) pide que cada columna del resultado tenga un alias corto y legible, en el idioma de la pregunta, con `AS` y comillas dobles (p. ej. `AS "Precio unitario"`). También pide que los alias no se repitan y que no use `SELECT *`, sino que liste las columnas.
  - Como la tabla, las leyendas del gráfico (#9) y la narrativa salen de los nombres de las columnas del resultado, todos pasan a usar esos alias sin otro cambio. El spec del gráfico ya nombra las columnas tal como vienen en el resultado.
  - Un test del prompt y una línea en `docs/ARCHITECTURE.md` (paso 3).
- NOT in:
  - Transformar los nombres en el frontend o en el backend (p. ej. `unit_price` → "Unit price"): el nombre legible lo elige el LLM, que conoce el idioma de la pregunta.
  - Cambiar los metadatos o el catálogo.

## Acceptance criteria
- [ ] El prompt de sistema renderizado pide alias legibles en el idioma de la pregunta, entre comillas dobles, sin repetir y sin `SELECT *` (test).
- [ ] Verificación manual con la API real: una pregunta en español y otra en inglés devuelven tablas con encabezados legibles en su idioma, y el gráfico, cuando lo hay, usa esos nombres.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- Pedirle los alias al LLM es lo mínimo: un cambio en el prompt, sin otra llamada ni otro mapeo de nombres. Los alias entre comillas dobles son identificadores válidos en SQLite, con espacios y acentos.

## Pull request
Branch: `feat/21-nombres-de-columna-legibles` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- **El prompt de sistema del SQL** (`prompts/sql-system.liquid`) pide para cada columna del resultado un alias corto y legible, en el idioma de la pregunta, con `AS` y comillas dobles (`AS "Precio unitario"`), sin repetir y sin `SELECT *`. La tabla, las leyendas del gráfico y la narrativa usan esos nombres sin otro cambio.
- **`docs/ARCHITECTURE.md`** (paso 3).
- **Timeout de los tests del backend:** se restauró el `testTimeout` de 20 s de `backend/vitest.config.ts`, con un commit aparte. #18 lo había sacado, pero en esta rama el primer test de `chat.test.ts` volvió a pasar los 5 s (6,3 s) con la máquina cargada.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (26 archivos, 380 tests). Una corrida previa falló por el timeout de 5 s descrito arriba; se resolvió restaurando el de 20 s.
- Coverage: 100% en sentencias, funciones y líneas, y 99,07% en ramas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno.
- Manual: pass, con la API real (`gpt-5.4-mini`).
  - "Show me the products" dio `["Product ID","Product","Category","Unit price"]`, y su gráfico, la leyenda "Unit price".
  - "Mostrame los productos" dio `["ID","Producto","Categoría","Precio unitario"]`.
  - "Total sales per month in 2025" dio `["Month","Total sales"]`, con un gráfico de línea.
  - "Ventas por categoría" dio `["Categoría","Ventas"]`, con un gráfico de barras.
  - "Top 5 customers by revenue" dio `["Customer","Revenue"]`.
  - `npm run eval` dio SQL 1.99/2, narrativa 1.89/2 y gráfico 0.99: no empeoró respecto de la corrida anterior.
- Self-review: inline. Es un cambio de una regla del prompt con su test, y las respuestas reales son la verificación.
- Plan: pedido del usuario el 2026-10-20.
- Security: no security surface touched. Los alias son identificadores del SQL generado, que sigue pasando por las guardas de #6.
- Docs: updated `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
None
