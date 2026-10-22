---
id: 27
title: Evitar que los workers de Vitest del frontend fallen al arrancar
type: chore
status: open
parent:
created: 2026-10-22
---

Con la máquina cargada, algunos workers de Vitest del frontend no llegan a arrancar: "Failed to start forks worker", causado por "Timeout waiting for worker to respond". Esos archivos de test no corren, la cobertura cae por debajo del 85% y `npm run test:coverage` falla sin que haya un error en el código. Al repetir, pasa.

## Contexto

- Follow-up de #18, que acotó `maxWorkers` a 4 en `vitest.config.ts` por el mismo síntoma. Desde entonces pasa menos, pero sigue pasando.
- Pasó 3 veces el 2026-10-21, y una más ese día en la rama de `npm run prices`: 6 archivos del frontend no arrancaron (entre ellos `ChatView.test.ts` y `UsageView.test.ts`) y la cobertura cayó al 83%.
- El `testTimeout` de 20 s del backend (`backend/vitest.config.ts`, #8) es un parche de la misma familia.
- Ideas anotadas en `issues/pendientes.md` (ítem 1), sin evaluar todavía:
  - medir qué tarda en el arranque en frío (el entorno jsdom, los imports);
  - probar el pool `threads` en lugar de `forks`;
  - correr los dos proyectos en serie;
  - subir el timeout de arranque de los workers.
