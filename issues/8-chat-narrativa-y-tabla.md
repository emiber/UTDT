---
id: 8
title: "Agregar el chat: POST /api/chat y UI con narrativa y tabla"
type: feat
status: open
parent: 1
created: 2026-10-19
---

Endpoint `POST /api/chat` que recibe una pregunta y devuelve la respuesta como bloques: narrativa y tabla. Más la UI de chat que los muestra.

**Contexto**
- Contrato previsto: `{ conversationId?, question }` → `{ conversationId, turnId, blocks, suggestions }`.
- Comentario en el epic: tiene que recibir el id del chat para poder seguir el hilo.
- Propuesta de división con #11, a confirmar en el refinamiento:
  - acá se persiste el hilo (conversaciones y turnos en `app.db`) y el `conversationId` va y vuelve;
  - #11 manda los últimos turnos como contexto al LLM.
- El LLM devuelve solo la narrativa y las sugerencias. El backend arma la tabla con las filas reales.
- Evaluar en el refinamiento si conviene dividirlo en back y front, como la autenticación.
- Depende de #4 y #7.
