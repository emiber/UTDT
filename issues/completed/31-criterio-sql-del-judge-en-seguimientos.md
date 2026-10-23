---
id: 31
title: Ajustar el criterio de SQL del judge para los seguimientos que piden volver a mostrar una respuesta
type: fix
status: closed
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

## Notes
- 2026-10-23: en la implementación, la regla de seguimientos en la rúbrica de todos los casos bajó el SQL de las 8 preguntas de un turno de 2,00 a entre 1,89 y 2,00, con respuestas fijas. El usuario decidió sumarla solo cuando el caso tiene historial. Sin historial, el judge recibe la rúbrica de antes, sin cambios. Esto reemplaza el tercer punto de *Expected behavior*, que pedía una sola redacción que se leyera bien con historial y sin él.
- 2026-10-23: en la corrida real, `category-share` y `average-order-by-segment` dieron 1,98 de SQL, menos que el "2,00, o 1,99" del criterio. El usuario aceptó cerrar así: esos casos tienen la rúbrica de antes, con respuestas fijas dan 2,00, y con la rúbrica vieja ya habían dado 1,97 y 1,98 en corridas anteriores. La tolerancia de 1,99, propuesta en el refinamiento mirando solo #30, era corta.

## Pull request
Branch: `fix/31-criterio-sql-del-judge-en-seguimientos` → `main`

### Qué hace
- **El criterio de SQL para un caso con historial** (`FOLLOW_UP_SQL` en `backend/src/evaluate.ts`) suma que la pregunta puede ser un seguimiento. Uno que pide mostrar, graficar, reformatear o rehacer una respuesta se responde con la consulta que vuelve a traer esos datos. Uno que cambia el pedido (otro período, filtro o agrupación) tiene que reflejar el cambio. La regla de #30 sobre los resultados separados sigue en las dos versiones.
- **Sin historial, la rúbrica es la de antes**, palabra por palabra. Un test la fija. Con la regla de seguimientos en todos los casos, el SQL de las preguntas de un turno bajaba (ver *Notes*).
- **El input del judge no cambió**: alcanzó con la redacción, así que `Question:` quedó como estaba. Narrativa, gráfico, pipeline, golden y reporte no cambiaron.
- **Docs:** el criterio de SQL en la sección del eval de `docs/ARCHITECTURE.md`.

### Hallazgos de la verificación
- **Con la rúbrica actual, las respuestas fijas reproducen el reporte exacto**, y así sirven como medida. Las fijas son las del reporte `eval-2026-10-23T03-21-02-697Z.json`. El script de re-juicio, que no se versiona, llama al `evaluateCase` real con un LLM falso que repite el SQL y la narrativa guardados; las filas salen de correr ese SQL sobre `data.db`, y solo el judge es real. Con la misma entrada, el judge dio exactamente lo mismo cada vez.
- **Se probó una redacción con ejemplos** ("show it as a chart", "I don't see the chart", "and for last year?"), como la definición del clasificador. Rindió peor: `as-pie-chart` bajó a 1,32 y el caso adulterado se detectaba menos ("does not answer" 0,65). Se descartó.

### Verification
- Lint: `npm run lint` — pass (corrido después del último commit, que fue solo de docs).
- Tests: `npm run test:coverage` — pass (33 archivos, 616 tests; antes 614), corrido sobre el último commit de código (`0bd626a`). En 2 de las 4 corridas del gate de este PR, 4 workers del frontend no arrancaron ("Timeout waiting for worker to respond"), en archivos que este PR no toca. Es el corte descrito en `docs/ARCHITECTURE.md` (Quality gate). Las corridas siguientes, con el mismo código, pasaron completas.
- Coverage: 99,74% de statements, 97,53% de branches, 99,61% de funciones y 100% de líneas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno (`evaluate.ts` al 100%).
- Re-juicio con respuestas fijas, SQL (nivel más probable entre paréntesis):

  | Caso | Rúbrica anterior | Rúbrica final |
  |---|---|---|
  | `chart-not-shown` | 0,23 (does not answer 0,88), igual que el reporte | 1,05 (fully answers 0,46; does not answer 0,41) |
  | `as-pie-chart` | 1,27 (fully answers 0,61), igual que el reporte | 1,52 (fully answers 0,74) |
  | `and-in-2024` adulterado (SQL y texto de 2025) | 0,16 (does not answer 0,84) | 0,14 (does not answer 0,86) |
  | Las 8 preguntas de un turno | 2,00 en todas (reporte) | 2,00 en todas (fully answers 1) |

  Con la regla de seguimientos en todos los casos (la primera versión), las 8 de un turno daban entre 1,89 y 2,00.
