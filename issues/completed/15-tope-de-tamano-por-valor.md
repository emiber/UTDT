---
id: 15
title: Poner un tope de tamaño por valor en la conexión read-only a data.db
type: fix
status: closed
parent: 1
created: 2026-10-20
---

## Goal
Que una consulta del LLM que devuelve un valor gigante, como `SELECT hex(zeroblob(300000000))`, no tire el proceso de Node. Hoy pasa las tres guardas de #6 y mata el backend con un error fatal de V8. Follow-up de #6.

## Scope
- In:
  - `openReadOnlyDatabase` (`backend/src/db.ts`) abre la conexión con `limits: { length: MAX_VALUE_LENGTH }`, una constante de 1.000.000. Es el máximo de un string o un blob, en bytes (UTF-8 para el texto). `node:sqlite` 24.15 lo soporta (verificado).
  - Un valor más grande hace que SQLite falle con `SQLITE_TOOBIG` ("string or blob too big"). El ejecutor de #6 ya lo clasifica como error `sql`, así que vuelve al LLM como feedback para reintentar.
  - Tests en `db.test.ts` y `execute-sql.test.ts`, y la nota de `docs/ARCHITECTURE.md` (paso 4 y la fila *Query timeout / worker thread*), que hoy dice que un valor de cientos de MB tira el proceso.
- NOT in:
  - Un tope del tamaño total de la respuesta (filas × valores). El tope de 500 filas de #6 sigue siendo el único.
  - La conexión de escritura del seed (`openDatabase`).

## Expected behavior
- `SELECT hex(zeroblob(300000000))` da `{ ok: false, kind: 'sql', message: 'string or blob too big' }` y el backend sigue vivo.
- Un valor de hasta 1.000.000 se lee normal. El catálogo y el dataset demo no se ven afectados: sus valores son chicos.

## Acceptance criteria
- [x] Por `openReadOnlyDatabase`, un valor de más de 1.000.000 falla con "string or blob too big", y uno de 500.000 se lee.
- [x] `executeSql` con `SELECT hex(zeroblob(600000))` (1.200.000 caracteres) devuelve `kind: 'sql'` con ese mensaje.
- [x] `docs/ARCHITECTURE.md` deja de decir que un valor gigante tira el proceso, y explica el tope.
- [x] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- 1.000.000 alcanza para cualquier valor razonable de un dataset de demo, y está muy lejos del límite de V8 que provoca la caída.

## Pull request
Branch: `fix/15-tope-de-tamano-por-valor` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- **`openReadOnlyDatabase`** (`backend/src/db.ts`) abre la conexión con `limits: { length: MAX_VALUE_LENGTH }`, que vale 1.000.000 bytes, en UTF-8 para el texto. Un string o blob más grande, guardado o calculado, falla con "string or blob too big". El ejecutor de #6 ya lo clasificaba como error `sql`, así que vuelve al LLM como feedback. `printf` devuelve `NULL` en vez de fallar.
- **Node 24.15 como mínimo:** `engines` pasa a `>=24.15`, en `package.json` y en la entrada raíz de `package-lock.json`. La opción `limits` de `node:sqlite` llega en 24.15 y una versión anterior la ignora sin avisar.
- **Tests:**
  - un valor de 500.000 se lee, y también uno de exactamente 1.000.000;
  - uno de 1.000.001 falla;
  - un `hex` que pasa el tope falla;
  - un valor guardado de 1.000.002 caracteres, escrito por una conexión sin tope, falla al leerlo;
  - `executeSql` con `SELECT hex(zeroblob(600000))` devuelve `{ ok: false, kind: 'sql', message: 'string or blob too big' }`.
- **Docs:** `docs/ARCHITECTURE.md` (paso 4, la fila *Query timeout / worker thread* y la fila *Runtime*), `README.md` (requisito de Node) y los comentarios de `execute-sql.ts`.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (28 archivos, 413 tests).
  - Una corrida intermedia falló: los workers de Vitest del frontend no arrancaron y la cobertura bajó a 84,78%. Es el flake conocido de arranque bajo carga.
  - La corrida se repitió y pasó. Mi chequeo del gate miraba el exit code de `grep` y no el de `npm`, así que el commit 7e39043 entró con esa corrida fallida. El contenido era correcto, y desde entonces el gate usa `pipefail`.
- Coverage: 100% en sentencias, funciones y líneas, y 98,91% en ramas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno.
- Manual: pass, sobre el `data/data.db` real.
  - `executeSql` con `SELECT hex(zeroblob(300000000))` devolvió `kind: 'sql'`, "string or blob too big", y el proceso siguió vivo. Sin el tope, la review confirmó que esa consulta tira Node con un error fatal de V8.
  - Un valor de 800.000 caracteres se leyó.
  - El catálogo (3 tablas) y el contexto de esquema se leen normal por la conexión con tope. El valor más largo del dataset demo tiene 106 caracteres.
- Self-review: 2 rondas en un subagente nuevo, ninguna con blockers.
  - La 1.ª sugirió subir el mínimo de Node a 24.15, expresar el tope en bytes, agregar el test de un valor guardado y poner al día comentarios y docs. Todo se aplicó.
  - La 2.ª verificó que el lockfile es el que escribe npm, que el test nuevo falla sin el tope y que lo de `printf` es cierto. Dejó solo nits de formato, que se aplicaron.
- Plan: issue refinado; sin decisiones nuevas, salvo el mínimo de Node 24.15, que salió de la review.
- Security: reduce el riesgo del SQL generado por el LLM. Un valor gigante ya no tira el backend. No hay entradas nuevas.
- Docs: updated `docs/ARCHITECTURE.md`, `README.md`

### Out of scope / follow-ups
- El tamaño total de una respuesta (filas × columnas × hasta 1 MB) sigue acotado solo por el tope de 500 filas, como dice el issue.
