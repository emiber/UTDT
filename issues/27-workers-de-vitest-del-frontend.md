---
id: 27
title: Evitar que los workers de Vitest del frontend fallen al arrancar
type: chore
status: refined
parent:
created: 2026-10-22
---

## Goal
Que `npm run test:coverage` no falle porque un worker de Vitest del frontend no llegó a arrancar ("Failed to start forks worker", causado por "Timeout waiting for worker to respond"). Cuando pasa, esos archivos no corren, la cobertura cae por debajo del 85% y el gate queda en rojo sin un error en el código. Hoy hay que repetirlo, y a veces frena un merge. Follow-up de #18.

## Scope
- In:
  - **Medir antes de cambiar:**
    - la duración del gate solo (sin nada más corriendo), que es la base;
    - la tasa de fallos bajo carga, para reproducir el problema.
  - **Encontrar la causa:** por qué un worker del frontend tarda más de 60 s en responder. El backend nunca falló, así que la sospecha está en lo propio del frontend: el entorno jsdom, el plugin de Vue, la cobertura y los imports.
  - **Arreglarla con la configuración de Vitest:** el `vitest.config.ts` raíz y/o la sección `test` de `frontend/vite.config.ts`. Las ideas anotadas son candidatas, no decisiones: el pool `threads` en lugar de `forks`, menos workers, correr los proyectos en serie o un arranque más liviano del frontend. Se elige midiendo.
  - **Docs:**
    - `docs/ARCHITECTURE.md`, en *Quality gate*;
    - el comentario de `maxWorkers` en `vitest.config.ts`, con la causa y la elección;
    - sacar el ítem 1 de `issues/pendientes.md`.
- NOT in:
  - Reintentos automáticos de la corrida o de los archivos que no arrancaron.
  - Subir el timeout de arranque. Son 60 s fijos en el código de Vitest 5 (`START_TIMEOUT = 6e4` en `node_modules/vitest/dist/chunks/`), sin opción de configuración. Parchear `node_modules` también queda fuera.
  - Tocar los tests o su cantidad, bajar los umbrales de cobertura o excluir archivos del frontend de la cobertura.
  - El `testTimeout` de 20 s del backend (#8).
  - Cambiar la versión de Vitest o sumar dependencias. Si la medición muestra que es la única salida, se consulta antes de hacerlo.

## Expected behavior
- Normal case: el gate corre todos los archivos de test de los dos proyectos y pasa, también cuando la máquina está cargada.
- Edge cases:
  - **La condición de carga** es la de dos sesiones trabajando a la vez:
    - dos `npm run test:coverage` al mismo tiempo, en dos copias del repo (el repo y un worktree), porque en la misma carpeta los dos escribirían el mismo `coverage/`;
    - con `npm run dev` corriendo, el del usuario si está levantado o uno propio si no. Solo se cortan los procesos propios.
- Errors:
  - Si la condición de carga no reproduce el fallo en 10 rondas, se frena antes de cambiar la configuración. Se reporta lo medido y se consulta.
  - Si ninguna configuración cumple los criterios sin pasar el +25%, también se frena y se reporta con los números.

## Acceptance criteria
- [ ] Se reporta la base, antes del cambio:
  - la duración de 3 corridas del gate solo;
  - en cuántas de 10 rondas bajo carga falló algún worker.
- [ ] Después del cambio, 10 rondas seguidas bajo carga (20 gates) pasan:
  - sin "Failed to start forks worker", "Timeout waiting for worker to respond" ni "Timeout starting";
  - con todos los archivos de test corridos (los dos proyectos completos);
  - con cobertura ≥ 85%.
- [ ] La mediana de 3 corridas del gate solo queda como mucho un 25% por encima de la mediana de la base. Se reportan los tiempos.
- [ ] Sin reintentos, sin cambios en los tests y con los mismos umbrales de cobertura.
- [ ] `docs/ARCHITECTURE.md` (*Quality gate*) y el comentario de `vitest.config.ts` registran la causa encontrada y la configuración elegida.
- [ ] El ítem 1 de `issues/pendientes.md` se saca.

## Dependencies
Ninguna. Antecedentes: #18 (`maxWorkers: 4`) y #8 (el `testTimeout` del backend).

## Non-functional notes
- La máquina tiene 28 CPUs, con Windows 11. El fallo se vio con Vitest 5.0.5 y cobertura v8.
- El gate no tiene CI: corre a mano, en esta máquina, y a veces lo corren dos sesiones a la vez.

## Assumptions
Decisiones propuestas y confirmadas en el refinamiento (2026-10-22):
- **Condición de carga:** dos gates a la vez y `npm run dev`. La verificación es de 10 rondas seguidas en esa condición.
- **Duración:** el gate solo puede quedar hasta un 25% más lento que hoy, si eso compra estabilidad.
- **Reintentos:** no, se arregla la causa.

Inferido para implementar esas decisiones:
- **Copias del repo:** los dos gates corren en dos copias separadas, porque en la misma carpeta pisarían `coverage/`.
- **Base del 25%:** el gate solo, sin carga. Bajo carga es más lento por naturaleza.
- **Si no se reproduce:** se frena y se consulta, en lugar de cambiar la configuración a ciegas.

## Deferred decisions
- **Reintentos de los workers que no arrancan:** descartados. Taparían la causa y alargarían el gate justo cuando la máquina está cargada.
- **El `testTimeout` del backend:** sigue como está. Es otro síntoma, y el backend no falla al arrancar.

## Context
- Pasó 3 veces el 2026-10-21, y una más ese día en la rama de `npm run prices`: 6 archivos del frontend no arrancaron (entre ellos `ChatView.test.ts` y `UsageView.test.ts`) y la cobertura cayó al 83%.
- Antes de eso quedó registrado en las verificaciones de #3, #6, #12, #13, #23, #25 y #26, siempre en el frontend y siempre resuelto al repetir.
