# Issues

Cada issue es un archivo Markdown versionado con el código: es la spec del cambio. Los cerrados están en [completed/](completed/), y los que siguen abiertos, directo en esta carpeta.

[pendientes.md](pendientes.md) no es un issue: es la lista de lo que quedó abierto al cerrar la épica #1.

## Cómo leer un issue

- **Goal** y **Scope**: qué se quiere, qué entra y qué no (*NOT in*).
- **Acceptance criteria**: con qué se verifica que está terminado.
- **Deferred decisions**, si las hay: lo que se decidió dejar para después, con el motivo.
- **Notes**, si las hay: los cambios decididos durante la implementación, con el porqué.
- **Pull request**: qué hizo el agente, qué encontró y la sección *Verification*, con el resultado de cada gate.

## Para empezar

- [#30](completed/30-listados-separados.md): cómo un pedido corto se vuelve una spec, con alcance, casos borde y criterios de aceptación.
- [#38](completed/38-idioma-respuestas-cortas.md): cuando el plan no alcanza. El cambio de enfoque quedó escrito en *Notes*.

## Todos los issues

Hay dos épicas: [#1](completed/1-poc-chatbot-text-to-sql.md), el POC (#2 a #23), y [#32](completed/32-ampliar-el-dataset-demo.md), la ampliación del dataset demo (#33 a #36). Los demás issues son sueltos.

| # | Issue | Tipo | Épica |
|---|---|---|---|
| 1 | [POC del chatbot Text-to-SQL](completed/1-poc-chatbot-text-to-sql.md) | epic |  |
| 2 | [Crear tablas de metadatos y seed demo](completed/2-tablas-metadatos-y-seed-demo.md) | feat | #1 |
| 3 | [Agregar autenticación con access key en el backend](completed/3-auth-access-key-backend.md) | feat | #1 |
| 4 | [Agregar pantalla de access key en el frontend](completed/4-auth-access-key-frontend.md) | feat | #1 |
| 5 | [Exponer el catálogo de datos (GET /api/catalog) y mostrarlo en el frontend](completed/5-catalogo-de-datos.md) | feat | #1 |
| 6 | [Ejecutar SQL sobre data.db con guardas de seguridad](completed/6-ejecutor-sql-con-guardas.md) | feat | #1 |
| 7 | [Generar SQL con la Responses API de OpenAI](completed/7-generacion-sql-responses-api.md) | feat | #1 |
| 8 | [Agregar POST /api/chat: pipeline, insights y persistencia](completed/8-chat-narrativa-y-tabla.md) | feat | #1 |
| 9 | [Mostrar gráficos en las respuestas del chat](completed/9-graficos-en-respuestas.md) | feat | #1 |
| 10 | [Clasificar preguntas con la Decisions API](completed/10-clasificacion-decisions-api.md) | feat | #1 |
| 11 | [Agregar memoria multi-turn a las conversaciones](completed/11-memoria-multi-turn.md) | feat | #1 |
| 12 | [Evaluar respuestas offline con LLM-as-a-judge (npm run eval)](completed/12-evaluacion-llm-as-a-judge.md) | feat | #1 |
| 13 | [Agregar la UI de chat con narrativa, tabla y sugerencias](completed/13-ui-de-chat.md) | feat | #1 |
| 14 | [Responder los errores 5xx con un mensaje genérico](completed/14-errores-5xx-genericos.md) | fix | #1 |
| 15 | [Poner un tope de tamaño por valor en la conexión read-only a data.db](completed/15-tope-de-tamano-por-valor.md) | fix | #1 |
| 16 | [Documentar en la lista blanca diferida qué puede leer el SQL del LLM](completed/16-lista-blanca-diferida.md) | docs | #1 |
| 17 | [Agregar timeouts de punta a punta al chat](completed/17-timeout-del-chat.md) | fix | #1 |
| 18 | [Estabilizar el arranque de los workers de Vitest](completed/18-workers-de-vitest.md) | chore | #1 |
| 19 | [Rechazar al arrancar el placeholder de APP_ACCESS_KEY](completed/19-placeholder-de-app-access-key.md) | fix | #1 |
| 20 | [Rediseñar la UI del chat con input fijo, mensajes diferenciados y un estilo más cuidado](completed/20-rediseno-de-la-ui.md) | feat | #1 |
| 21 | [Mostrar nombres de columna legibles en tablas y gráficos](completed/21-nombres-de-columna-legibles.md) | feat | #1 |
| 22 | [Responder en el idioma del mensaje aunque la conversación venga en otro](completed/22-idioma-de-la-respuesta.md) | fix | #1 |
| 23 | [Escribir los alias del SQL en el idioma de la pregunta aunque la conversación venga en otro](completed/23-idioma-de-los-alias.md) | fix | #1 |
| 24 | [Registrar el tiempo y los tokens de cada llamada al LLM](completed/24-tiempos-y-tokens-del-llm.md) | feat |  |
| 25 | [Agregar una pantalla de reporte de uso del LLM con filtros y granularidad](completed/25-reporte-de-uso-del-llm.md) | feat |  |
| 26 | [Separar el chat y el reporte de uso en rutas del frontend](completed/26-rutas-chat-y-usage.md) | feat |  |
| 27 | [Evitar que los workers de Vitest del frontend fallen al arrancar](completed/27-workers-de-vitest-del-frontend.md) | chore |  |
| 28 | [Evaluar la clasificación y las conversaciones de varios turnos en el set golden](completed/28-evaluar-clasificacion-y-conversaciones.md) | feat |  |
| 29 | [Evaluar en el set golden que la respuesta esté en el idioma del mensaje](completed/29-evaluar-el-idioma-de-la-respuesta.md) | feat |  |
| 30 | [Responder con varias tablas y gráficos cuando el mensaje pide resultados separados](completed/30-listados-separados.md) | feat |  |
| 31 | [Ajustar el criterio de SQL del judge para los seguimientos que piden volver a mostrar una respuesta](completed/31-criterio-sql-del-judge-en-seguimientos.md) | fix |  |
| 32 | [Ampliar el dataset demo con costos, objetivos y devoluciones](completed/32-ampliar-el-dataset-demo.md) | epic |  |
| 33 | [Sumar el costo de los productos para preguntar por el margen](completed/33-costo-de-los-productos.md) | feat | #32 |
| 34 | [Sumar objetivos mensuales para comparar las ventas contra la meta](completed/34-objetivos-mensuales.md) | feat | #32 |
| 35 | [Sumar devoluciones para preguntar por la tasa de devolución](completed/35-devoluciones.md) | feat | #32 |
| 36 | [Evitar que los puntajes del judge cambien al sumar tablas al esquema](completed/36-judge-y-el-esquema.md) | fix | #32 |
| 37 | [Responder siempre en el idioma del mensaje después de turnos en otro idioma](completed/37-idioma-despues-de-otro-idioma.md) | fix |  |
| 38 | [Evitar falsos negativos del criterio de idioma en respuestas cortas con nombres en inglés](completed/38-idioma-respuestas-cortas.md) | fix |  |
