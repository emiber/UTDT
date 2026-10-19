---
id: 12
title: Evaluar respuestas offline con LLM-as-a-judge
type: feat
status: open
parent: 1
created: 2026-10-19
---

Comando `npm run eval` que corre un archivo de preguntas golden por el pipeline y puntúa cada respuesta con la Decisions API.

**Contexto**
- Usa `scores` contra una rúbrica ordenada y `predicates` para chequeos de sí/no. Criterios de ejemplo:
  - el SQL responde la pregunta;
  - la narrativa es fiel a los datos;
  - el gráfico es adecuado.
- Imprime un resumen y escribe un reporte JSON (gitignored).
- Queda fuera del quality gate, porque cuesta plata y no es determinístico.
- Diseño en `docs/ARCHITECTURE.md`, sección *Evaluation*.
- Depende del pipeline (#7, #8).
- Comentario en el epic: "Ok".
