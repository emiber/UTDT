---
id: 26
title: Separar el chat y el reporte de uso en rutas del frontend
type: feat
status: closed
parent:
created: 2026-10-21
---

## Goal
Que el chat y el reporte de uso tengan cada uno su propia URL en el frontend. Hoy los dos viven en la misma URL y se alterna con un botón (#25). Pedido del usuario: "quiero que el chat y el usage estén en rutas separadas en el front".

## Scope
- In:
  - **Router:** `vue-router` como dependencia del frontend, con el historial del navegador (URLs sin `#`).
    - `/chat` es el chat y `/usage` el reporte de uso.
    - `/` y cualquier ruta desconocida redirigen a `/chat`.
  - **Encabezado:** el botón que alternaba pasa a ser dos links, "Chat" y "Usage", y el de la ruta actual se marca.
  - **El chat conserva su conversación al navegar.** Queda montado (`KeepAlive`), igual que hoy, y vuelve a la posición del scroll donde estaba. Si una respuesta llegó mientras se estaba en `/usage`, al volver se ve esa respuesta.
    - Esto resuelve lo que la review de #25 dejó pendiente: con `v-show`, el hilo volvía arriba al cambiar de pantalla.
    - Recargar la página sigue empezando una conversación nueva, como hoy.
  - **Access key:** sin key se pide igual en cualquier ruta, y después se muestra la ruta pedida. Por ejemplo, abrir `/usage` sin key pide la key y después muestra el reporte.
  - **`/usage`** empieza siempre con los filtros por defecto (los últimos 7 días, por día), como hoy.
  - Tests y docs: `docs/ARCHITECTURE.md` (*Frontend*, la decisión diferida de router y el stack) y `README.md`.
- NOT in:
  - Poner los filtros de `/usage` en la URL. Lo descartó el usuario.
  - Servir el frontend desde el backend. En desarrollo, Vite ya devuelve `index.html` para cualquier ruta.

## Expected behavior
- Abrir `http://localhost:5173/` lleva a `/chat`, y `/algo` también.
- Desde el chat, el link "Usage" lleva a `/usage`, y atrás y adelante del navegador funcionan.
- Ir de `/chat` a `/usage` y volver mantiene la conversación, el texto escrito y la posición del scroll.

## Acceptance criteria
- [x] `/chat` y `/usage` muestran cada pantalla. `/` y una ruta desconocida redirigen a `/chat` (tests).
- [x] Los links del encabezado navegan, y el de la ruta actual queda marcado (tests).
- [x] Ir y volver entre `/chat` y `/usage` conserva la conversación y lo escrito. Al volver, el hilo queda donde estaba, o en la respuesta que llegó mientras tanto (tests).
- [x] Sin key, cualquier ruta pide la key y después muestra esa ruta (test).
- [x] Verificación manual en el navegador con `npm run dev`.
- [x] Docs actualizados.
- [x] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- **`vue-router`** y no un ruteo a mano: es el router oficial de Vue y escala si se suman pantallas. Lo eligió el usuario.
- **Rutas `/chat` y `/usage`**, con `/` redirigiendo a `/chat`. Las propuse yo y el usuario aprobó el plan.

## Pull request
Branch: `feat/26-rutas-chat-y-usage` → `main`

### What it does
- **Rutas** (`frontend/src/router.ts`, `main.ts`): `vue-router` 4 con el historial del navegador. `/chat` es el chat y `/usage` el reporte de uso. `/` y cualquier ruta desconocida redirigen a `/chat`.
- **Encabezado** (`App.vue`): los links "Chat" y "Usage" reemplazan al botón que alternaba. El de la ruta actual queda marcado (`aria-current="page"`).
- **Chat vivo:** `<RouterView>` con `<KeepAlive include="ChatView">` mantiene el chat vivo en `/usage`, con la conversación y lo escrito.
- **Vuelta al chat** (`ChatView.vue`): guarda la posición del scroll en cada scroll y la restaura al volver. Si llegó una respuesta mientras tanto, muestra esa respuesta y devuelve el foco al input. Una vuelta sin respuesta nueva no mueve el foco.
- **Access key:** se pide en cualquier ruta, y después se muestra la ruta pedida.
- **Docs:** `docs/ARCHITECTURE.md` (*Frontend*, *Usage report*, el stack y la decisión diferida, que ya no incluye el router) y `README.md`.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (32 archivos, 507 tests). Algunas corridas tuvieron el flake de arranque de los workers del frontend; al repetirlas pasaron.
- Coverage: 100% de líneas, 99,79% de sentencias y 97,59% de ramas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno.
- Build: `npm run build -w frontend` — pass, con `vue-router` 4.
- Manual: pass, en Edge headless contra el `npm run dev` del usuario, con `vue-router` 5.
  - `/` y `/nowhere` llevaron a `/chat`.
  - Los links navegaron y marcaron la página actual.
  - De `/chat` a `/usage` y vuelta, el scroll quedó en 250 y se conservó lo escrito. Una respuesta que llegó estando en `/usage` quedó a la vista al volver.
  - Atrás del navegador y recargar en `/usage` funcionaron.
  - La review lo repitió en Chrome headless contra el build de producción, con una API simulada. Agregó dos casos: la key pedida en `/usage` y un 401 en `/usage`. También pasaron.
  - Después de la review se pasó a `vue-router` 4, que tiene la misma API. Ese cambio quedó cubierto por los tests de `App` con el router real y por el build. No se repitió en el navegador: el servidor de desarrollo del usuario ya no estaba corriendo.
- Self-review: 1 ronda en un subagente nuevo, sin blockers. Sus sugerencias se aplicaron y verificaron inline, porque son cambios chicos con sus tests:
  - `vue-router` 4 en lugar de 5: una dependencia en lugar de 35;
  - no mover el foco en una vuelta sin respuesta nueva;
  - tests del guard del scroll y del foco;
  - sacar nombres de rutas que no se usaban.
- Plan: aprobado por el usuario el 2026-10-21. El usuario eligió `vue-router` y dejar los filtros fuera de la URL.
- Security: no security surface touched. La dependencia nueva, `vue-router` 4.6.4, es el router oficial de Vue y viene de registry.npmjs.org. `npm audit` no se pudo correr: se cortó por timeout (`ETIMEDOUT`).
- Docs: updated `docs/ARCHITECTURE.md`, `README.md`

### Out of scope / follow-ups
- Los filtros de `/usage` en la URL: el usuario los descartó.
- Un 401 sigue llevando a la pantalla de la key y descarta el chat, como antes de este cambio.
