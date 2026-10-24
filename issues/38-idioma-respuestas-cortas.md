---
id: 38
title: Evitar falsos negativos del criterio de idioma en respuestas cortas con nombres en inglés
type: fix
status: open
parent:
created: 2026-10-24
---

## Problema

El criterio de idioma de `npm run eval` (#29) a veces marca como en otro idioma una respuesta que está en el idioma del mensaje. Pasa con respuestas cortas en español cuyo contenido principal es un nombre o un valor en inglés de los datos.

- En la corrida real de #36 (`eval-2026-10-24T01-03-18-455Z.json`), `margin-share-by-category` ("¿Qué categoría tiene el mayor margen porcentual?") dio 0,03 de idioma. Su respuesta está toda en español, con columnas "Categoría" y "Margen porcentual": "La categoría con el mayor margen porcentual es **Office Supplies**, con **63.43%**. Como el resultado devuelve una sola fila, ya identifica directamente a la ganadora."
- El mismo caso dio 0,91 en la corrida de #33 y 0,75 en la de #34, con respuestas parecidas.
- En #36, sacarle el esquema al input del idioma empeoró este tipo de casos (`category-share` de #34: de 1,00 a 0,04), así que el idioma volvió al input de #29.

Un falso negativo así baja el promedio de idioma y puede tapar una respuesta de verdad en otro idioma.

## Contexto conocido

- La rúbrica ya dice que los valores de las filas y los nombres propios no cuentan.
- El input del idioma de una respuesta de datos es el de #29: la pregunta, el esquema y la respuesta, sin el historial.
- Con el judge, la misma entrada da siempre lo mismo, así que las respuestas guardadas en los reportes sirven para medir un cambio, como en #29, #31 y #36.

Follow-up de #36.
