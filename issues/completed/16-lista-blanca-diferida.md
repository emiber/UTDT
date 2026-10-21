---
id: 16
title: Documentar en la lista blanca diferida qué puede leer el SQL del LLM
type: docs
status: closed
parent: 1
created: 2026-10-20
---

## Goal
Que la decisión diferida de no limitar las tablas que lee el SQL del LLM quede registrada en `docs/ARCHITECTURE.md` con su costo real. Hoy solo está en #6, y no menciona que `pragma_database_list` devuelve la ruta absoluta de `data.db`. Follow-up de #6.

## Scope
- In: una fila en *Deferred decisions* de `docs/ARCHITECTURE.md`. Dice que no hay lista blanca de tablas para el SQL del LLM, y que con la conexión read-only leer `meta_*`, `sqlite_master`, `dbstat` o `pragma_database_list` es inofensivo, salvo que este último expone la ruta absoluta del archivo. Se revisa si la demo sale de localhost.
- NOT in: bloquear esas fuentes en el ejecutor.

## Acceptance criteria
- [x] `docs/ARCHITECTURE.md` tiene la fila en *Deferred decisions*, con las cuatro fuentes y el motivo para revisarla.

## Pull request
Branch: `docs/16-lista-blanca-diferida` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- **Una fila nueva en *Deferred decisions*** de `docs/ARCHITECTURE.md`, *Table whitelist for the LLM's SQL*. Dice tres cosas:
  - El SQL generado puede leer todo lo que hay en la conexión read-only a `data.db`. Eso incluye `meta_*` (ya público por el catálogo), `sqlite_master`, `dbstat` y los pragmas como tabla, por ejemplo `pragma_database_list`. Todo es inofensivo, salvo que `pragma_database_list` devuelve la ruta absoluta de `data.db`.
  - `app.db` no se puede leer: es otra conexión y `ATTACH` está bloqueado.
  - Se revisa si la demo sale de localhost, bloqueando esas fuentes en `executeSql` o mirando qué tablas lee la consulta.

### Verification
- Lint: `npm run lint` — pass
- Tests: n/a, es un cambio solo de docs.
- Coverage: n/a.
- Manual: pass. Con `executeSql` sobre el `data/data.db` real se leyeron las cuatro fuentes:
  - `pragma_database_list` devolvió la ruta absoluta del archivo;
  - `sqlite_master` y `dbstat` devolvieron filas (el SQLite de Node se compila con `ENABLE_DBSTAT_VTAB`);
  - `meta_tables` devolvió las tres tablas.
- Self-review: inline. Es una fila de docs, y cada afirmación se verificó contra la base real.
- Plan: issue refinado.
- Security: no cambia la superficie; documenta un riesgo aceptado para la demo local.
- Docs: updated `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
None
