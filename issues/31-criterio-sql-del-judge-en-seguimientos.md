---
id: 31
title: Ajustar el criterio de SQL del judge para los seguimientos que piden volver a mostrar una respuesta
type: fix
status: refined
parent:
created: 2026-10-23
---

## Goal
Que el criterio *the SQL answers the question* de `npm run eval` puntúe bien los seguimientos que piden volver a mostrar o cambiar el formato de una respuesta anterior. Es para quien desarrolla el POC: hoy esos casos bajan el promedio de SQL aunque el pipeline responda bien, y un puntaje bajo que no es un error tapa los errores de verdad.

En la corrida real de #28 (`data/eval/eval-2026-10-23T03-21-02-697Z.json`):
- `chart-not-shown` ("No veo el gráfico", después de "Ventas por mes en 2025"): SQL 0,23/2. El pipeline repitió la consulta del turno anterior con un gráfico de línea, que es lo que se pedía. El judge marcó "does not answer" con probabilidad 0,88.
- `as-pie-chart` ("mostralo como gráfico de torta", después de "Ventas por categoría"): SQL 1,27/2, con "does not answer" en 0,34. También repitió la consulta, con un gráfico de torta.
- `and-in-2024` ("¿y en 2024?") sacó 2,00: el seguimiento que cambia el filtro se juzga bien.

El criterio pregunta "Do the SQL queries answer the question…?". Al parecer el judge lo lee sobre el último mensaje al pie de la letra, aunque desde #28 ve el historial antes de la pregunta.

## Scope
- In:
  - La redacción del criterio de SQL (`QUESTIONS.sql` en `backend/src/evaluate.ts`), para que lea el último mensaje en el contexto de la conversación. Se mantiene la regla de #30 sobre los resultados separados.
  - Si con la redacción no alcanza, también cómo el input del judge presenta el último mensaje (`backend/src/prompts/judge-input.liquid`, hoy `Question:`).
  - Tests offline de la redacción nueva (y del input, si cambia) y la descripción del criterio en `docs/ARCHITECTURE.md`.
- NOT in:
  - Los criterios de narrativa y de gráfico. En la corrida, esos casos sacaron 1,97 de narrativa y 0,95 y 1,00 de gráfico.
  - Cambiar el pipeline o sus prompts.
  - El criterio de idioma (#29) y juzgar las respuestas de texto.
  - Un modo de respuestas fijas en el eval, o casos negativos permanentes.
  - Cambiar el formato del golden o del reporte.

## Expected behavior
- **Un seguimiento que pide mostrar, graficar, reformatear o rehacer una respuesta anterior** ("No veo el gráfico", "mostralo como gráfico de torta"): la consulta que vuelve a traer esos datos (o los que necesita la vista pedida) lo responde.
- **Un seguimiento que cambia el pedido** ("¿y en 2024?"): el SQL tiene que reflejar el cambio. Repetir la consulta anterior no lo responde.
- **Una pregunta de un turno, sin historial:** se juzga como hoy. La redacción nueva tiene que leerse natural también sin conversación.
- **Si ni la redacción ni el input alcanzan** para llegar a los criterios de aceptación, no se toca nada más: se anota en el PR y se consulta.

## Data
- No cambia ningún formato: ni el golden, ni el reporte, ni `app.db`.
- **Verificación con respuestas fijas** (un script descartable, que no se versiona):
  - Toma las respuestas guardadas en `eval-2026-10-23T03-21-02-697Z.json` y les arma el mismo input que vio el judge. El reporte no guarda las filas, así que el script las vuelve a sacar corriendo el SQL guardado sobre `data/data.db`.
  - Primero las re-juzga con la rúbrica actual, para confirmar que reproduce los puntajes del reporte. Según #30, el judge es determinista con la misma entrada.
  - Después las re-juzga con la rúbrica nueva.
- **Caso negativo:** la respuesta de `and-in-2024` adulterada con el SQL y las filas de 2025 del turno anterior, es decir, lo que no se pidió.

## Dependencies
- Se apoya en #28 (el historial en el input del judge), cerrado.
- #29 también toca la rúbrica y el input del judge. No hay un orden obligatorio, pero el que vaya segundo parte de los cambios del primero.
- Externo: OpenAI (Decisions API) para el re-juicio y la corrida real.

## Acceptance criteria
- [ ] El criterio de SQL lee el último mensaje en el contexto de la conversación, como dice *Expected behavior*. La regla de #30 sobre los resultados separados sigue.
- [ ] Con la rúbrica actual, el re-juicio de las respuestas fijas reproduce los puntajes de SQL del reporte para `chart-not-shown` y `as-pie-chart`.
- [ ] Con la rúbrica nueva, esas dos respuestas dan "fully answers" como nivel más probable.
- [ ] Con la rúbrica nueva, la respuesta adulterada de `and-in-2024` da "does not answer" como nivel más probable.
- [ ] Una corrida real de `npm run eval` en Verification: el SQL de las 8 preguntas de un turno sigue en 2,00 (o 1,99, la variación vista en #30), y los resultados de los dos seguimientos se reportan.
- [ ] Tests offline de la redacción nueva (y del input, si cambia). El quality gate pasa.
- [ ] `docs/ARCHITECTURE.md` describe el criterio nuevo.
- [ ] La sección Verification del PR incluye los puntajes del re-juicio (antes y después, y el caso negativo) y avisa que la corrida no es estrictamente comparable con las anteriores, porque cambió la rúbrica.

## Non-functional notes
- **Costo:** el re-juicio son unas 6 llamadas a la Decisions API (3 respuestas, con la rúbrica actual y con la nueva). La corrida real son unas 52 llamadas. Todo queda fuera del quality gate.
- **Seguridad:** el historial y la respuesta siguen yendo al judge como contenido, nunca como instrucciones.

## Assumptions
Confirmadas en el refinamiento (2026-10-23):
- Se cambia la redacción del criterio de SQL y, si hace falta, cómo el input presenta el último mensaje. Narrativa y gráfico no cambian.
- "Hecho" se mide re-juzgando respuestas fijas (las dos de los seguimientos dan "fully answers" como nivel más probable) y con una corrida real en Verification.
- El control de que el judge sigue detectando un seguimiento mal resuelto se hace una vez a mano, con una respuesta adulterada de `and-in-2024`, en un script que no se versiona.

Propuestas al escribir el issue, sin una pregunta aparte:
- Antes de cambiar la rúbrica, el re-juicio con la rúbrica actual confirma que reproduce el reporte. Si no lo reproduce, las respuestas fijas no sirven como medida.
- En la corrida real, 1,99 cuenta como "sigue en 2,00", por la variación que ya se vio en #30.

## Deferred decisions
- **Un modo de respuestas fijas en el eval**, para tener casos negativos permanentes. Hoy alcanza con el control a mano. Se suma si la rúbrica se vuelve a tocar seguido.
- **Ajustar narrativa y gráfico para los seguimientos.** Hoy puntúan bien esos casos.
