---
id: 4
title: Agregar pantalla de access key en el frontend
type: feat
status: refined
parent: 1
created: 2026-10-19
---

## Goal
Que la app pida la access key compartida antes de dejar usarla, la mande en cada request a la API y la vuelva a pedir cuando el backend la rechaza (`401`). Es la mitad frontend de la autenticación; el backend la valida en #3.

## Scope
- In:
  - Pantalla de access key: un formulario con un campo enmascarado (`type="password"`) y un botón para entrar. Se muestra al abrir la app cuando no hay key guardada.
  - Guardar la key en `sessionStorage` al enviar el formulario y pasar a la pantalla principal. Hoy la pantalla principal es el estado del backend del scaffold; #5 y #8 la van a extender.
  - Cambio de pantalla según haya o no key, en `App.vue`, sin router ni librería de estado (`docs/ARCHITECTURE.md`, *Frontend*).
  - Una única función de request en `frontend/src/api.ts` por la que pasan todas las llamadas a `/api/*` (el plan define su nombre). Agrega `Authorization: Bearer <key>` y maneja el `401`. `getHealth` pasa a usarla.
  - Manejo del `401`: borrar la key de `sessionStorage` y volver a la pantalla de key con un mensaje de que la key fue rechazada.
  - Tests unitarios y actualización de docs (`README.md` y la sección *Frontend* de `docs/ARCHITECTURE.md`).
