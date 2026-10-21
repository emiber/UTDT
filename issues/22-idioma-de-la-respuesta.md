---
id: 22
title: Responder en el idioma del mensaje aunque la conversación venga en otro
type: fix
status: refined
parent: 1
created: 2026-10-21
---

## Goal
Que el bot responda en el idioma del último mensaje, aunque la conversación venga en otro. En la prueba de punta a punta antes de cerrar el epic, "What is the capital of France?" después de varias preguntas en español se respondió en español. Sin historial, la misma pregunta se responde en inglés. Follow-up de #10.

## Scope
- In:
  - `prompts/reply-system.liquid`: la regla de idioma dice que un mensaje en inglés recibe la respuesta en inglés y uno en español en español, sea cual sea el idioma de los turnos anteriores o de los datos. Es la misma forma que ya usa la regla de los insights.
  - `prompts/insights-system.liquid`: la regla de idioma también menciona los turnos anteriores.
  - Tests de las dos reglas.
- NOT in:
  - Detectar el idioma en código.
  - El prompt de SQL: sus alias ya siguen el idioma de la pregunta (#21).

## Expected behavior
- Después de preguntas en español, "What is the capital of France?" se responde en inglés, y "Total sales per month in 2025" también.
- Una conversación en un solo idioma sigue como hoy.

## Acceptance criteria
- [ ] Los prompts de sistema de la respuesta de texto y de los insights dicen que el idioma es el del mensaje actual, no el de los turnos anteriores (tests).
- [ ] Verificación manual con la API real: en una conversación en español, un mensaje fuera de alcance y una pregunta de datos en inglés se responden en inglés.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- Lo arregla el prompt, como ya pasó con la deriva de idioma de #9.
