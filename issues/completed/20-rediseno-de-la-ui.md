---
id: 20
title: Rediseñar la UI del chat con input fijo, mensajes diferenciados y un estilo más cuidado
type: feat
status: closed
parent: 1
created: 2026-10-20
---

## Goal
Que el chat se use y se vea como un producto. Pedido del usuario, sobre una captura de la UI actual:
- "La parte donde se ingresa la pregunta quiero que esté fijada abajo y el resto del chat que scrollee."
- "No se diferencia mucho la pregunta de la respuesta. Quiero que se vea bien claro."
- "El diseño tiene cero onda. Ponele algo de onda de diseño, alguna fuente linda, y que se vea más copado y profesional."

## Scope
- In:
  - **Layout de pantalla completa:**
    - un encabezado arriba, con la marca, el estado del backend y el acceso a *Available data*;
    - el hilo en el medio, que es lo único que scrollea;
    - el input de la pregunta fijo abajo.
  - **Hilo:** cuando se manda una pregunta, se baja hasta ella. Cuando llega la respuesta, el principio de esa respuesta queda a la vista.
  - **Mensajes bien distintos:** la pregunta es una burbuja a la derecha, en el color principal y con texto blanco. La respuesta es una tarjeta a la izquierda, blanca, con borde y un avatar del asistente.
  - **Estilo:**
    - la fuente Inter, servida localmente con `@fontsource-variable/inter` (la única dependencia nueva);
    - una paleta con un color principal (índigo), bordes redondeados y sombras suaves, en los tokens de SCSS;
    - tablas con encabezado marcado y los números alineados a la derecha;
    - sugerencias como chips;
    - un indicador animado de "Thinking…";
    - un estado vacío de bienvenida;
    - la pantalla de la key como una tarjeta centrada.
  - *Available data* pasa a un botón del encabezado que abre el catálogo en un panel desplegable con scroll propio. Sigue siendo un `<details>` nativo y se pide igual al montar.
  - Los gráficos usan la misma fuente.
  - Tests ajustados a la nueva estructura y `docs/ARCHITECTURE.md` (*Frontend*).
- NOT in:
  - Cambiar el comportamiento del chat, el contrato con el backend o los textos que hoy verifican los tests ("Thinking…", los errores, "Available data").
  - Modo oscuro, responsive avanzado o un UI kit.

## Acceptance criteria
- [ ] Con un hilo largo, el input queda fijo abajo y solo el hilo scrollea. Se verifica en un navegador real con una captura.
- [ ] La pregunta y la respuesta se distinguen a simple vista: lado, color y forma distintos. Se verifica con una captura.
- [ ] La UI usa Inter, servida localmente.
- [ ] Al mandar una pregunta, el hilo baja hasta ella, y al llegar la respuesta, su principio queda a la vista.
- [ ] *Available data* sigue cerrado al montar, se pide al montar, y su panel scrollea si el catálogo es largo.
- [ ] La única dependencia nueva es `@fontsource-variable/inter`, en `frontend/package.json`.
- [ ] `npm run lint`, `npm run test:coverage` (umbral de 85%) y `npm run build -w frontend` pasan.

## Assumptions
- La fuente (Inter), el color principal (índigo) y el estilo de las burbujas los elijo yo dentro del pedido "algo de onda, una fuente linda, más profesional". El usuario los revisa con las capturas.
- La fuente va servida localmente, no desde Google Fonts: la app es local y así no depende de la red ni manda requests a terceros.

## Pull request
Branch: `feat/20-rediseno-de-la-ui` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- **Layout de pantalla completa** (`App.vue`, `ChatView.vue`):
  - un encabezado con la marca (`BrandMark.vue`), el estado del backend como pastilla y el botón *Available data*;
  - el hilo, que es lo único que scrollea;
  - el input fijo abajo, en una barra redondeada con el botón de enviar.
- **Hilo:** al mandar una pregunta baja hasta ella, y al llegar la respuesta sube hasta donde empieza ese turno, así una tabla larga no tapa la narrativa. Hay un mensaje de bienvenida hasta la primera pregunta.
- **Mensajes:** la pregunta es una burbuja a la derecha, con el degradado índigo y texto blanco. La respuesta es una tarjeta blanca a la izquierda, con borde, sombra y el avatar del asistente. El "Thinking…" tiene puntos animados.
- **Estilo:**
  - Inter servida localmente (`@fontsource-variable/inter`, la única dependencia nueva) y tokens de diseño en `styles/_tokens.scss`;
  - las tablas se ajustan al contenido, con encabezado fijo y los números (y sus encabezados) a la derecha;
  - sugerencias como chips, gráficos con la misma fuente y la pantalla de la key como tarjeta centrada;
  - el catálogo abre como un panel desplegable con scroll propio y sigue siendo un `<details>` cerrado que se pide al montar.
- **Accesibilidad:** el chat es el `<main>`. Los textos de estado, error y gris tienen contraste AA (4,5:1), y el label del input queda oculto visualmente pero accesible.
- **Docs:** `docs/ARCHITECTURE.md` (*Frontend* y *Tech stack*).

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (26 archivos, 380 tests)
- Coverage: 100% en sentencias, funciones y líneas, y 99,07% en ramas (umbral 85%). Las ramas sin cubrir son dos guardas defensivas de `ChatView.vue` (`?? 0` e `if (scroller.value)`). Archivos nuevos o cambiados bajo el umbral: ninguno.
- Build: `npm run build -w frontend` — pass. Inter entra como woff2 locales.
- Manual: pass, en un navegador real (Edge headless, 1280x800) contra el backend real.
  - El input termina justo en el borde inferior (800 de 800), la página no scrollea y el hilo sí.
  - Inter está cargada (`document.fonts.check`).
  - Capturas revisadas, en `C:/Users/EMILIA~1.BER/AppData/Local/Temp/claude/c--repositories-UTDT/2bb691f6-49ba-46bf-80dc-e30367d1f1ac/scratchpad`:
    - `20-key.png`: la pantalla de la key;
    - `20-empty.png`: la bienvenida;
    - `20-thread.png`, `20-thread-top.png` y `20-thread-top2.png`: el hilo, con burbujas, tablas y doughnut;
    - `20-catalog.png`: el panel del catálogo.
- Self-review: 1 ronda con agente separado, sin blockers. Sugerencias aplicadas:
  - contraste AA;
  - landmark `<main>`;
  - encabezados numéricos alineados;
  - un test de scroll que detecta un error de índice, con el mock restaurado en `afterEach`;
  - el borde del encabezado fijo.

  Los ajustes son chicos, cada uno con su test, y se verificaron con el gate. (separate agent)
- Plan: pedido del usuario el 2026-10-20, con sus tres puntos.
- Security: no security surface touched. `v-html` y micromark no cambian, y la fuente se sirve localmente, sin requests a terceros.
- Docs: updated `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
- Nombres de columna legibles en tablas y gráficos: pedido del usuario a mitad del trabajo, va en #21.
