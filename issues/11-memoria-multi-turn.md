---
id: 11
title: Agregar memoria multi-turn a las conversaciones
type: feat
status: open
parent: 1
created: 2026-10-19
---

Que el bot entienda preguntas de seguimiento ("¿y para el año pasado?") usando los turnos anteriores de la conversación.

**Contexto**
- Diseño previsto: los últimos 5 turnos (pregunta, SQL, narrativa; no las filas de datos) van como contexto a la clasificación, a la generación de SQL y a los insights.
- Comentario en el epic: relacionado con la nota de #8, que es donde se recibe el id del chat y se persiste el hilo.
- Depende de #8.
