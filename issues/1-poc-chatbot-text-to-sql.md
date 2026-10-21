---
id: 1
title: POC del chatbot Text-to-SQL
type: epic
status: closed
parent:
created: 2026-10-19
---

1. #2 Crear tablas de metadatos y seed demo
2. #3 Agregar autenticación con access key en el backend
3. #4 Agregar pantalla de access key en el frontend
4. #5 Exponer el catálogo de datos (GET /api/catalog) y mostrarlo en el frontend
5. #6 Ejecutar SQL sobre data.db con guardas de seguridad
6. #7 Generar SQL con la Responses API de OpenAI
7. #8 Agregar POST /api/chat: pipeline, insights y persistencia
8. #13 Agregar la UI de chat con narrativa, tabla y sugerencias
9. #9 Mostrar gráficos en las respuestas del chat
10. #11 Agregar memoria multi-turn a las conversaciones
11. #10 Clasificar preguntas con la Decisions API
12. #12 Evaluar respuestas offline con LLM-as-a-judge (npm run eval)
13. #14 Responder los errores 5xx con un mensaje genérico
14. #15 Poner un tope de tamaño por valor en la conexión read-only a data.db
15. #16 Documentar en la lista blanca diferida qué puede leer el SQL del LLM
16. #17 Agregar timeouts de punta a punta al chat
17. #18 Estabilizar el arranque de los workers de Vitest
18. #19 Rechazar al arrancar el placeholder de APP_ACCESS_KEY
19. #20 Rediseñar la UI del chat con input fijo, mensajes diferenciados y un estilo más cuidado
20. #21 Mostrar nombres de columna legibles en tablas y gráficos
21. #22 Responder en el idioma del mensaje aunque la conversación venga en otro
22. #23 Escribir los alias del SQL en el idioma de la pregunta aunque la conversación venga en otro

## Pull request
Branch: `epic/1-poc-chatbot-text-to-sql` → `main`

### Epic summary
Un POC local de chatbot Text-to-SQL sobre SQLite, agnóstico del dominio. Aprende qué significan los datos de las tablas de metadatos.
- **Datos y acceso:**
  - las tablas de metadatos y un dataset demo de ventas (`npm run seed`);
  - una access key compartida que protege la API, con su pantalla en el frontend;
  - el catálogo de datos (`GET /api/catalog`, sección *Available data*).
- **Pipeline** (`POST /api/chat`):
  - la Decisions API clasifica cada mensaje. Un saludo, una pregunta vaga o una fuera de alcance reciben una respuesta de texto, sin SQL;
  - una pregunta de datos pasa por la generación de SQL con la Responses API (Structured Outputs, con alias legibles y hasta 3 intentos);
  - la ejecución es read-only y tiene guardas: una sola sentencia `SELECT`/`WITH`, 500 filas como máximo y 1.000.000 de bytes por valor;
  - después vienen los insights (narrativa, 3 sugerencias y spec de gráfico) y un gráfico que el backend arma con las filas reales.
- **Conversación:** la memoria multi-turn usa los últimos 5 turnos y entiende seguimientos como "¿y en 2024?" o "mostralo como gráfico". Cada respuesta va en el idioma de su mensaje, aunque la conversación venga en otro.
- **UI** (Vue 3):
  - el chat con el input fijo abajo y los mensajes diferenciados;
  - las respuestas con texto en markdown, tabla y gráfico (chart.js) en cualquier combinación, y sugerencias clickeables.
- **Calidad y operación:**
  - `npm run eval`, la evaluación offline con LLM-as-a-judge sobre preguntas golden;
  - errores 5xx genéricos;
  - timeouts de punta a punta;
  - el gate de lint, tipos y tests con un 85% de cobertura (hoy 100% de líneas).

### Children
- #2 Crear tablas de metadatos y seed demo
- #3 Agregar autenticación con access key en el backend
- #4 Agregar pantalla de access key en el frontend
- #5 Exponer el catálogo de datos (GET /api/catalog) y mostrarlo en el frontend
- #6 Ejecutar SQL sobre data.db con guardas de seguridad
- #7 Generar SQL con la Responses API de OpenAI
- #8 Agregar POST /api/chat: pipeline, insights y persistencia
- #9 Mostrar gráficos en las respuestas del chat
- #10 Clasificar preguntas con la Decisions API
- #11 Agregar memoria multi-turn a las conversaciones
- #12 Evaluar respuestas offline con LLM-as-a-judge (npm run eval)
- #13 Agregar la UI de chat con narrativa, tabla y sugerencias
- #14 Responder los errores 5xx con un mensaje genérico
- #15 Poner un tope de tamaño por valor en la conexión read-only a data.db
- #16 Documentar en la lista blanca diferida qué puede leer el SQL del LLM
- #17 Agregar timeouts de punta a punta al chat
- #18 Estabilizar el arranque de los workers de Vitest
- #19 Rechazar al arrancar el placeholder de APP_ACCESS_KEY
- #20 Rediseñar la UI del chat con input fijo, mensajes diferenciados y un estilo más cuidado
- #21 Mostrar nombres de columna legibles en tablas y gráficos
- #22 Responder en el idioma del mensaje aunque la conversación venga en otro
- #23 Escribir los alias del SQL en el idioma de la pregunta aunque la conversación venga en otro

### Verification
- **Gate en la rama del epic,** sincronizada con `main` (no había nada nuevo):
  - `npm run lint` — pass;
  - `npm run test:coverage` — pass, 28 archivos y 420 tests, con 100% de líneas y 98,91% de ramas;
  - `npm run build -w frontend` — pass.
- **Prueba de punta a punta en Edge headless** con `npm run dev` y la API real: un saludo, datos con tabla y gráfico, un seguimiento de gráfico, un valor único sin tabla, una pregunta fuera de alcance y una pregunta en inglés tras preguntas en español.
  - Encontró dos fallas de idioma, #22 y #23, que se arreglaron antes de cerrar.
  - La repetición quedó bien.
- **`npm run eval`:** 7 de 7 respondidas. SQL 2.00/2, narrativa 2.00/2 y gráfico 0.98.
