---
id: 21
title: Mostrar nombres de columna legibles en tablas y gráficos
type: feat
status: refined
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
