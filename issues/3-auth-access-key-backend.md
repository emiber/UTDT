---
id: 3
title: Agregar autenticación con access key en el backend
type: feat
status: open
parent: 1
created: 2026-10-19
---

Proteger la API con una access key compartida, definida en `APP_ACCESS_KEY` (`.env`).

**Contexto**
- El cliente manda `Authorization: Bearer <key>`. El backend la compara de forma timing-safe y responde `401` si no coincide.
- `/api/health` sigue siendo público.
- Agrega `APP_ACCESS_KEY` a `.env.example` con un placeholder.
- Diseño en `docs/ARCHITECTURE.md`, sección *Backend API*.
- Comentario en el epic: un issue para el back y otro para el front (#4), cada uno con sus tests.
