---
id: 27
title: Evitar que los workers de Vitest del frontend fallen al arrancar
type: chore
status: closed
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
- [x] Se reporta la base, antes del cambio:
  - la duración de 3 corridas del gate solo;
  - en cuántas de 10 rondas bajo carga falló algún worker.
- [ ] **No cumplido, aceptado por el usuario (ver Notes):** después del cambio, 10 rondas seguidas bajo carga (20 gates) pasan:
  - sin "Failed to start forks worker", "Timeout waiting for worker to respond" ni "Timeout starting";
  - con todos los archivos de test corridos (los dos proyectos completos);
  - con cobertura ≥ 85%.
- [x] La mediana de 3 corridas del gate solo queda como mucho un 25% por encima de la mediana de la base. Se reportan los tiempos.
- [x] Sin reintentos, sin cambios en los tests y con los mismos umbrales de cobertura.
- [x] `docs/ARCHITECTURE.md` (*Quality gate*) y el comentario de `vitest.config.ts` registran la causa encontrada y la configuración elegida.
- [x] El ítem 1 de `issues/pendientes.md` se saca.

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

## Notes
- 2026-10-22: **El criterio de 10 rondas seguidas no se cumplió.** La causa encontrada en el repo fue que el `maxWorkers: 4` de #18 estaba en la config raíz, donde Vitest lo ignora, así que el pool usaba 27 workers. Pasarlo a cada proyecto bajó el arranque típico de los workers (backend de 20-30 s a 2-3 s; armado de jsdom de hasta 40 s a 2-6 s) y dejó el gate más rápido, pero la frecuencia de fallos no cambió de forma medible: 4 de 33 gates antes, 6 de 46 después. Los fallos que se vieron fueron trabas de toda la máquina, de alrededor de un minuto. La única que se midió coincidió con el antivirus al doble de su CPU habitual. Se frenó y se consultó, como dice *Expected behavior*. El usuario eligió mergear el arreglo igual (no probar más candidatos) y anotar en `issues/pendientes.md` la acción sobre el antivirus, que es de la máquina y no del repo.

## Pull request
Branch: `chore/27-workers-de-vitest-del-frontend` → `main`

### Qué hace
- Saca `maxWorkers: 4` del `vitest.config.ts` raíz, donde Vitest lo ignoraba, y lo pone en `backend/vitest.config.ts` y `frontend/vite.config.ts` con el mismo valor. Los dos proyectos comparten un pool, así que el límite es de 4 archivos a la vez en total. Hasta ahora el pool usaba el default, un worker por CPU: 27.
- Corrige el comentario del `testTimeout` del backend, que daba por hecho el tope de #18. El valor no cambia.
- `docs/ARCHITECTURE.md` (*Quality gate*): por qué el límite va en cada proyecto, lo medido y lo que queda.
- `issues/pendientes.md`: sale el ítem 1 (este issue), se renumeran los demás y entra en *Acciones tuyas* la exclusión del antivirus, a pedido del usuario.

### Diagnóstico
- El "started" que el padre espera, con el límite fijo de 60 s, se manda después de armar el entorno de test. En el frontend eso incluye jsdom.
- Con instrumentación temporal en los `node_modules` de los worktrees (no versionada, sacada con `npm ci`):
  - el pool usaba `maxWorkers` 27, no 4;
  - con 27 forks a la vez, los workers del backend tardaban 20-30 s en arrancar y el armado de jsdom llegó a 40 s, con un gate solo.
- Con 4: arranques de 2-6 s en las rondas normales, también con dos gates a la vez.
- Lo que queda son trabas de toda la máquina, de alrededor de un minuto:
  - los workers del frontend que arrancan juntos terminan su armado en el mismo instante;
  - en la misma ronda se demoran tests del backend.
- Con un registro de contadores del sistema, la ronda trabada tuvo `MsMpEng` al 214% de CPU de promedio (pico 589%), contra 78-140% en las otras 14. La CPU total y la memoria fueron las mismas.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (33 archivos, 532 tests). De 6 corridas oficiales en la rama, 3 fallaron por la traba de arranque (4 archivos del frontend sin arrancar, cobertura bajo el umbral). Fueron las 3 primeras después de una pausa, y sus repeticiones inmediatas pasaron. La última, sobre `6963648`, pasó.
- Coverage: 99,72% de líneas, sin cambios; umbral 85%. No se tocó código fuente.
- Criterios de aceptación:
  - **Base:**
    - gate solo en 96,1, 70,4 y 83,8 s (mediana 83,8 s);
    - bajo carga (dos gates a la vez, en el repo y un worktree, con `npm run dev` del usuario), 1 de 10 rondas falló: la 5, con los dos gates sin 9 archivos del frontend.
  - **10 rondas seguidas bajo carga: no cumplido.**
    - Falló la ronda 1: los dos gates, con 4 archivos del frontend sin arrancar cada uno y un test del backend con timeout. Coincidió con el antivirus al doble de lo habitual.
    - Las rondas 2-10 pasaron, con los 33 archivos y 99,72% de cobertura.
    - El usuario eligió mergear igual (ver Notes).
  - **Duración: pass.** Gate solo en 61,5, 180,6 (falló por la traba) y 65,3 s: mediana 65,3 s, un 22% menos que la base.
  - **Frecuencia total:** fallaron 4 de 33 gates antes y 6 de 46 después. No hay diferencia medible.
  - **Sin reintentos y sin cambios en los tests ni en los umbrales:** pass.
  - **Docs y comentarios:** pass.
  - **Ítem 1 de pendientes:** pass.
- Self-review: 2 rondas con un agente nuevo.
  - **Primera:** 2 bloqueantes, los dos corregidos. Uno era el criterio 2 sin la decisión del usuario registrada, y el otro, 3 líneas de `pendientes.md` en cp1252. Se aplicaron también sus sugerencias: los comentarios apuntan a la doc, y el antivirus figura como coincidencia, no como causa.
  - **Segunda:** sin bloqueantes. Se aplicaron sus sugerencias:
    - un solo pool, 27 workers en total;
    - números alineados y la mediana del gate solo;
    - la frecuencia real en lugar de "raro";
    - el comentario del backend sin una afirmación que no se midió;
    - esta sección con todos los números.
- Plan: aprobado por el usuario ("si", 2026-10-22). Después decidió mergear con el criterio 2 sin cumplir y anotar el antivirus en pendientes (2026-10-22).
- Security: no security surface touched
- Docs: updated `docs/ARCHITECTURE.md`, los comentarios de la config de Vitest e `issues/pendientes.md`

### Out of scope / follow-ups
- Excluir el repo del antivirus o usar un Dev Drive: es una acción de la máquina y quedó en `issues/pendientes.md` (*Acciones tuyas*).
- Probar el pool `threads` o `isolate: false` en el frontend: descartado por decisión del usuario. Bajaría la exposición, pero no evitaría una traba de alrededor de un minuto.
