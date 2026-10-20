---
id: 16
title: Documentar en la lista blanca diferida qué puede leer el SQL del LLM
type: docs
status: refined
parent: 1
created: 2026-10-20
---

## Goal
Que la decisión diferida de no limitar las tablas que lee el SQL del LLM quede registrada en `docs/ARCHITECTURE.md` con su costo real. Hoy solo está en #6, y no menciona que `pragma_database_list` devuelve la ruta absoluta de `data.db`. Follow-up de #6.

## Scope
- In: una fila en *Deferred decisions* de `docs/ARCHITECTURE.md`. Dice que no hay lista blanca de tablas para el SQL del LLM, y que con la conexión read-only leer `meta_*`, `sqlite_master`, `dbstat` o `pragma_database_list` es inofensivo, salvo que este último expone la ruta absoluta del archivo. Se revisa si la demo sale de localhost.
- NOT in: bloquear esas fuentes en el ejecutor.

## Acceptance criteria
- [ ] `docs/ARCHITECTURE.md` tiene la fila en *Deferred decisions*, con las cuatro fuentes y el motivo para revisarla.
