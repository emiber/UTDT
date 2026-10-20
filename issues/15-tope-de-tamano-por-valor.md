---
id: 15
title: Poner un tope de tamaño por valor en la conexión read-only a data.db
type: fix
status: refined
parent: 1
created: 2026-10-20
---

## Goal
Que una consulta del LLM que devuelve un valor gigante, como `SELECT hex(zeroblob(300000000))`, no tire el proceso de Node. Hoy pasa las tres guardas de #6 y mata el backend con un error fatal de V8. Follow-up de #6.

## Scope
- In:
  - `openReadOnlyDatabase` (`backend/src/db.ts`) abre la conexión con `limits: { length: MAX_VALUE_LENGTH }`, una constante de 1.000.000. Es el máximo de un string o un blob, en bytes o caracteres. `node:sqlite` 24.15 lo soporta (verificado).
  - Un valor más grande hace que SQLite falle con `SQLITE_TOOBIG` ("string or blob too big"). El ejecutor de #6 ya lo clasifica como error `sql`, así que vuelve al LLM como feedback para reintentar.
  - Tests en `db.test.ts` y `execute-sql.test.ts`, y la nota de `docs/ARCHITECTURE.md` (paso 4 y la fila *Query timeout / worker thread*), que hoy dice que un valor de cientos de MB tira el proceso.
- NOT in:
  - Un tope del tamaño total de la respuesta (filas × valores). El tope de 500 filas de #6 sigue siendo el único.
  - La conexión de escritura del seed (`openDatabase`).

## Expected behavior
- `SELECT hex(zeroblob(300000000))` da `{ ok: false, kind: 'sql', message: 'string or blob too big' }` y el backend sigue vivo.
- Un valor de hasta 1.000.000 se lee normal. El catálogo y el dataset demo no se ven afectados: sus valores son chicos.

## Acceptance criteria
- [ ] Por `openReadOnlyDatabase`, un valor de más de 1.000.000 falla con "string or blob too big", y uno de 500.000 se lee.
- [ ] `executeSql` con `SELECT hex(zeroblob(600000))` (1.200.000 caracteres) devuelve `kind: 'sql'` con ese mensaje.
- [ ] `docs/ARCHITECTURE.md` deja de decir que un valor gigante tira el proceso, y explica el tope.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- 1.000.000 alcanza para cualquier valor razonable de un dataset de demo, y está muy lejos del límite de V8 que provoca la caída.
