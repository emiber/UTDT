---
id: 28
title: Evaluar la clasificación y las conversaciones de varios turnos en el set golden
type: feat
status: open
parent:
created: 2026-10-22
---

## Problema

`npm run eval` (#12) solo mide preguntas de datos sueltas: cada caso de `backend/eval/golden.json` trae `id` y `question`, corre en una conversación nueva, y el judge puntúa el SQL, la narrativa y el gráfico. No mide:

- si la clasificación de #10 acierta (`data_question`, `conversation`, `needs_clarification`, `out_of_scope`);
- los seguimientos dentro de una conversación ("No veo el gráfico", "¿y en 2024?");
- el idioma de la respuesta cuando la conversación mezcla idiomas.

## Por qué vale la pena

Los tres bugs de calidad más recientes se encontraron a mano, y un eval así los habría detectado solo:

- #10: pedidos de gráfico clasificados como charla;
- #22 y #23: el idioma de los turnos anteriores pisando el del mensaje (en la respuesta y en los alias del SQL).

Hoy cualquier cambio de prompts puede volver a romper eso sin que nada avise.

## Contexto conocido

- El pipeline ya soporta lo necesario: `answerQuestion` (`backend/src/pipeline.ts`) recibe `history` y devuelve `classification`.
- `evaluateCase` (`backend/src/evaluate.ts`) asume que todas las preguntas golden son de datos: una respuesta de texto cuenta como "sin respuesta" (`classified as ...`). Para sumar preguntas que no son de datos hay que cambiar eso.
- #12 dejó esto fuera de alcance a propósito: los casos multi-turn, la etiqueta esperada de clasificación ("se suma cuando #10 tenga sus etiquetas definidas") y criterios extra como "responde en el idioma de la pregunta". #10 ya está cerrado y las etiquetas existen.
- Ideas anotadas en `issues/pendientes.md`:
  - agregar al golden la etiqueta esperada de cada pregunta;
  - sumar preguntas que no son de datos ("Hola", "¿Cuál es la capital de Francia?");
  - sumar casos de varios turnos, con su historial.
- Puede convenir partirlo en dos al refinar: primero la clasificación (casos de un turno con etiqueta esperada), después las conversaciones y el idioma.

Origen: `issues/pendientes.md`, pendiente técnico 1 (diferido en #12 y #10).
