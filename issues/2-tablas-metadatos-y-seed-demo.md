---
id: 2
title: Crear tablas de metadatos y seed demo
type: feat
status: open
parent: 1
created: 2026-10-19
---

Crear `data/data.db` con las tablas de metadatos que describen el dataset para el LLM, y un script `npm run seed` que las cree y cargue un dataset demo chico y genérico (ventas: clientes, productos, pedidos).

**Contexto**
- Metadatos: `meta_tables`, `meta_columns` y `meta_relationships`, con la descripción de cada tabla, columna y relación (diseño en `docs/ARCHITECTURE.md`, sección *Data*).
- El dataset demo vive en un único archivo de seed y es reemplazable: el código no debe depender de él (la app es agnóstica al dominio).
- La app abre `data.db` con una conexión **read-only**; solo el seed escribe.
- Comentario en el epic: "Ok con esto, armá el issue."
