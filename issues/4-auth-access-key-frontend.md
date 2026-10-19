---
id: 4
title: Agregar pantalla de access key en el frontend
type: feat
status: open
parent: 1
created: 2026-10-19
---

Pantalla que pide la access key antes de usar la app y la manda en cada request a la API.

**Contexto**
- La key se guarda en `sessionStorage` y viaja como `Authorization: Bearer <key>`.
- Ante un `401`, la app vuelve a pedir la key.
- Depende de #3 (backend). Comentario en el epic: cada issue con sus tests.
- Diseño en `docs/ARCHITECTURE.md`, secciones *Backend API* y *Frontend*.
