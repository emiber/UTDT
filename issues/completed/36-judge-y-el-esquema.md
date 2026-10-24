---
id: 36
title: Evitar que los puntajes del judge cambien al sumar tablas al esquema
type: fix
status: closed
parent: 32
created: 2026-10-23
---

## Goal
Que los puntajes de `npm run eval` no se muevan cuando se suma al dataset una tabla que la pregunta no usa. Es para quien desarrolla el POC: un puntaje que cambia por una tabla ajena tapa los cambios de verdad, y #35 suma otra tabla (`returns`).

Al sumar `sales_targets` (#34), las mismas respuestas fijas, juzgadas con el esquema de antes y con el nuevo, dieron:

| Caso | Esquema sin `sales_targets` | Con `sales_targets` |
|---|---|---|
| `separate-lists`, narrativa | 0,83 | 0,19 |
| `top-products-after-spanish`, narrativa | 1,94 | 1,50 |
| `as-pie-chart`, SQL | 1,30 | 1,77 |
| `chart-not-shown`, SQL | 1,37 | 1,24 |
| Las otras 10 respuestas de datos | — | ±0,06 o menos |

El judge ve el esquema completo en su input ("Schema the bot knew:"), aunque solo el criterio de SQL lo necesita.

## Scope
- In:
  - Cada respuesta de datos se juzga en 2 requests, como hoy, pero repartidos así:
    1. **SQL**, con el input de hoy: el historial del caso, la pregunta, el esquema y los resultados.
    2. **Narrativa, gráfico (si hay) e idioma**, con la pregunta y la respuesta solas: el SQL, las filas, el gráfico y la narrativa de cada resultado, sin el historial ni el esquema.
  - Tests unitarios offline y la sección del eval en `docs/ARCHITECTURE.md`.
- NOT in:
  - Cambiar las rúbricas (los textos de los criterios), el input del SQL o el de las respuestas de texto.
  - El encabezado del historial con ejemplos en inglés que ve el criterio de SQL (ver *Deferred decisions*).
  - Cambiar el pipeline, el golden o el formato del reporte.

## Expected behavior
- El criterio de SQL se juzga igual que hoy, con la regla de seguimientos de #31 cuando el caso tiene historial. Sigue viendo el esquema, así que una tabla nueva todavía puede moverlo.
- La narrativa, el gráfico y el idioma no ven el esquema ni el historial: sus puntajes no dependen de las tablas del dataset ni de los turnos anteriores.
- Una respuesta sin gráfico pide solo la narrativa y el idioma en el segundo request; el gráfico queda *not applicable*, como hoy.
- **Edge cases:**
  - Una respuesta de texto se juzga como hoy: solo el idioma, con `judge-reply-input.liquid`.
  - Si falla cualquiera de los 2 requests, o el judge devuelve una respuesta de otra forma, es un error del caso, como hoy.
- No cambia el número de llamadas: siguen siendo 2 por respuesta de datos.

## Data
- No cambia ningún formato: ni el golden, ni el reporte, ni `app.db`.
- **Verificación con respuestas fijas** (un script descartable, que no se versiona, como en #29 y #31):
  - Se re-juzgan con el input nuevo las respuestas de datos de las corridas de #33 (`eval-2026-10-23T15-51-23-980Z.json`) y de #34 (`eval-2026-10-23T16-40-21-050Z.json`). Con el input de hoy, sus puntajes son los de esas corridas, porque el judge da lo mismo con la misma entrada.
  - **Control de la narrativa:** una respuesta correcta con una cifra cambiada en su narrativa.
  - **Control del idioma:** las 5 respuestas en español a un mensaje en inglés de la verificación de #29.

## Dependencies
- Hijo del epic #32. Va después de #34 y antes de #35.
- Se apoya en #29 (el request del idioma sin historial) y #31 (la regla de seguimientos del SQL).
- Externo: OpenAI (Decisions API) para el re-juicio y la corrida real.

## Acceptance criteria
- [ ] Cada respuesta de datos se juzga en 2 requests: SQL con el historial y el esquema; narrativa, gráfico (si hay) e idioma con la pregunta y la respuesta solas.
- [ ] Tests offline:
  - el input del segundo request no tiene el historial ni el esquema, y sí la pregunta, el SQL, las filas, los gráficos y las narrativas;
  - el del SQL no cambió;
  - las rúbricas y la respuesta de texto no cambiaron;
  - un fallo en cualquiera de los dos requests es un error del caso.
- [ ] Con las respuestas fijas de las corridas de #33 y #34, la narrativa de `separate-lists` con el input nuevo no es menor que la que daba con el esquema de antes de #34 (0,85 y 0,83).
- [ ] Con esas respuestas, ninguna otra narrativa o gráfico de una respuesta correcta baja más de 0,1 frente al input de hoy.
- [ ] Controles con el input nuevo:
  - la narrativa con una cifra cambiada da "contradicts or invents figures" como nivel más probable;
  - las 5 respuestas en el idioma equivocado dan menos de 0,5 de idioma, y las respuestas correctas de esas corridas, 0,5 o más.
- [ ] Una corrida real de `npm run eval` en Verification, con sus resultados. Avisa que no es estrictamente comparable con las anteriores, porque cambió el input de la narrativa, el gráfico y el idioma.
- [ ] `docs/ARCHITECTURE.md` describe qué ve cada request del judge y por qué.
- [ ] El quality gate pasa.

## Non-functional notes
- **Costo:** la corrida no cambia, con 2 requests por respuesta de datos. El re-juicio son unas 60 llamadas a la Decisions API: unas 28 respuestas con 2 requests cada una, más los controles.
- **Seguridad:** la respuesta sigue yendo al judge como contenido, nunca como instrucciones.

## Assumptions
Confirmadas en el refinamiento (2026-10-23):
- Solo el SQL sigue viendo el esquema. La narrativa, el gráfico y el idioma van juntos en el otro request, sin historial ni esquema.
- El encabezado del historial con ejemplos en inglés queda diferido.
- Se verifica con respuestas fijas, controles y una corrida real.

Propuestas al escribir el issue, sin una pregunta aparte:
- Las respuestas fijas son las de las corridas de #33 y #34, y los controles de idioma son las respuestas rotas de #29.
- Las tolerancias: `separate-lists` al menos como con el esquema de antes, y 0,1 para las demás narrativas y gráficos.
- Si alguna medición no se cumple, se anota en el PR y se consulta antes de cerrar, como en #31.

## Deferred decisions
- **El encabezado del historial en el input del SQL.** Tiene ejemplos en inglés ("and for last year?", "show it as a chart") que en #29 el judge tomó por el mensaje. Podría ser parte de por qué el SQL de `chart-not-shown` sale bajo. Cambiarlo invalida lo que midió #31.
- **Que el SQL no dependa de las tablas que no usa**, por ejemplo mostrándole solo las tablas que lee la consulta. Hoy el SQL necesita el esquema para saber qué significa cada columna.

## Notes
- 2026-10-23: en la implementación, con el idioma también sin el esquema, el re-juicio dio falsos negativos en respuestas correctas en español: `category-share` de #34 bajó de 1,00 a 0,04, y `chart-not-shown`, `as-pie-chart` y `margin-share-by-category` quedaron entre 0,67 y 0,75. El usuario decidió usar 3 requests: el SQL como antes, la narrativa y el gráfico sin el historial ni el esquema, y el idioma con el input de #29 (sin el historial, con el esquema). Esto reemplaza "Siguen siendo 2 requests" de *Scope* y *Expected behavior*, y lo que dicen del input del idioma y el primer criterio de aceptación. Cuesta 1 request más por respuesta de datos, unas 14 llamadas más por corrida, y los dos re-juicios sumaron unas 180 llamadas, en vez de unas 60.

## Pull request
Branch: `fix/36-judge-y-el-esquema` → `epic/32-ampliar-el-dataset-demo`

### Qué hace
- **Cada respuesta de datos se juzga en 3 requests** (`evaluateCase` en `backend/src/evaluate.ts`). Las rúbricas no cambian.

  | Request | Criterios | Qué ve el judge, además de la pregunta y la respuesta |
  |---|---|---|
  | 1 | SQL | el historial y el esquema, como antes |
  | 2 | narrativa y gráfico (si hay) | nada más: sin historial ni esquema |
  | 3 | idioma | el esquema, sin historial: el input de #29 |

  El tercero es un cambio respecto del issue, que pedía 2 requests (ver *Notes*).
- **Template** (`judge-input.liquid`): el bloque "Schema the bot knew:" se muestra solo si viene el esquema. Con el esquema, el input sale idéntico al de antes, byte a byte: se comparó con el template anterior, con historial y sin él.
- **La respuesta de texto** se juzga igual que antes.
- **Tests:**
  - qué preguntas lleva cada request y qué input ve cada uno;
  - el del segundo request es el del SQL sin los bloques del historial y del esquema, y el del tercero es el del SQL sin el bloque del historial;
  - si falla el primer request no se hacen los otros, y un fallo en el segundo o en el tercero queda como error del caso.
- **Docs:** qué ve cada request del judge y por qué, en `docs/ARCHITECTURE.md`; el costo, en `README.md`.

### Hallazgos de la verificación
- **Sin el esquema, el idioma da falsos negativos.** Con la primera versión (2 requests, el idioma también sin esquema), `category-share` de #34, una respuesta en español, bajó de 1,00 a 0,04. Por eso el idioma volvió al input de #29.
- **El criterio de idioma tiene un punto débil con respuestas cortas** cuyo contenido principal es un nombre en inglés. En la corrida real, `margin-share-by-category` dio 0,03 de idioma con una respuesta toda en español: "La categoría con el mayor margen porcentual es **Office Supplies**, con **63.43%**…". El input del idioma es el mismo de #29 y #34, que este PR no cambia; en #34 ese caso ya había dado 0,75.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (33 archivos, 636 tests; antes 633), sobre el último commit (`ac11ea4`). Una corrida anterior cortó con "Timeout waiting for worker to respond", el corte de workers descrito en `docs/ARCHITECTURE.md` (Quality gate); la siguiente pasó completa.
- Coverage: 99,74% de statements, 97,41% de branches, 99,61% de funciones y 100% de líneas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno.
- **Re-juicio con respuestas fijas.** Las respuestas de datos de las corridas de #33 y #34 se juzgaron con la versión final: el `evaluateCase` real con un LLM falso que repite cada respuesta guardada, y las filas sacadas de correr su SQL sobre `data.db`. Con el input de antes, los puntajes son los de esas corridas.

  | Medición | Resultado |
  |---|---|
  | Narrativa de `separate-lists` | 0,85 → **1,31** (#33) y 0,19 → **1,95** (#34) |
  | La mayor baja de otra narrativa | 0,09 (`sales-by-month-2025` de #34: 1,74 → 1,65) |
  | La mayor baja de un gráfico | 0,05 (`average-order-by-segment` de #34: 1,00 → 0,95) |
  | Narrativa con una cifra cambiada (14.993,40 → 18.993,40) | **0,05**, "contradicts or invents figures" |
  | Las 5 respuestas en el idioma equivocado (#29) | **0,00** las 5 |
  | El idioma de las respuestas correctas | 0,71 o más (el mínimo, `as-pie-chart` de #33) |

  El idioma de las respuestas de #34 dio exactamente lo mismo que en su corrida, porque el input es el mismo.
- Criterios de aceptación (con los cambios de *Notes*):
  - **Los requests por respuesta de datos: pass**, como 3 requests (ver *Notes*).
  - **Tests offline del input de cada request, de las rúbricas, de la respuesta de texto y de los fallos: pass.**
  - **`separate-lists` no menor que con el esquema de antes de #34: pass** (1,31 ≥ 0,85 y 1,95 ≥ 0,83).
  - **Ninguna otra narrativa o gráfico baja más de 0,1: pass** (0,09 y 0,05 como máximo).
  - **Controles: pass.** La cifra cambiada da "contradicts"; las rotas dan menos de 0,5, y las correctas 0,5 o más.
  - **Corrida real en Verification: pass** (abajo).
  - **`docs/ARCHITECTURE.md`: pass.**
  - **Quality gate: pass.**
- `npm run eval` real con la versión final (2026-10-24, pipeline `gpt-5.4-mini`, judge `gpt-6-luna`), 21 casos, salida 0:
  ```
  sales-by-month-2025: classification ok | sql 2.00/2 | narrative 0.30/2 | chart 0.98 | language 1.00
  revenue-by-country: classification ok | sql 2.00/2 | narrative 2.00/2 | chart 0.99 | language 1.00
  top-products-by-units: classification ok | sql 2.00/2 | narrative 2.00/2 | chart 0.99 | language 1.00
  category-share: classification ok | sql 1.94/2 | narrative 2.00/2 | chart 0.96 | language 1.00
  customer-count: classification ok | sql 2.00/2 | narrative 1.98/2 | chart n/a | language 1.00
  average-order-by-segment: classification ok | sql 2.00/2 | narrative 2.00/2 | chart 1.00 | language 1.00
  orders-2024: classification ok | sql 2.00/2 | narrative 2.00/2 | chart n/a | language 1.00
  separate-lists: classification ok | sql 1.98/2 | narrative 2.00/2 | chart 0.96 | language 0.99
  greeting: classification ok | language 1.00
  capital-of-france: classification ok | language 1.00
  how-are-we-doing: classification ok | language 1.00
  chart-not-shown: classification ok | sql 0.96/2 | narrative 2.00/2 | chart 0.94 | language 0.98
  as-pie-chart: classification ok | sql 1.67/2 | narrative 1.97/2 | chart 0.98 | language 0.93
  and-in-2024: classification ok | sql 1.90/2 | narrative 1.97/2 | chart 0.97 | language 0.96
  thanks-after-answer: classification ok | language 1.00
  capital-of-france-after-spanish: classification ok | language 1.00
  top-products-after-spanish: classification ok | sql 1.93/2 | narrative 2.00/2 | chart 0.97 | language 1.00
  margin-share-by-category: classification ok | sql 1.98/2 | narrative 1.97/2 | chart n/a | language 0.03
  margin-by-country-2025: classification ok | sql 1.95/2 | narrative 1.96/2 | chart 0.97 | language 1.00
  target-march-2025: classification ok | sql 1.48/2 | narrative 2.00/2 | chart n/a | language 0.97
  categories-below-target-2025: classification ok | sql 2.00/2 | narrative 1.98/2 | chart 0.95 | language 1.00
  Summary: 21 questions, 16 answered, 0 without an answer, 5 with another label, 0 errors
    The SQL answers the question: 1.86/2 (16 judged, 0 refused, 0 not applicable)
    The narrative is faithful to the data: 1.88/2 (16 judged, 0 refused, 0 not applicable)
    The chart fits: 0.97 average probability (12 judged, 0 refused, 4 not applicable)
    The answer is in the language of the message: 0.95 average probability (21 judged, 0 refused, 0 not applicable)
    Classification: 21/21 correct (0 without a label)
  ```
  - **`separate-lists`** dio 2,00 de narrativa, contra 0,19 en la corrida de #34.
  - **`sales-by-month-2025`, 0,30 de narrativa: la narrativa está mal.** Dice que las ventas "were strongest in the first quarter", pero el primer trimestre suma 33.756 y el cuarto 34.048, y febrero (8.191) está entre los meses bajos. Es una respuesta nueva del pipeline, y el judge la marca con razón.
  - **`margin-share-by-category`, 0,03 de idioma: es un falso negativo** (ver *Hallazgos*).
  - **`target-march-2025`, 1,48 de SQL:** la consulta y su resultado son correctos (13.274,49 contra 12.960). El request del SQL no cambió con este PR: es variación entre corridas.
  - No es estrictamente comparable con las corridas anteriores: cambió el input de la narrativa y del gráfico.
- Self-review: 1 ronda con un agente nuevo (separado), sin bloqueantes. Aplicadas:
  - la nota del issue también reemplaza el primer criterio de aceptación y el costo;
  - las docs dicen que el SQL y el idioma todavía ven el esquema, y se reescribió una frase;
  - dos tests: una respuesta de otra forma en el request de la narrativa, y el input del segundo request con varios resultados.
- Plan: aprobado por el usuario ("si", 2026-10-23). Después, el usuario decidió los 3 requests (ver *Notes*).
- Security: no se tocó superficie de seguridad. Es el eval offline y el armado de sus prompts; la respuesta sigue yendo al judge como contenido, nunca como instrucciones. No hay secretos en el diff.
- Docs: updated `docs/ARCHITECTURE.md` y `README.md`

### Out of scope / follow-ups
- El criterio de idioma da falsos negativos con respuestas cortas en español cuyo contenido principal es un nombre en inglés (`margin-share-by-category`: 0,03). Se ofrece como follow-up.
