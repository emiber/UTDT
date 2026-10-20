---
id: 1
title: POC del chatbot Text-to-SQL
type: epic
status: open
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
