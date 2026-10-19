---
id: 5
title: Exponer el catálogo de datos (GET /api/catalog) y mostrarlo en el frontend
type: feat
status: open
parent: 1
created: 2026-10-19
---

Endpoint `GET /api/catalog` que devuelve lo que el bot "sabe" de los datos, y una vista en el frontend que lo muestre.

**Contexto**
- Comentario en el epic: tiene que traer el detalle de las tablas y las columnas, junto con sus relaciones e índices.
- Tablas, columnas y relaciones salen de las tablas de metadatos (#2). Los índices no están en los metadatos: probablemente salgan del propio SQLite (`PRAGMA index_list` / `index_info`). A definir en el refinamiento.
- Requiere la access key (#3, #4).
