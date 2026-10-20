---
id: 14
title: Responder los errores 5xx con un mensaje genérico
type: fix
status: refined
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
- [ ] Un `500` de `/api/catalog` y otro de `/api/health` traen exactamente `{ statusCode: 500, error: 'Internal Server Error', message: 'Something went wrong on the server.' }`, sin el texto de SQLite.
- [ ] El error original se loguea (test con el logger de Fastify leyendo las líneas).
- [ ] El `400` de un body inválido y el `404` de una ruta inexistente no cambian.
- [ ] Los tests de `POST /api/chat` siguen pasando sin cambios en sus aserciones de `502` y `500`.
- [ ] `docs/ARCHITECTURE.md` lo dice en *Backend API*.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- El mensaje genérico va en inglés, como los demás textos del backend (`workflow/rules.md`).
