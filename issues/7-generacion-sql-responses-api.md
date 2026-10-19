---
id: 7
title: Generar SQL con la Responses API de OpenAI
type: feat
status: open
parent: 1
created: 2026-10-19
---

Generar el SQL a partir de la pregunta del usuario con la Responses API (Structured Outputs), usando como contexto el esquema armado desde los metadatos.

**Contexto**
- Ante un error de las guardas o del SQL (#6), reintenta con el error como feedback, hasta un tope de reintentos.
- Agrega la dependencia `openai` y las variables `OPENAI_API_KEY` / `OPENAI_MODEL`. Los tests usan un cliente falso, nunca la red.
- Comentario en el epic: revisar el proyecto de referencia y usar algo como Jinja2 para los prompts.
  - El de referencia tiene un `.j2` por prompt (`api-python/llm/prompts/`) y usa `{{ }}`, `{% if %}` y `{% for %}`.
  - Opción recomendada: **LiquidJS**. Tiene la misma sintaxis base, mantenimiento activo, tipos de TypeScript y una sola dependencia.
  - Alternativa: Nunjucks, una copia casi exacta de Jinja2, pero sin releases desde abril de 2023 y sin tipos propios.
  - A decidir en el refinamiento.
- Diseño en `docs/ARCHITECTURE.md`, secciones *Text-to-SQL pipeline* y *LLM layer*.
