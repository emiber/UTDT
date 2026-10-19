---
id: 9
title: Mostrar gráficos en las respuestas
type: feat
status: open
parent: 1
created: 2026-10-19
---

Agregar un bloque de gráfico a las respuestas del chat, renderizado con Chart.js + vue-chartjs.

**Contexto**
- Comentario en el epic: "entiendo que parte de esto estará dado por la respuesta de la API". Así es:
  - el LLM elige el tipo de gráfico (bar/line/pie/doughnut), la columna del eje X, las columnas de las series y el título;
  - el backend valida esas columnas y arma los datos ya en formato Chart.js desde las filas reales;
  - el frontend solo renderiza.
- Agrega `chart.js` y `vue-chartjs`.
- Depende de #8.
