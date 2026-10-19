---
id: 6
title: Ejecutar SQL con guardas de seguridad
type: feat
status: open
parent: 1
created: 2026-10-19
---

Módulo que ejecuta una consulta SQL sobre `data.db` aplicando las guardas de seguridad, todavía sin LLM.

**Contexto**
- Capas de seguridad (diseño en `docs/ARCHITECTURE.md`, paso 4 del pipeline):
  - conexión read-only;
  - una sola sentencia que empiece con `SELECT` o `WITH` (bloquea también `ATTACH` y `PRAGMA`);
  - tope de filas.
- Los errores deben devolverse de forma que la generación de SQL (#7) pueda reintentar usándolos como feedback.
- Depende de #2.
- Comentario en el epic: "Ok con esto."
