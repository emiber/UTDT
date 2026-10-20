---
id: 18
title: Estabilizar el arranque de los workers de Vitest
type: chore
status: closed
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

## Pull request
Branch: `chore/18-workers-de-vitest` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- `vitest.config.ts` (raíz) suma `maxWorkers: 4`, con un comentario que explica el motivo. Por defecto, Vitest arrancaba un worker por CPU menos uno: 27 forks a la vez en esta máquina de 28 CPUs, con jsdom y cobertura. En Windows eso pasaba su timeout fijo de 60 s para arrancar un worker.
- `backend/vitest.config.ts` pierde el `testTimeout` de 20 s que había puesto #8: con el tope ya no hace falta.
- `docs/ARCHITECTURE.md` (*Quality gate*) registra el tope y el motivo.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass. Las mediciones, todas con 373 tests:
  - antes, con el default de 27 workers: 115, 71 y 138 s;
  - con `maxWorkers: 8`: 50, 110 y 78 s;
  - con `maxWorkers: 4`: 56, 50 y 53 s;
  - con `maxWorkers: 4` y sin el timeout del backend, 5 corridas seguidas: 56, 55, 46, 62 y 55 s, sin "Timeout waiting for worker" ni tests que pasaran el timeout.
- Coverage: sin cambios (100% de líneas; umbral 85%).
- Self-review: inline. Es un cambio de configuración de 3 líneas más una nota en el doc, y las mediciones son la verificación.
- Plan: aprobado por el usuario ("Aplicá todos esos items", 2026-10-20).
- Security: no security surface touched
- Docs: updated `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
None
