---
id: 37
title: Responder siempre en el idioma del mensaje después de turnos en otro idioma
type: fix
status: open
parent:
created: 2026-10-23
---

## Problema

El bug de #22 vuelve a veces. En la corrida real de `npm run eval` de #34 (2026-10-23), `capital-of-france-after-spanish` ("What is the capital of France?" después de 4 turnos en español) se respondió en español: "Solo puedo responder preguntas sobre los datos de ventas, clientes, productos y objetivos de esta base…". El criterio de idioma de #29 lo marcó con 0,00.

Repetido 10 veces (5 con el esquema de antes de #34 y 5 con el nuevo), salió en inglés las 10. Contando las corridas con el arreglo de #22 que se vieron, falló 1 de 7.

## Contexto conocido

- #22 lo arregló con un campo `language` al principio del esquema de salida de la respuesta de texto (`reply.ts`), porque reforzar la regla del prompt no alcanzaba. Con eso dio 20 de 20 en su verificación.
- Las respuestas de datos tienen el mismo campo en el SQL y los insights (#23).
- No se sabe todavía cada cuánto pasa. Hace falta medirlo con más repeticiones antes de cambiar algo.

Follow-up de #34.
