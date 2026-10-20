---
id: 19
title: Rechazar al arrancar el placeholder de APP_ACCESS_KEY
type: fix
status: refined
parent: 1
created: 2026-10-20
---

## Goal
Que el backend no arranque con la key de ejemplo de `.env.example` (`change-me-to-a-long-random-string`). Hoy alguien que copia el archivo y se olvida de cambiarla tiene la API protegida por una key pública. Follow-up de #3.

## Scope
- In: `readAccessKey` (`backend/src/auth.ts`) lanza un error si el valor, ya recortado, es igual al placeholder. El mensaje explica que hay que reemplazarlo por un valor aleatorio largo y nombra el comando del README que lo genera. Tests y una línea en `README.md` y `docs/ARCHITECTURE.md` (*Auth*).
- NOT in: exigir un largo mínimo o una complejidad para la key; rechazar los placeholders de las variables de OpenAI.

## Acceptance criteria
- [ ] Con `APP_ACCESS_KEY=change-me-to-a-long-random-string`, con o sin espacios alrededor, `readAccessKey` lanza un error que dice que es el placeholder.
- [ ] Cualquier otro valor no vacío sigue aceptándose.
- [ ] `README.md` y `docs/ARCHITECTURE.md` lo mencionan.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Deferred decisions
- Rechazar también los placeholders de `OPENAI_API_KEY` y `OPENAI_MODEL`: no se pidió, y con ellos el backend arranca pero cada pregunta da `502` con el motivo en el log.