- NOT in:
  - Validar la key en el backend (#3).
  - Validar la key contra el backend apenas se ingresa: no hay endpoint para eso (ver *Assumptions*).
  - Botón de logout o de cambiar la key.
  - Guardar la key en `localStorage`, en cookies o en cualquier otro lado, o recordarla entre pestañas.
  - La vista de catálogo (#5) y el chat (#8). Solo usan la función de request de este issue.
  - Router, librería de estado y UI kit (`docs/ARCHITECTURE.md`, *Frontend*).

## Expected behavior
- Caso normal:
  1. Sin key en `sessionStorage`, la app abre en la pantalla de access key. No se ve la pantalla principal y no se llama a la API.
  2. El usuario escribe la key y envía el formulario (botón o Enter). La key se guarda en `sessionStorage` sin espacios al inicio ni al final, y la app pasa a la pantalla principal.
  3. La pantalla principal hace sus llamadas como hoy (`GET /api/health`), y cada una lleva `Authorization: Bearer <key>`.
- Casos borde:
  - Key vacía o solo con espacios: no se puede enviar. No se guarda nada y la app sigue en la pantalla de key.
  - Recargar la pestaña: la key sigue en `sessionStorage`, así que la app abre directo en la pantalla principal, sin volver a pedirla.
  - Otra pestaña, o cerrar y reabrir la pestaña: `sessionStorage` es por pestaña, así que la app vuelve a pedir la key.
  - Key incorrecta mientras la única llamada sea `GET /api/health`: no se detecta, porque health es público y responde `200` con cualquier key (#3). Se detecta en la primera llamada protegida, que llega con #5.
  - Varias llamadas que reciben `401` a la vez: el resultado es el mismo que con una sola.
  - En el primer ingreso, la pantalla de key no muestra ningún mensaje de error.
- Errores:
  - `401` en cualquier llamada, ya sea por una key incorrecta o porque `APP_ACCESS_KEY` cambió en el backend:
    - se borra la key de `sessionStorage`;
    - la app vuelve a la pantalla de key con un mensaje de key rechazada (p. ej. *Access key rejected. Enter it again.*);
    - la promesa de esa llamada se rechaza, así que el llamador no recibe datos.
    - Los llamadores no tienen que manejar el `401` por su cuenta.
  - Cualquier otro error (otro status HTTP o error de red): la key se conserva, la pantalla no cambia y el error le llega al llamador como hoy. P. ej., la pantalla principal sigue mostrando *Backend unreachable: …*.
  - Si el error es una respuesta HTTP, el error rechazado expone su status (p. ej. un campo `status`). Así cada llamador puede mostrarlo o decidir según él: #5 muestra `HTTP 500`, y #8 trata distinto el `404` de un `conversationId` inexistente.

## Data
- Entrada: la key que escribe el usuario.
- Persistido: la key, en una única entrada de `sessionStorage` (el nombre lo define el plan), y en ningún otro lado.
- Salida: el header `Authorization: Bearer <key>` en cada request a `/api/*`.
- Para la auth, de las respuestas solo importa el status `401`. El body no se lee, así que el frontend no depende del formato de error de #3.

## Dependencies
- Depende de #3: el backend responde `401` cuando la key falta o es incorrecta, y `/api/health` sigue público. Los tests de este issue no lo necesitan, porque stubbean `fetch`.
- Bloquea a #5 y #8: sus llamadas a la API pasan por la función de request de este issue, así que heredan el header y el manejo del `401`.
- Sin servicios externos ni dependencias nuevas.

## Acceptance criteria
- [ ] Sin key en `sessionStorage`, la app muestra la pantalla de access key, no la principal, y no hace ninguna llamada a la API.
- [ ] La key se ingresa en un campo `type="password"`. Al enviar el formulario con una key no vacía, se guarda en `sessionStorage` sin espacios al inicio ni al final, y la app muestra la pantalla principal.
- [ ] Una key vacía o solo con espacios no se guarda, y la app sigue en la pantalla de key.
- [ ] Con una key ya guardada en `sessionStorage`, la app abre directo en la pantalla principal.
- [ ] Todas las llamadas del cliente de API, incluida `GET /api/health`, llevan `Authorization: Bearer <key>`.
- [ ] Ante un `401`:
  - se borra la key de `sessionStorage`;
  - la app vuelve a la pantalla de key con un mensaje de key rechazada, que no aparece en el primer ingreso;
  - la llamada se rechaza.
- [ ] Ante un error que no es `401` (otro status o error de red), la key se conserva, la pantalla no cambia y el error le llega al llamador. Si fue una respuesta HTTP, el error expone el status (test con un `500` y un `404`).
- [ ] Tests unitarios cubren estos casos, con Vitest, `fetch` stubbeado y el `sessionStorage` de jsdom. Los casos actuales de health de `App.test.ts` se mantienen, ahora con una key guardada.
- [ ] `npm run lint` y `npm run test:coverage` pasan con ≥ 85% en todas las métricas, y el código nuevo queda cubierto.
- [ ] `README.md` (*Status*) y `docs/ARCHITECTURE.md` (*Frontend*) dicen que la app pide la access key, o sea el valor de `APP_ACCESS_KEY` en `.env` (#3), antes de mostrar la pantalla principal.

## Non-functional notes
- Seguridad:
  - La key vive solo en `sessionStorage`, que es por pestaña y se borra al cerrarla.
  - Nunca va en la URL, en `localStorage`, en cookies ni en logs (`console`).
  - Cualquier script de la página puede leer `sessionStorage`. Alcanza para una demo local (`docs/ARCHITECTURE.md`, *Auth*: "Enough for a local demo").
- Sin dependencias nuevas.
- Textos de la UI en inglés y hardcodeados. Estilos en SCSS, con los tokens existentes (`docs/ARCHITECTURE.md`, *Frontend*).

## Assumptions
- **No se valida la key al ingresarla.**
  - Fuente: `docs/ARCHITECTURE.md`. La tabla *Backend API* no tiene un endpoint para chequearla, y *Auth* describe el flujo completo: pedir la key, guardarla, mandarla y que el backend responda `401` si no coincide.
  - #3 difiere ese endpoint "solo si el refinamiento de #4 lo necesita", y este issue no lo necesita: la primera llamada protegida ya cumple esa función.
  - Consecuencia: hasta #5, una key incorrecta no se detecta en la UI. Los tests unitarios cubren el `401` igual.
- **Hasta que existan #5 y #8, la pantalla principal es la del estado del backend, y el health check corre recién después de ingresar la key.** Fuente: `docs/ARCHITECTURE.md`, *Frontend*: primero la pantalla de access key y después la de la app, dos pantallas que cambian según el estado de auth.
- **El header también va a `GET /api/health`, aunque sea público.**
  - Fuente: `docs/ARCHITECTURE.md`, *Auth* ("sends `Authorization: Bearer <key>`", sin excepciones).
  - Así hay un solo camino para todas las llamadas. Es inofensivo, porque #3 ignora el header en health, y permite ver el header en el navegador antes de #5.
- **Cualquier `401` significa key rechazada.** Fuente: `docs/ARCHITECTURE.md`, *Auth*, y #3: el `401` solo lo devuelve el chequeo de la key.
- **Volver a pedir la key ante un `401`, con un mensaje.**
  - Es un hecho técnico: sin logout y con la key en `sessionStorage`, volver a pedirla es la única forma de salir de una key incorrecta o de una `APP_ACCESS_KEY` que cambió.
  - Sin el mensaje, ese caso no se distinguiría del primer ingreso.
- **El error expone el status HTTP.** Fuente: lo necesitan los issues que usan esta función. #5 muestra el status en su mensaje de error y #8 reacciona a un `404`. Se agregó en la pasada de coherencia entre issues.
- **Campo enmascarado y `trim`.**
  - La key es un secreto compartido: vive en `.env`, que está gitignored (`docs/ARCHITECTURE.md`, *Configuration*).
  - Recortar los espacios evita fallas por copiar y pegar. Es coherente con #3, que compara la key exacta, porque una `APP_ACCESS_KEY` con espacios al inicio o al final no es un caso real.
  - Además, `fetch` ya recorta los espacios del final del valor de un header, así que la key guardada y la enviada son la misma.

## Deferred decisions
- **Validar la key apenas se ingresa**, con un endpoint de chequeo en #3. No está en el diseño aprobado. Revisar si molesta que una key incorrecta se detecte recién en la primera llamada protegida.
- **Logout o cambiar la key.** Cerrar la pestaña la borra, y un `401` la vuelve a pedir.
- **Recordar la key entre pestañas** con `localStorage`. `docs/ARCHITECTURE.md` eligió `sessionStorage`.
