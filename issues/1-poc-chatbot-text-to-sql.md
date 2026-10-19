---
id: 1
title: POC del chatbot Text-to-SQL
type: epic
status: open
parent:
created: 2026-10-19
---

1. Tablas de metadatos (tablas, columnas, relaciones) y seed demo (`npm run seed`), con conexión read-only a `data.db`
2. Autenticación con access key compartida (hook en el backend + pantalla en el frontend)
3. Endpoint `GET /api/catalog` y vista de las tablas disponibles
4. Ejecutor de SQL con guardas (un solo `SELECT`/`WITH`, tope de filas), todavía sin LLM
5. Generación de SQL con la Responses API de OpenAI
6. Endpoint `POST /api/chat` y UI de chat con narrativa y tabla
7. Gráficos con Chart.js + vue-chartjs
8. Clasificación de preguntas con la Decisions API
9. Memoria multi-turn (conversaciones en `app.db`)
10. Evaluación offline con LLM-as-a-judge (`npm run eval`)
