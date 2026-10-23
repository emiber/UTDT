---
id: 28
title: Evaluar la clasificación y las conversaciones de varios turnos en el set golden
type: feat
status: closed
parent:
created: 2026-10-22
---

## Goal
Que `npm run eval` (#12) mida si la clasificación de #10 acierta, también en los seguimientos de una conversación. Es para quien desarrolla el POC: los bugs de #10 (pedidos de gráfico tomados como charla) se encontraron a mano, y hoy un cambio de prompts los puede volver a romper sin que nada avise.

## Scope
- In:
  - Dos campos opcionales por caso en `backend/eval/golden.json`:
    - `classification`: la etiqueta esperada (`data_question`, `conversation`, `needs_clarification` u `out_of_scope`). Si falta, es `data_question`, así que los 7 casos de hoy no cambian.
    - `history`: los turnos anteriores, escritos a mano, con la misma forma que usa el pipeline (`HistoryTurn`: `question`, y opcionales `sql` y `narrative`). Solo se corre y se mide el último mensaje.
  - `parseGolden` valida los dos campos, con el mismo estilo de error de hoy.
  - `evaluateCase` pasa el historial al pipeline y compara la etiqueta esperada con la que obtuvo el pipeline.
  - El judge recibe el historial cuando el caso lo tiene. Va en su input como contenido, nunca como instrucciones (`prompts/judge-input.liquid`). Los tres criterios de #12 no cambian.
  - Una línea de clasificación en el resumen, la etiqueta esperada y la obtenida en cada línea por caso, y las dos en el reporte JSON.
  - 7 casos nuevos en el golden (ver *Data*).
  - Tests unitarios offline y las docs: la sección del eval en `README.md` y en `docs/ARCHITECTURE.md`.
- NOT in:
  - Un criterio de idioma en el judge (los bugs de #22 y #23). Va a #29.
  - Correr los turnos anteriores en vivo por el pipeline.
  - Juzgar las respuestas de texto (las de etiquetas que no son de datos).
  - Cambiar el clasificador o los prompts del pipeline. Si la corrida real muestra errores de clasificación, se anotan, no se arreglan acá.
  - Veredictos PASS/FAIL, umbrales o un código de salida por los resultados. Siguen diferidos como en #12.

## Expected behavior
- **Comparación de la etiqueta.** Se compara la etiqueta que usó el pipeline, después de su fallback de confianza baja (una etiqueta que no es de datos con confianza menor que 0,5 pasa a `data_question`):
  - Se esperaba `data_question` y llegó una respuesta de datos: la clasificación es correcta, y el judge puntúa como hoy.
  - Se esperaba `data_question` y llegó una respuesta de texto: la clasificación es incorrecta. Además el caso queda *sin respuesta*, como hoy (motivo `classified as <label>`).
  - Se esperaba `data_question` y fallaron todos los intentos de SQL: la etiqueta se compara igual (la respuesta de fallo trae `classification`), y el caso queda *sin respuesta*, como hoy.
  - Se esperaba otra etiqueta y llegó una respuesta de texto con esa misma etiqueta: la clasificación es correcta. No hay judge.
  - Se esperaba otra etiqueta y llegó una respuesta de texto con una etiqueta distinta, o una respuesta de datos, o un fallo de SQL: la clasificación es incorrecta. No hay judge.
- **El judge** solo corre cuando la etiqueta esperada y la respuesta son de datos. Si el caso tiene historial, el judge lo ve antes de la pregunta.
- **Edge cases:**
  - Si el clasificador falla (error o rechazo de la API), el pipeline sigue por el camino de datos y no hay etiqueta (`classification: null`). El caso queda *sin etiqueta*: no cuenta como correcto ni como incorrecto. Si se esperaba `data_question`, la respuesta de datos se juzga como hoy. Si se esperaba otra etiqueta, no hay judge.
  - Un `history` vacío es lo mismo que no tener historial.
- **Errores:**
  - Un `classification` que no es una de las 4 etiquetas, un `history` que no es un array, o un turno sin `question` (o con `sql` o `narrative` que no son texto) son errores del golden. El eval dice cuál es el caso y sale con 1 antes de la primera llamada a OpenAI, como hoy.
  - Si el pipeline o el judge fallan, se anota en el caso y la corrida sigue, como hoy. Ese caso queda afuera del conteo de clasificación.
- **Salida:**
  - Cada línea por caso muestra el resultado de la clasificación. Cuando es incorrecta, muestra la etiqueta esperada y la obtenida.
  - El resumen suma una línea con las correctas sobre las comparadas y las que quedaron sin etiqueta, por ejemplo `Classification: 11/13 correct (1 without a label)`.
  - El comando sale con 0 cuando termina la corrida, sean cuales sean los resultados, como hoy.

## Data
- **Entrada:** el formato del caso en `backend/eval/golden.json` pasa a ser:
  ```json
  {
    "id": "chart-not-shown",
    "question": "No veo el gráfico",
    "classification": "data_question",
    "history": [{ "question": "Ventas por mes en 2025", "sql": "SELECT …", "narrative": "…" }]
  }
  ```
- **Casos nuevos** (los 7 de hoy quedan como están; el golden pasa a 14):

  | Historial | Mensaje | Etiqueta esperada |
  |---|---|---|
  | — | "Hola" | `conversation` |
  | — | "¿Cuál es la capital de Francia?" | `out_of_scope` |
  | — | "¿Cómo venimos?" | `needs_clarification` |
  | "Ventas por mes en 2025" | "No veo el gráfico" | `data_question` |
  | "Ventas por categoría" | "mostralo como gráfico de torta" | `data_question` |
  | "Total sales per month in 2025" | "¿y en 2024?" | `data_question` |
  | "Ventas por categoría" | "gracias!" | `conversation` |

  El SQL y la narrativa de cada turno del historial se copian de una corrida real del pipeline sobre el dataset demo, para que sean realistas y el SQL corra.
- **Salida:** el reporte JSON (`data/eval/`, gitignored) suma por caso la etiqueta esperada, la obtenida (o `null`) y el historial. Para una respuesta de texto, guarda su texto en `narrative`. El resumen suma el conteo de clasificación: correctas, incorrectas y sin etiqueta.
- No se persiste nada nuevo: el eval sigue sin escribir en `app.db`.

## Dependencies
- Se apoya en #12 (el eval) y #10 (la clasificación), los dos cerrados.
- #29 (el criterio de idioma) reutiliza el `history` de este issue.
- Externo: la corrida real usa OpenAI (Responses API y Decisions API), igual que hoy.

## Acceptance criteria
- [ ] `golden.json` acepta `classification` y `history` opcionales. Los 7 casos actuales funcionan sin cambios, como `data_question`.
- [ ] Un `classification` desconocido o un `history` mal formado hacen que el eval diga cuál es el caso y salga con 1, sin llamar a OpenAI.
- [ ] El historial del caso llega al pipeline (`answerQuestion`) y al input del judge, como contenido.
- [ ] Cada comparación de *Expected behavior* (correcta, incorrecta y sin etiqueta, con respuesta de datos, de texto o fallo de SQL) da el resultado y el judge que se describen ahí.
- [ ] Las líneas por caso muestran el resultado de la clasificación (la esperada y la obtenida cuando no coinciden), el resumen tiene la línea de clasificación, y el reporte JSON incluye las etiquetas y el historial.
- [ ] Los 7 casos nuevos de *Data* están en el golden, con historiales copiados de una corrida real.
- [ ] Tests unitarios offline (cliente OpenAI y pipeline falsos) para todo lo anterior. La cobertura sigue sobre el 85% y el quality gate pasa.
- [ ] `README.md` y `docs/ARCHITECTURE.md` describen el formato nuevo del caso, la comparación de la etiqueta y la línea del resumen.
- [ ] La sección Verification del PR incluye una corrida real de `npm run eval` con sus resultados. Un error de clasificación en esa corrida se anota; no bloquea el issue.

## Non-functional notes
- **Costo:** una corrida pasa de 7 a 14 casos. Los 3 casos de un turno que no son de datos hacen 2 llamadas (clasificación y respuesta de texto) y no tienen judge. Los 3 seguimientos de datos hacen las llamadas de una pregunta de datos, más el judge, y "gracias!" hace 2, sin judge. Una corrida pasa de unas 28 llamadas a unas 48: casi el doble. Sigue fuera del quality gate.
- **Seguridad:** el historial y la respuesta van al judge como contenido a juzgar, nunca como instrucciones, igual que hoy.

## Assumptions
Confirmadas en el refinamiento (2026-10-22):
- El criterio de idioma de #22 y #23 queda para un issue aparte (#29).
- El historial se escribe fijo en el golden. No se corren los turnos anteriores.
- Las etiquetas se comparan y se cuentan. El judge solo corre cuando la etiqueta esperada y la respuesta son de datos. No se juzgan las respuestas de texto.
- Los 7 casos nuevos de *Data*.
- El judge ve el historial en los seguimientos.
- Un caso sin etiqueta, porque falló el clasificador, se cuenta aparte, igual que hace #12 con los criterios rechazados.

Propuestas al escribir el issue, sin una pregunta aparte:
- `classification` es opcional y vale `data_question` si falta, para no tocar los 7 casos de hoy.
- `history` usa la forma de `HistoryTurn` del pipeline, para pasarlo tal cual.
- Se compara la etiqueta final del pipeline, después del fallback de confianza baja, porque es la que decide la respuesta.

## Deferred decisions
- **Un criterio de idioma** ("la respuesta está en el idioma del mensaje", para la narrativa, los alias del SQL y las respuestas de texto). Detectaría los bugs de #22 y #23. Necesita un criterio nuevo en el judge, y que el judge también vea las respuestas de texto. Pasó a #29.
- **Correr los turnos anteriores en vivo.** Sería más realista, pero cuesta más llamadas y suma la variación de cada turno. Se suma si el historial fijo deja de alcanzar.
- **Juzgar las respuestas de texto** (por ejemplo, "la respuesta es adecuada para el mensaje"). Hoy alcanza con saber que la etiqueta fue la correcta.
- **Veredictos, umbrales, filtros por id y repeticiones por caso:** siguen diferidos como en #12.

## Pull request
Branch: `feat/28-evaluar-clasificacion-y-conversaciones` → `main`

### Qué hace
- **Formato del caso** (`backend/src/evaluate.ts`, `parseGolden`): `classification` (la etiqueta esperada; `data_question` si falta) y `history` (turnos anteriores fijos, con la forma de `HistoryTurn`), los dos opcionales. Una etiqueta desconocida, un `history` que no es un array o un turno sin `question` (o con `sql` o `narrative` que no son texto) dan un error que nombra el caso y el turno. El eval sale con 1 antes de la primera llamada a OpenAI.
- **Comparación** (`evaluateCase`, `classificationOutcome`): el historial va tal cual a `answerQuestion`. Se compara la etiqueta final del pipeline, después del fallback de confianza baja: *correcta*, *incorrecta* o *sin etiqueta* (falló el clasificador). Un caso con error (del pipeline o del judge) queda afuera del conteo.
- **Judge:** solo corre cuando se esperaba `data_question` y llegó una respuesta de datos. Ve el historial antes de la pregunta, con el mismo bloque `history.liquid` que usa el pipeline, como contenido (`judge-input.liquid`). Los tres criterios no cambian.
- **Estado nuevo `not_judged`:** para los casos que esperan otra etiqueta, respondiera lo que respondiera el pipeline. Una respuesta de texto guarda su texto en `narrative`.
- **Salida:**
  - Cada línea empieza con la clasificación: `classification ok`, `classification expected <x>, got <y>` o `classification without a label`.
  - El resumen suma `N not judged` en la primera línea y `Classification: <correctas>/<comparadas> correct (<n> without a label)`.
  - El reporte JSON suma `expectedClassification`, `classification` y `history` por caso, y `notJudged` y `classification` en el resumen. `eval-command.ts` no cambió.
- **Golden:** 7 casos nuevos, los de la tabla de *Data*. Pasa de 8 a 15 casos, no de 7 a 14: #30 ya había sumado `separate-lists`. Por eso una corrida pasa de unas 32 llamadas a unas 52. El SQL y la narrativa de los 4 historiales se copiaron de una corrida real del pipeline sobre el dataset demo (2026-10-23).
- **Docs:** la sección del eval en `README.md` y en `docs/ARCHITECTURE.md`.

### Hallazgo de la corrida real
- El judge puntúa bajo el SQL de los seguimientos que piden volver a mostrar una respuesta: `chart-not-shown` ("No veo el gráfico") sacó 0,23/2 y `as-pie-chart` ("mostralo como gráfico de torta") 1,27/2.
- En los dos casos, el pipeline repitió la consulta correcta del turno anterior, con el gráfico pedido (línea y torta). El judge marcó "does not answer" con probabilidad 0,88 y 0,34: el criterio "Do the SQL queries answer the question" lee el último mensaje al pie de la letra, aunque ve el historial.
- Este issue no cambia los criterios. Queda como follow-up.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (33 archivos, 614 tests; antes 591). Después del último commit, la primera corrida falló con solo 29 de 33 archivos corridos y coverage 84%. No quedó el texto del error, porque el filtro de la salida lo escondió. La segunda corrida, con el mismo código, pasó completa. Coincide con los cortes intermitentes de workers descritos en `docs/ARCHITECTURE.md` (Quality gate).
- Coverage: 99,74% de statements, 97,51% de branches, 99,61% de funciones y 100% de líneas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno (`evaluate.ts` al 100%).
- Criterios de aceptación:
  - **`classification` y `history` opcionales; los casos de antes funcionan como `data_question`: pass** (tests de `parseGolden`, y la corrida real los clasificó a los 8 como `data_question`).
  - **Etiqueta desconocida o historial mal formado: dice cuál es el caso y sale con 1 sin llamar a OpenAI: pass** (tests de `parseGolden` y de arranque de `eval-command`).
  - **El historial llega a `answerQuestion` y al input del judge, como contenido: pass** (tests sobre los requests del clasificador, del SQL y del judge).
  - **Cada comparación de *Expected behavior*: pass.** Hay un test por fila: datos, texto y fallo de SQL con cada etiqueta esperada, el fallback de confianza baja, el clasificador que falla y el error del pipeline.
  - **Líneas, resumen y reporte JSON: pass** (tests de formato y de `eval-command`, y la corrida real).
  - **Los 7 casos nuevos con historiales reales: pass.** Se verificó que los 4 historiales coinciden con la salida de la corrida.
  - **Tests offline, coverage y quality gate: pass.**
  - **`README.md` y `docs/ARCHITECTURE.md`: pass.**
  - **Corrida real en Verification: pass** (abajo).
- `npm run eval` real (2026-10-23, pipeline `gpt-5.4-mini`, judge `gpt-6-luna`), 15 casos, salida 0:
  ```
  sales-by-month-2025: classification ok | sql 2.00/2 | narrative 1.98/2 | chart 1.00
  revenue-by-country: classification ok | sql 2.00/2 | narrative 1.98/2 | chart 1.00
  top-products-by-units: classification ok | sql 2.00/2 | narrative 1.98/2 | chart 1.00
  category-share: classification ok | sql 2.00/2 | narrative 1.79/2 | chart 0.98
  customer-count: classification ok | sql 2.00/2 | narrative 2.00/2 | chart n/a
  average-order-by-segment: classification ok | sql 2.00/2 | narrative 2.00/2 | chart 0.99
  orders-2024: classification ok | sql 2.00/2 | narrative 2.00/2 | chart n/a
  separate-lists: classification ok | sql 2.00/2 | narrative 1.28/2 | chart 0.99
  greeting: classification ok
  capital-of-france: classification ok
  how-are-we-doing: classification ok
  chart-not-shown: classification ok | sql 0.23/2 | narrative 1.97/2 | chart 0.95
  as-pie-chart: classification ok | sql 1.27/2 | narrative 1.97/2 | chart 1.00
  and-in-2024: classification ok | sql 2.00/2 | narrative 1.98/2 | chart 0.99
  thanks-after-answer: classification ok
  Summary: 15 questions, 11 answered, 0 without an answer, 4 not judged, 0 errors
    The SQL answers the question: 1.77/2 (11 judged, 0 refused, 0 not applicable)
    The narrative is faithful to the data: 1.90/2 (11 judged, 0 refused, 0 not applicable)
    The chart fits: 0.99 average probability (9 judged, 0 refused, 2 not applicable)
    Classification: 15/15 correct (0 without a label)
  ```
  - Clasificación: 15/15 correctas, sin errores de clasificación que anotar.
  - El promedio de SQL bajó a 1,77 por los dos seguimientos del hallazgo. Las 8 preguntas de antes siguen en 2,00.
  - `and-in-2024` respondió con alias en español ("Mes", "Ventas totales") a una conversación en inglés: es el bug de #23, que va a medir #29.
- Self-review: 1 ronda con un agente nuevo (separado); sin bloqueantes.
  - **Aplicada:** renombrar una variable que tapaba a otra en `summarize`.
  - **No aplicada:** un test que parsee el `golden.json` real. Un golden roto ya frena el eval antes de la primera llamada, y fijar los ids en un test lo vuelve frágil.
  - **Anotada:** los conteos del issue (14 casos, ~48 llamadas) quedaron viejos por #30 (arriba, en *Golden*).
- Plan: aprobado por el usuario ("Si, aprobalo así", 2026-10-23), con el estado `not_judged` y el formato de las líneas propuestos.
- Security: no se tocó superficie de seguridad. El golden es un archivo local escrito a mano y validado. El historial va al pipeline y al judge como variables de template, como contenido, nunca como instrucciones. No hay secretos en el diff.
- Docs: updated `README.md` y `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
- #31: el criterio de SQL del judge castiga a los seguimientos que piden volver a mostrar o cambiar el formato de una respuesta (ver *Hallazgo de la corrida real*).
