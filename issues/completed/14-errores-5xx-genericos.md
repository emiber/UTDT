---
id: 14
title: Responder los errores 5xx con un mensaje genérico
type: fix
status: closed
parent: 1
created: 2026-10-20
---

## Goal
Que un error interno del backend no le muestre al cliente detalles internos. Hoy, cuando `GET /api/catalog` o `GET /api/health` fallan, el `500` estándar de Fastify trae el mensaje crudo de SQLite, p. ej. `no such table: meta_tables`. Follow-up de #5.

## Scope
- In:
  - Un manejador de errores en `buildApp` (`app.setErrorHandler`): un error con status `>= 500`, o sin status, se loguea con `request.log.error` y se responde con el formato estándar de Fastify y un mensaje genérico: `{ statusCode: 500, error: 'Internal Server Error', message: 'Something went wrong on the server.' }`.
  - Los `4xx` siguen como hoy: el `400` de validación con su mensaje, el `404` de una ruta inexistente y el `401` del hook.
  - Tests y una línea en `docs/ARCHITECTURE.md` (*Backend API*).
- NOT in:
  - Los `502` y `500` propios de `POST /api/chat` (#8): ya son genéricos y no cambian.
  - Cambiar el formato de los `4xx`.

## Expected behavior
- `GET /api/catalog` sin las tablas `meta_*`: `500` con el mensaje genérico. El error original queda en el log.
- `GET /api/health` con la base cerrada: `500` con el mismo mensaje genérico.
- Un body inválido sigue dando `400` con el mensaje de validación de Fastify, y una ruta inexistente, `404`.

## Acceptance criteria
- [x] Un `500` de `/api/catalog` y otro de `/api/health` traen exactamente `{ statusCode: 500, error: 'Internal Server Error', message: 'Something went wrong on the server.' }`, sin el texto de SQLite.
- [x] El error original se loguea (test con el logger de Fastify leyendo las líneas).
- [x] El `400` de un body inválido y el `404` de una ruta inexistente no cambian.
- [x] Los tests de `POST /api/chat` siguen pasando sin cambios en sus aserciones de `502` y `500`.
- [x] `docs/ARCHITECTURE.md` lo dice en *Backend API*.
- [x] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- El mensaje genérico va en inglés, como los demás textos del backend (`workflow/rules.md`).

## Pull request
Branch: `fix/14-errores-5xx-genericos` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- **Manejador de errores en `buildApp`** (`backend/src/app.ts`): un error de servidor se loguea (`request.log.error`, "Request failed", con el error original) y se responde `{ statusCode: 500, error: 'Internal Server Error', message: 'Something went wrong on the server.' }`. Cuentan como error de servidor:
  - un status 5xx;
  - la falta de status;
  - un status nulo o 3xx;
  - algo lanzado que no es un `Error`, como un string, `undefined` o un objeto.
- **Errores de cliente:** solo un `Error` con `statusCode` 4xx sigue al manejador por defecto de Fastify, con su formato, su `code` y su mensaje. Eso cubre la validación, el JSON inválido, el 413 y el 415. El `404` de una ruta inexistente y el `401` del hook no pasan por el manejador y no cambian.
- **`POST /api/chat`:** sus `502` y `500` se mandan como respuestas, no como errores, y no cambian.
- **Docs:** `docs/ARCHITECTURE.md` (*Backend API*: la fila de `/api/catalog` y un párrafo *Errors*).

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (28 archivos, 412 tests)
- Coverage: 100% en sentencias, funciones y líneas, y 98,91% en ramas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno.
- Manual: con `app.inject` sobre el `buildApp` real y el logger de Fastify leyendo las líneas.
  - `/api/catalog` sin `meta_tables` y `/api/health` con la base cerrada responden el 500 genérico. El error original ("no such table: meta_tables") queda en el log.
  - El 400 de validación, con `code` y mensaje, y el 404 se comparan con su body completo.
  - La review comparó la rama contra la base en 15 casos y salieron byte a byte iguales: validación, JSON inválido o vacío, 413, 415, `Content-Length` inválido, 404, 401 y el 404 del chat.
- Self-review: 2 rondas en un subagente nuevo, ninguna con blockers.
  - La 1.ª encontró que un status nulo o 3xx, o algo lanzado que no es `Error`, seguía al manejador por defecto. El mensaje crudo llegaba al cliente, o se respondía 200. Se corrigió y se agregaron tests.
  - La 2.ª pidió el test de un 5xx, que se agregó.
- Plan: issue refinado; sin decisiones nuevas.
- Security: reduce la exposición. El cliente ya no ve mensajes internos de errores de servidor, y el detalle queda solo en el log.
- Docs: updated `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
None
