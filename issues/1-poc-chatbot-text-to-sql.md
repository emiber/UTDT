---
id: 1
title: POC del chatbot Text-to-SQL
type: epic
status: open
parent:
created: 2026-10-19
---

1. Tablas de metadatos (tablas, columnas, relaciones) y seed demo (`npm run seed`), con conexión read-only a `data.db`
    Ok con esto, arma el issue.
2. Autenticación con access key compartida (hook en el backend + pantalla en el frontend)
    Creá un issue para el back y luego uno para el front. Cada uno con sus tests.
3. Endpoint `GET /api/catalog` y vista de las tablas disponibles
    Bien con esto. Necesito que traiga los detalles de las tablas y columnas junto con sus relaciones e índices
4. Ejecutor de SQL con guardas (un solo `SELECT`/`WITH`, tope de filas), todavía sin LLM
    Ok con esto.
5. Generación de SQL con la Responses API de OpenAI
    Revisá el proyecto que pasé antes. Si se puede usar algo como Jinja2 (https://pypi.org/project/Jinja2/) y usar esto o similar para los prompts
6. Endpoint `POST /api/chat` y UI de chat con narrativa y tabla
    Acá se debería recibir el id del chat para que pueda seguir el hilo
7. Gráficos con Chart.js + vue-chartjs
    Está OK, entiendo que parte de esto estará dado por la respuesta de la API
8. Clasificación de preguntas con la Decisions API
    Hablemos de esto en un chat aparte cuando sea el momento
9. Memoria multi-turn (conversaciones en `app.db`)
    Está relacionado con la nota del issue 6
10. Evaluación offline con LLM-as-a-judge (`npm run eval`)
    Ok

Armemos las cosas en español, creo que va a ser mas facil manejarlo ya que nada irá a Github.