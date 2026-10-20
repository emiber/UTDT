---
id: 19
title: Rechazar al arrancar el placeholder de APP_ACCESS_KEY
type: fix
status: closed
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

## Pull request
Branch: `fix/19-placeholder-de-app-access-key` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- `readAccessKey` (`backend/src/auth.ts`) lanza un error si `APP_ACCESS_KEY`, ya recortada, es el placeholder de `.env.example` (`ACCESS_KEY_PLACEHOLDER`). El mensaje dice que es el placeholder y trae el comando que genera un valor aleatorio. Cualquier otro valor no vacío se sigue aceptando tal cual.
- Un test chequea que la constante coincide con el valor que trae `.env.example`, así no se desincronizan.
- Docs: `README.md` (*Getting started*) y `docs/ARCHITECTURE.md` (*Auth*).

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (26 archivos, 377 tests)
- Coverage: 100% en sentencias, funciones y líneas, y 99,67% en ramas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno.
- Manual: pass. Con `APP_ACCESS_KEY=change-me-to-a-long-random-string`, el backend sale con código 1 y el mensaje del placeholder, antes de escuchar en el puerto.
- Self-review: inline. Es un chequeo de 4 líneas con sus tests.
- Plan: aprobado por el usuario ("Aplicá todos esos items", 2026-10-20).
- Security: pass. La key de ejemplo, que es pública, ya no puede proteger la API.
- Docs: updated `README.md`, `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
None
