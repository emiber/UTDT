---
id: 26
title: Separar el chat y el reporte de uso en rutas del frontend
type: feat
status: refined
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
- [ ] `/chat` y `/usage` muestran cada pantalla. `/` y una ruta desconocida redirigen a `/chat` (tests).
- [ ] Los links del encabezado navegan, y el de la ruta actual queda marcado (tests).
- [ ] Ir y volver entre `/chat` y `/usage` conserva la conversación y lo escrito. Al volver, el hilo queda donde estaba, o en la respuesta que llegó mientras tanto (tests).
- [ ] Sin key, cualquier ruta pide la key y después muestra esa ruta (test).
- [ ] Verificación manual en el navegador con `npm run dev`.
- [ ] Docs actualizados.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- **`vue-router`** y no un ruteo a mano: es el router oficial de Vue y escala si se suman pantallas. Lo eligió el usuario.
- **Rutas `/chat` y `/usage`**, con `/` redirigiendo a `/chat`. Las propuse yo y el usuario aprobó el plan.
