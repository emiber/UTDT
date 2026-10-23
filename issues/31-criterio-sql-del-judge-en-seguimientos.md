---
id: 31
title: Ajustar el criterio de SQL del judge para los seguimientos que piden volver a mostrar una respuesta
type: fix
status: open
parent:
created: 2026-10-23
---

## Problema

El judge de `npm run eval` puntúa bajo el SQL de los seguimientos que piden volver a mostrar o cambiar el formato de una respuesta anterior, aunque el pipeline responda bien.

En la corrida real de #28 (2026-10-23, `data/eval/eval-2026-10-23T03-21-02-697Z.json`):

- `chart-not-shown` ("No veo el gráfico", después de "Ventas por mes en 2025"): SQL 0,23/2. El pipeline repitió la consulta del turno anterior y propuso un gráfico de línea, que es lo que se pedía. El judge marcó "does not answer" con probabilidad 0,88.
- `as-pie-chart` ("mostralo como gráfico de torta", después de "Ventas por categoría"): SQL 1,27/2. Repitió la consulta con un gráfico de torta. "does not answer" con probabilidad 0,34.
- `and-in-2024` ("¿y en 2024?") sí sacó 2,00/2: el seguimiento que cambia el filtro se juzga bien.

El criterio pregunta "Do the SQL queries answer the question, given the schema the bot knew and the rows they returned?". Al parecer lo lee sobre el último mensaje al pie de la letra, aunque desde #28 el judge ve el historial antes de la pregunta. Esos dos casos bajan el promedio de SQL de la corrida a 1,77; las 8 preguntas de un turno siguen en 2,00.

## Contexto conocido

- #28 dejó los tres criterios de #12 sin cambios a propósito; por eso esto quedó afuera de ese PR.
- La rúbrica está en `QUESTIONS` de `backend/src/evaluate.ts`, y el input del judge en `backend/src/prompts/judge-input.liquid` (el historial va con el bloque `history.liquid`).
- #30 ya ajustó la redacción del criterio de SQL una vez, para las respuestas con varios resultados.
- Relacionado, pero distinto: #29 suma un criterio de idioma al judge.
- Es una sola corrida; el judge varía entre corridas.

Origen: follow-up de #28.