- Criterios de aceptación:
  - **El criterio lee el último mensaje en el contexto de la conversación, y la regla de #30 sigue: pass.** Solo para los casos con historial (ver *Notes*).
  - **La rúbrica anterior reproduce el reporte: pass** (0,23 y 1,27).
  - **"fully answers" como nivel más probable en los dos seguimientos: pass.** El margen de `chart-not-shown` con la respuesta fija es justo: 0,46 contra 0,41.
  - **El adulterado da "does not answer": pass** (0,86).
  - **Corrida real, el SQL de un turno en 2,00 o 1,99: no se cumple al pie de la letra, aceptado por el usuario.** `category-share` y `average-order-by-segment` dieron 1,98 (ver *Notes*). Las otras 6 dieron 2,00.
  - **Tests offline: pass.** Uno verifica la redacción con historial; otro fija la de antes sin historial.
  - **Docs: pass.**
  - **Verification con antes, después y el caso negativo: pass** (esta sección).
- `npm run eval` real (2026-10-23, pipeline `gpt-5.4-mini`, judge `gpt-6-luna`), 15 casos, salida 0:
  ```
  sales-by-month-2025: classification ok | sql 2.00/2 | narrative 1.97/2 | chart 0.95
  revenue-by-country: classification ok | sql 2.00/2 | narrative 1.95/2 | chart 1.00
  top-products-by-units: classification ok | sql 2.00/2 | narrative 2.00/2 | chart 1.00
  category-share: classification ok | sql 1.98/2 | narrative 2.00/2 | chart 0.97
  customer-count: classification ok | sql 2.00/2 | narrative 2.00/2 | chart n/a
  average-order-by-segment: classification ok | sql 1.98/2 | narrative 1.99/2 | chart 1.00
  orders-2024: classification ok | sql 2.00/2 | narrative 2.00/2 | chart n/a
  separate-lists: classification ok | sql 2.00/2 | narrative 1.85/2 | chart 1.00
  greeting: classification ok
  capital-of-france: classification ok
  how-are-we-doing: classification ok
  chart-not-shown: classification ok | sql 1.31/2 | narrative 1.97/2 | chart 0.95
  as-pie-chart: classification ok | sql 1.38/2 | narrative 1.99/2 | chart 0.97
  and-in-2024: classification ok | sql 1.95/2 | narrative 1.91/2 | chart 0.99
  thanks-after-answer: classification ok
  Summary: 15 questions, 11 answered, 0 without an answer, 4 not judged, 0 errors
    The SQL answers the question: 1.87/2 (11 judged, 0 refused, 0 not applicable)
    The narrative is faithful to the data: 1.97/2 (11 judged, 0 refused, 0 not applicable)
    The chart fits: 0.98 average probability (9 judged, 0 refused, 2 not applicable)
    Classification: 15/15 correct (0 without a label)
  ```
  - Los dos seguimientos subieron frente a #28: `chart-not-shown` de 0,23 a 1,31 ("fully answers" 0,59) y `as-pie-chart` de 1,27 a 1,38 ("fully answers" 0,66). El promedio de SQL pasó de 1,77 a 1,87.
  - No es estrictamente comparable con las corridas anteriores: cambió la rúbrica de SQL para los casos con historial.
- Self-review: 2 rondas con agentes nuevos (separado), sin bloqueantes en ninguna.
  - **Aplicadas:** una frase de causa más precisa en las docs, "this rule" en vez de "it", y dejar asentado en el issue el cambio respecto de *Expected behavior* (*Notes*).
  - **No aplicadas:** ampliar "that data again" a "o los datos que necesita la vista pedida", porque `as-pie-chart` ya llega y podría aflojar el caso adulterado. Tampoco se sacó "the earlier turns if any", que sobra en la rúbrica con historial: cambiarla invalidaría los puntajes medidos.
- Plan: aprobado por el usuario ("si", 2026-10-23). Después el usuario decidió la regla solo con historial y aceptó el 1,98 de la corrida real (ver *Notes*).
- Security: no se tocó superficie de seguridad. La rúbrica es texto fijo, y el historial y la respuesta siguen yendo al judge como contenido. No hay secretos en el diff.
- Docs: updated `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
None
