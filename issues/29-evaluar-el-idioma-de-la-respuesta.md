---
id: 29
title: Evaluar en el set golden que la respuesta esté en el idioma del mensaje
type: feat
status: open
parent:
created: 2026-10-22
---

## Problema

`npm run eval` no mide el idioma de la respuesta. Los bugs de #22 y #23 se encontraron a mano: cuando los turnos anteriores venían en otro idioma, el bot respondía en el de la conversación y no en el del mensaje.

- #22: "What is the capital of France?", después de varias preguntas en español, se respondió en español. Era una respuesta de texto, sin SQL.
- #23: "Top 5 products by units sold", después de preguntas en español, devolvió los alias del SQL ("Producto", "Unidades vendidas") y la narrativa en español. Con el historial real pasó 6 de 6 veces.

Los dos se arreglaron con un campo `language` en los esquemas de salida, porque reforzar la regla del prompt no alcanzó. Nada avisa si un cambio de prompts los vuelve a romper.

## Contexto conocido

- #28 suma `history` fijo por caso al golden, y le muestra el historial al judge. Este issue lo reutiliza: los casos de idioma son un mensaje en un idioma después de turnos en otro.
- El judge hoy tiene tres criterios (SQL, narrativa y gráfico) y solo juzga respuestas de datos. #28 dejó afuera juzgar las respuestas de texto, pero el bug de #22 fue en una de ellas.
- Un criterio de idioma tendría que mirar la narrativa, los nombres de columna (alias) y el texto de las respuestas que no son de datos.
- #12 ya preveía esto como criterio extra ("responde en el idioma de la pregunta"): sumar un criterio es una entrada más en la rúbrica.
- #22 dejó fuera de alcance detectar el idioma en código.

Origen: refinamiento de #28 (2026-10-22), que lo separó para mantener los dos PRs chicos.
