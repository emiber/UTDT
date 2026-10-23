---
id: 36
title: Evitar que los puntajes del judge cambien al sumar tablas al esquema
type: fix
status: open
parent: 32
created: 2026-10-23
---

## Problema

El judge de `npm run eval` ve el esquema completo de la base en su input ("Schema the bot knew:"). Al sumar `sales_targets` (#34), los puntajes de respuestas que no la usan cambiaron. Las mismas respuestas fijas, juzgadas con el esquema de antes y con el nuevo:

| Caso | Esquema sin `sales_targets` | Con `sales_targets` |
|---|---|---|
| `separate-lists`, narrativa | 0,83 | 0,19 |
| `top-products-after-spanish`, narrativa | 1,94 | 1,50 |
| `as-pie-chart`, SQL | 1,30 | 1,77 |
| `chart-not-shown`, SQL | 1,37 | 1,24 |
| Las otras 10 respuestas de datos | — | ±0,06 o menos |

Las respuestas son las mismas y correctas: cambia solo lo que ve el judge. Un puntaje que se mueve por una tabla que la pregunta no usa tapa los cambios de verdad. #35 suma otra tabla (`returns`), así que conviene resolverlo antes.

## Contexto conocido

- Pasó algo parecido en #29: con el historial en el input, el judge confundía qué mensaje juzgar. Se resolvió con un input propio, sin el historial, para el criterio de idioma.
- La fidelidad de la narrativa se juzga contra las filas; el esquema no parece hacerle falta. El criterio de SQL sí usa el esquema ("given the schema the bot knew").
- Los datos de arriba salen de re-juzgar las respuestas de la corrida `eval-2026-10-23T16-40-21-050Z.json` con la base del epic antes de #34 y con la de #34.

Follow-up de #34. Parte del epic #32.
