---
id: 20
title: Rediseñar la UI del chat con input fijo, mensajes diferenciados y un estilo más cuidado
type: feat
status: refined
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
