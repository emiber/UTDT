---
id: 30
title: Devolver listados separados cuando el mensaje pide más de uno
type: fix
status: open
parent:
created: 2026-10-22
---

## Problema

Si el mensaje pide dos listados por separado, el bot devuelve una sola tabla con los dos mezclados. El texto y el gráfico arrastran la mezcla.

Reporte del usuario (2026-10-22): "Quiero un listado de los 5 clientes con mas ventas y un listado separado de los 3 productos con mas ventas" devolvió una sola tabla con los clientes y los productos juntos.

## Lo que muestra `app.db`

Pasó en dos turnos, los dos clasificados como `data_question` y sin error:

- **Turno 114** (2026-10-22), el del reporte. El SQL arma dos CTE (`clientes` y `productos`) y las une con `UNION ALL` en una tabla `Tipo | Nombre | Ventas`, con 8 filas. El gráfico de barras pone a los 5 clientes y los 3 productos en el mismo eje ("Top 5 clientes y top 3 productos por ventas"). La narrativa los compara: "los productos top muestran importes más altos que los clientes top".
- **Turno 109** (2026-10-22): "Quiero un listado de todos los clientes y un listado de todos los productos. Cada uno por separado". Hizo lo mismo, con columnas genéricas (`Listado | Columna 1 | … | Columna 4`) y el precio pasado a texto para que el `UNION ALL` encaje. La narrativa dice "El resultado muestra **dos listados separados**", y no es así. También propuso un gráfico de barras con los nombres de clientes y de productos.

## Contexto conocido

- Hoy cada turno corre exactamente una consulta, por diseño. La guarda de #6 (`backend/src/execute-sql.ts`) acepta una sola sentencia, y el esquema de salida de #7 (`backend/src/generate-sql.ts`) pide un solo `sql`. Con un solo resultado posible, el modelo une los dos listados con `UNION ALL`.
- La respuesta es una lista de bloques (`text`, `table`, `chart`). El frontend los recorre en `frontend/src/components/ResponseBlocks.vue`, pero hoy el pipeline arma como mucho una tabla y un gráfico por respuesta.
- La forma de arreglarlo no está decidida: varias consultas por turno, responder un listado y sugerir el otro, o pedir que se separe la pregunta. El tamaño depende de eso. Varias consultas tocarían la generación de SQL, la ejecución, los insights, los bloques, el historial y quizás el frontend.
- Un caso así se podría sumar al set golden (#28) cuando esto esté resuelto.

Origen: `issues/issue.md`, nota del usuario sin commitear (2026-10-22).
