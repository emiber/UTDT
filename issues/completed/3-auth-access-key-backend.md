---
id: 3
title: Agregar autenticación con access key en el backend
type: feat
status: closed
parent: 1
created: 2026-10-19
---

## Goal
Que solo quien conoce la access key compartida (`APP_ACCESS_KEY`) pueda usar la API del backend en la demo local. `/api/health` sigue siendo público. El lado del frontend (pedir la key y mandarla) es #4.

## Scope
- In:
  - Un chequeo de auth en el backend que corre antes que cualquier otra cosa en cada request, salvo en `/api/health`. Lee `Authorization: Bearer <key>`, la compara de forma timing-safe con `APP_ACCESS_KEY` y responde `401` si falta o no coincide.
  - Protección por defecto (deny-by-default): toda ruta, actual o futura, exige la key salvo `/api/health`. Así `GET /api/catalog` (#5) y `POST /api/chat` (#8) nacen protegidas sin cablear nada extra.
  - Leer `APP_ACCESS_KEY` una vez al arrancar, en `backend/src/server.ts`, y pasarla a `buildApp` como opción, igual que `db`. Así los tests no dependen del entorno.
  - Que el backend no arranque si `APP_ACCESS_KEY` falta o está vacía. Una función chica valida la variable al arrancar, antes de construir la app y de escuchar en el puerto. Si no está, lanza un error que nombra la variable y remite a `.env.example`. Se mantiene `--env-file-if-exists` (no `--env-file`): sin `.env`, el error lo da este chequeo, con el nombre de la variable, y no Node con un archivo no encontrado.
  - `APP_ACCESS_KEY` en `.env.example`, con un placeholder (no un secreto real) y un comentario que diga para qué sirve y que es obligatoria. También se actualiza la cabecera, que hoy dice que `.env` es opcional y que el scaffold no necesita variables.
  - Docs:
    - `README.md`, en *Getting started*: copiar `.env.example` a `.env` y definir `APP_ACCESS_KEY`, porque sin ella el backend no arranca. Se reemplaza "No `.env` is needed yet".
    - `docs/ARCHITECTURE.md`: en *Auth*, quitar *(later issue)* y decir que sin `APP_ACCESS_KEY` el backend no arranca. En *Configuration*, reemplazar "The scaffold needs no variables" por que `APP_ACCESS_KEY` es obligatoria.
  - Tests unitarios del chequeo de auth y de la validación de la variable. También se ajusta el test existente `returns 404 for unknown routes` al nuevo comportamiento (ver *Expected behavior*).
- NOT in:
  - El frontend: la pantalla de la key, `sessionStorage` y el manejo del `401` (#4).
  - Las rutas protegidas reales, `GET /api/catalog` (#5) y `POST /api/chat` (#8). Acá los tests usan rutas de prueba.
  - Un endpoint para verificar la key (ver *Deferred decisions*).
  - Usuarios, roles, varias keys, expiración o rotación, rate limiting o bloqueo por intentos fallidos, CORS y HTTPS. La auth real está diferida en `docs/ARCHITECTURE.md`.
  - Reglas de fortaleza de la key (largo mínimo, etc.).

## Expected behavior
- Caso normal: un request con `Authorization: Bearer <key>`, donde `<key>` es igual a `APP_ACCESS_KEY`, sigue su curso y la ruta responde lo que corresponda.
- `/api/health` no exige la key: responde `200` sin header, con una key incorrecta y con query string (`/api/health?x=1`).
- Edge cases:
  - El esquema `Bearer` se acepta sin distinguir mayúsculas (`bearer`, `BEARER`), como define HTTP (RFC 9110 §11.1). La key se compara exacta: distingue mayúsculas y no recorta espacios.
  - Una key de distinto largo que `APP_ACCESS_KEY` da `401`, nunca `500`. `crypto.timingSafeEqual` lanza un error si los buffers tienen distinto largo, así que la comparación tiene que funcionar con cualquier largo.
  - Ruta inexistente: sin key válida da `401`; con key válida, `404`. Así no se revela qué rutas existen.
  - La key se valida antes que el body y los parámetros: un request sin key válida y con un body inválido da `401`, no `400`.
- Errores:
  - Da `401` en estos casos: sin header `Authorization`, con otro esquema (p. ej. `Basic …`), con `Bearer` sin key o con una key incorrecta.
  - El `401` usa el formato de error estándar de Fastify: `{ "statusCode": 401, "error": "Unauthorized", "message": "…" }`. Lleva el mismo mensaje genérico en todos los casos (no distingue una key faltante de una incorrecta) y el header `WWW-Authenticate: Bearer`.
  - Si `APP_ACCESS_KEY` falta o está vacía, el backend no arranca: falla al iniciar, sin escuchar en el puerto, con un error que nombra la variable y remite a `.env.example`. En ese caso tampoco responde `/api/health`. Pasa lo mismo con `npm run dev` sin `.env`: el `.env` es obligatorio.

## Data
- Entrada:
  - el header `Authorization` de cada request;
  - `APP_ACCESS_KEY`, del `.env` de la raíz (lo carga `--env-file-if-exists`). Es obligatoria: si falta o está vacía, el backend no arranca. Se lee una sola vez al arrancar, así que cambiarla requiere reiniciar el backend.
- Salida: el `401` descrito arriba, y el error de arranque cuando falta la variable. Las respuestas exitosas no cambian.
- Persistencia: ninguna.

## Dependencies
- No depende de otros issues: se apoya en el scaffold (`buildApp` en `backend/src/app.ts` y el arranque en `backend/src/server.ts`).
- Bloquea a:
  - #4, porque el frontend manda la key y reacciona al `401`;
  - #5 y #8, porque sus rutas quedan protegidas por este chequeo. Sus tests tienen que construir la app con una key y mandar el header.
- Servicios externos: ninguno.

## Acceptance criteria
- [ ] Con una ruta de prueba registrada en el test, un request con `Bearer <key correcta>` llega a la ruta y recibe su respuesta. Lo mismo con el esquema en minúsculas (`bearer <key correcta>`).
- [ ] Cada uno de estos casos da `401` con el body estándar de Fastify, el mismo mensaje y `WWW-Authenticate: Bearer`, y ninguno da `500`:
  - sin header;
  - con un esquema que no es `Bearer`;
  - con `Bearer` sin key;
  - con una key incorrecta del mismo largo que la correcta;
  - con una key de distinto largo.
- [ ] `GET /api/health` responde `200` sin header, con una key incorrecta y con query string.
- [ ] Una ruta inexistente da `401` sin key y `404` con la key correcta. El test `returns 404 for unknown routes` se ajusta para verificar los dos casos.
- [ ] Una ruta de prueba con schema de body, llamada sin key y con un body inválido, da `401` (no `400`).
- [ ] Un test unitario cubre la función que valida `APP_ACCESS_KEY`: con la variable ausente y con `''` lanza un error cuyo mensaje incluye `APP_ACCESS_KEY` y `.env.example`; con un valor, lo devuelve.
- [ ] Con `npm run dev` y sin `APP_ACCESS_KEY` (sin `.env`, o con la variable vacía), el backend no queda escuchando en `127.0.0.1:3000` y la consola muestra ese error.
- [ ] No se agregan dependencias: las de `backend/package.json` no cambian y la comparación usa `timingSafeEqual` de `node:crypto`.
- [ ] `.env.example` incluye `APP_ACCESS_KEY` con un placeholder, y su cabecera ya no dice que `.env` es opcional ni que no hay variables.
- [ ] `README.md` (*Getting started*) dice que hay que copiar `.env.example` a `.env` y definir `APP_ACCESS_KEY`, y que sin ella el backend no arranca. `docs/ARCHITECTURE.md` dice lo mismo en *Auth* y en *Configuration*, y *Auth* ya no lleva *(later issue)*.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85% (líneas, sentencias, funciones y ramas), y el código nuevo queda cubierto.

## Non-functional notes
- Seguridad: la comparación es timing-safe (`crypto.timingSafeEqual`) y no depende del largo de la key. Una forma de lograrlo es comparar los hashes SHA-256 de los dos valores.
- La key nunca se loguea ni se devuelve. El logger por defecto de Fastify no serializa headers, y así tiene que quedar.
- Alcance: alcanza para una demo local en `127.0.0.1`. La key viaja en claro por HTTP y no hay rate limiting. No es auth para usuarios reales (ver *Deferred decisions* en `docs/ARCHITECTURE.md`).

## Assumptions
- **Deny-by-default.** Toda ruta salvo `/api/health` exige la key, incluidas las inexistentes, y la key se valida antes que el body.
  - Fuente: `docs/ARCHITECTURE.md`. En la tabla *Backend API*, todo endpoint salvo health requiere la key, y la sección *Auth* dice que el backend "returns `401` otherwise".
  - Además, así las rutas de #5 y #8 nacen protegidas y ninguna queda expuesta por olvido.
- **El mismo `401` genérico para cualquier fallo**, con el formato de error estándar de Fastify. Fuente: coherencia con los `404` y `500` que ya devuelve el scaffold. #4 solo necesita el status.
- **Esquema case-insensitive y `WWW-Authenticate: Bearer` en el `401`.** Fuente: el estándar HTTP (RFC 9110 §11.1 y §15.5.2: un `401` tiene que incluir el challenge).
- **Sin dependencias nuevas**: `node:crypto` en lugar de `@fastify/bearer-auth`. Fuente: `workflow/principles.md` (justificar cada dependencia y preferir la librería estándar). El chequeo son pocas líneas.
- **Sin `APP_ACCESS_KEY`, el backend no arranca.** Decisión propuesta en el refinamiento y confirmada por el usuario el 2026-10-19: si la variable falta o está vacía, el backend falla al iniciar con un error que la nombra y remite a `.env.example`, y el `.env` pasa a ser obligatorio para `npm run dev`.
  - Se descartaron arrancar con un warning y responder `401` en toda ruta protegida (daría `401` confusos en la UI) y arrancar con la auth desactivada (la API quedaría abierta por accidente).

## Deferred decisions
- **Endpoint para verificar la key** (p. ej. `GET /api/auth` → `204`), para que la pantalla de #4 valide la key apenas se ingresa.
  - No se agrega: no está en la tabla de endpoints de `docs/ARCHITECTURE.md`, y #4 no lo necesita.
  - Sin él, una key incorrecta se detecta en el primer request protegido: ese request devuelve `401` y #4 vuelve a pedir la key. Ese request llega enseguida, porque #5 carga el catálogo apenas se monta la pantalla principal.
  - Costo: entre #4 y #5 no hay ninguna ruta protegida real para probar la key a mano.

## Pull request
Branch: `feat/3-auth-access-key-backend` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- **`backend/src/auth.ts`:**
  - `readAccessKey`: falla si `APP_ACCESS_KEY` falta o está vacía, con un mensaje que nombra la variable y `.env.example`;
  - `hasValidAccessKey`: parsea `Bearer <key>` sin distinguir mayúsculas en el esquema, y compara la key exacta con SHA-256 + `timingSafeEqual`, así que funciona con cualquier largo.
- **`backend/src/app.ts`:** un hook `onRequest` deny-by-default. Toda ruta, actual, futura o inexistente, exige la key, salvo `GET /api/health`. Las rutas públicas se identifican por método y patrón de ruta.
  - Corre antes de la validación del body.
  - Ante un fallo responde un `401` genérico con el formato de Fastify y `WWW-Authenticate: Bearer`.
- **`backend/src/server.ts`:** lee la key antes de abrir nada. Sin ella, el backend no arranca.
- **Docs:**
  - `.env.example`: `APP_ACCESS_KEY` obligatoria, con un placeholder;
  - `README.md`: copiar `.env.example` a `.env` en la raíz, definir la key y cómo generar una aleatoria;
  - `docs/ARCHITECTURE.md`: *Auth* y *Configuration*.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (8 archivos, 75 tests). Una primera corrida falló porque los workers de Vitest del frontend no arrancaron a tiempo en frío ("Timeout waiting for worker to respond"). No toca este cambio, y las 3 corridas siguientes pasaron (ver follow-ups).
- Coverage: 100% en sentencias, ramas, funciones y líneas (umbral 85%); archivos nuevos o cambiados bajo el umbral: ninguno
- Manual (AC de arranque): pass.
  - `npm run dev -w backend` sin `APP_ACCESS_KEY` no escucha en `127.0.0.1:3000` y muestra `APP_ACCESS_KEY is not set. Copy .env.example to .env…`.
  - Con la variable:
    - health da `200` sin key;
    - una ruta inexistente da `401` (`WWW-Authenticate: Bearer`) sin key o con una key incorrecta, y `404` con la correcta;
    - la key no aparece en el log.
- Self-review: sin blockers. Se aplicaron las tres sugerencias:
  - rutas públicas por método y path;
  - `auth.ts` en la estructura del README;
  - cómo generar la key en el README.

  No se aplicó rechazar el placeholder al arrancar, porque las reglas de fortaleza quedan fuera de este issue. Va propuesto como follow-up. (separate agent)
- Security: pass. Hook deny-by-default con comparación timing-safe y un mismo `401` para cualquier fallo, sin la key en logs ni respuestas. No hay secretos: `.env.example` solo trae un placeholder.
- Docs: updated `.env.example`, `README.md`, `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
Propuestos, pendientes de aprobación:
- Estabilizar el arranque en frío de los workers de Vitest del frontend (el timeout hace fallar el gate de forma intermitente).
- Rechazar al arrancar el placeholder de `.env.example` como `APP_ACCESS_KEY`.
