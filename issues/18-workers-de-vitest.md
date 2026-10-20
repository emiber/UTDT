---
id: 18
title: Estabilizar el arranque de los workers de Vitest
type: chore
status: refined
parent: 1
created: 2026-10-20
---

## Goal
Que `npm run test:coverage` no falle de vez en cuando con "Timeout waiting for worker to respond" en el frontend, ni con timeouts de 5 s en el primer test de un archivo del backend. Hoy el gate a veces hay que correrlo dos veces. Follow-up de #3 y #8.

## Scope
- In:
  - **La causa:** esta máquina tiene 28 CPUs, y Vitest arranca por defecto un worker por CPU menos uno: 27 forks a la vez, con jsdom y cobertura. En Windows eso pasa el tiempo fijo de 60 s que Vitest le da a cada worker para arrancar.
  - **El arreglo:** acotar `maxWorkers` en el `vitest.config.ts` raíz. El valor se elige midiendo la duración y la estabilidad del gate.
  - Sacar el `testTimeout` de 20 s que #8 puso en `backend/vitest.config.ts`, si con el tope ya no hace falta.
  - Docs (`docs/ARCHITECTURE.md`, *Quality gate*).
- NOT in: cambiar de pool (forks/threads) ni la cantidad de tests.

## Acceptance criteria
- [ ] 5 corridas seguidas de `npm run test:coverage` pasan sin "Timeout waiting for worker" ni tests que pasen el timeout.
- [ ] La duración del gate no empeora. Se reportan los tiempos antes y después.
- [ ] El `testTimeout` de 20 s del backend se saca o, si sigue haciendo falta, queda justificado.
- [ ] `docs/ARCHITECTURE.md` registra el tope y el motivo.
