---
id: 38
title: Evitar falsos negativos del criterio de idioma en respuestas cortas con nombres en inglés
type: fix
status: closed
parent:
created: 2026-10-24
---

## Goal
Que el criterio de idioma de `npm run eval` (#29) no marque como en otro idioma una respuesta que está en el idioma del mensaje. Es para quien desarrolla el POC: un falso negativo baja el promedio de idioma y tapa las respuestas que de verdad salen en otro idioma.

- En la corrida real de #36 (`eval-2026-10-24T01-03-18-455Z.json`), `margin-share-by-category` ("¿Qué categoría tiene el mayor margen porcentual?") dio 0,03 de idioma. Su respuesta está toda en español: "La categoría con el mayor margen porcentual es **Office Supplies**, con **63.43%**…".
- Con respuestas parecidas, el mismo caso dio 0,91 (#33), 0,75 (#34) y 0,64 (#35).

**Lo que mostró el diagnóstico del refinamiento** (con respuestas fijas; el judge da lo mismo con la misma entrada):
- **El judge distingue bien los dos idiomas, pero el predicado falla.** Con la respuesta que dio 0,02, el judge dice, como preguntas de opción, que el mensaje está en español (0,78) y la respuesta también (0,99). Aun así, el predicado "everything the bot wrote is in the language of the question" dice que no.
- **El predicado también se mueve con el esquema.** La misma respuesta de `as-pie-chart` dio 0,71 con 4 tablas y 0,96 con 5 (después de sumar `returns`).

## Scope
- In:
  - El criterio `language` deja de ser un predicado. Pasa a ser dos preguntas de opción en el mismo request de hoy, y el código compara sus respuestas (ver *Expected behavior*).
  - Vale para las respuestas de datos y para las de texto.
  - Tests unitarios offline y la descripción del criterio en `docs/ARCHITECTURE.md` (y en `README.md`, si cambia algo que se lee ahí).
- NOT in:
  - El input del request del idioma: sigue sin el historial y con el esquema en las respuestas de datos, y con `judge-reply-input.liquid` en las de texto.
  - Un campo con el idioma esperado en el golden (ver *Deferred decisions*).
  - Los otros criterios, el pipeline y el golden.

## Expected behavior
- **Las dos preguntas** (redacción final en la implementación):
  - **el idioma del mensaje:** `English`, `Spanish` u `other`;
  - **el idioma del texto que escribió el bot:** sus narrativas o su respuesta, los nombres de columna y los títulos de los resultados y de los gráficos, sin contar los valores de las filas ni los nombres propios. Las opciones son `English`, `Spanish`, `mixed` u `other`.
- **El valor del criterio** es la probabilidad de que los dos idiomas coincidan: la suma, para cada idioma que está en las dos listas, de su probabilidad en el mensaje por su probabilidad en la respuesta. Una respuesta `mixed` nunca coincide.
- **La salida no cambia de forma:** el criterio sigue mostrándose como `language <probabilidad>` y en el resumen como un promedio de probabilidad.
- **Edge cases:**
  - Si el judge rechaza alguna de las dos preguntas, el criterio queda *refused*.
  - Si alguna respuesta no es una opción, o sus probabilidades no traen las opciones, es un error del caso, como hoy con una respuesta de otra forma.

## Data
- **El reporte JSON** guarda, para el idioma, las dos respuestas tal como vinieron y el valor calculado.
- No cambian el golden ni `app.db`.
- **Verificación con respuestas fijas** (un script descartable, como en #29 y #36): se vuelven a juzgar con el criterio nuevo y el esquema de hoy las respuestas de las corridas de #33, #34, #36 y #35, y las 5 respuestas en el idioma equivocado de la verificación de #29.

## Dependencies
- Se apoya en #29 (el criterio de idioma) y #36 (el request propio del idioma).
- Externo: OpenAI (Decisions API) para el re-juicio y la corrida real.

## Acceptance criteria
- [ ] El criterio de idioma son dos preguntas de opción, comparadas en código como dice *Expected behavior*, para las respuestas de datos y las de texto.
- [ ] Tests offline:
  - [ ] el valor calculado con varias combinaciones de probabilidades (coinciden, no coinciden, `mixed`);
  - [ ] el rechazo de alguna de las dos preguntas;
  - [ ] una respuesta de otra forma, o probabilidades sin las opciones;
  - [ ] lo que guarda el reporte.
- [ ] Re-juicio con respuestas fijas:
  - [ ] todas las respuestas correctas de esas 4 corridas dan 0,5 o más de idioma, incluidas las 4 de `margin-share-by-category`;
  - [ ] las 5 respuestas en el idioma equivocado dan menos de 0,5.
- [ ] Una corrida real de `npm run eval` en Verification. Avisa que no es estrictamente comparable con las anteriores, porque cambió el criterio de idioma.
- [ ] `docs/ARCHITECTURE.md` describe el criterio nuevo.
- [ ] El quality gate pasa.

## Non-functional notes
- **Costo:** el mismo número de requests. El re-juicio son unas 90 llamadas a la Decisions API, una por respuesta.
- **Seguridad:** la respuesta sigue yendo al judge como contenido, nunca como instrucciones.

## Assumptions
Confirmadas en el refinamiento (2026-10-24):
- Dos preguntas de opción comparadas en código, en vez del predicado.
- Para las respuestas de datos y las de texto.
- Se verifica con las respuestas fijas de las últimas 4 corridas, las 5 rotas de #29 y una corrida real.

Propuestas al escribir el issue, sin una pregunta aparte:
- Las opciones `English`, `Spanish` y `other` para el mensaje, más `mixed` para la respuesta.
- El valor como la probabilidad de que coincidan, para que el criterio siga en la misma escala.
- El input del idioma no cambia: así la verificación mide solo el cambio de criterio.

## Deferred decisions
- **El idioma esperado en el golden.** Sería lo más firme, porque el judge detecta el español del mensaje con solo 0,71 a 0,78. Se suma si el criterio nuevo no alcanza.
- **Sacar el esquema del input del idioma.** En #36, sacarlo empeoró el predicado. Con las preguntas de opción podría no hacer falta, pero se mide aparte.

## Notes
- 2026-10-24: **Cambio respecto del issue, decidido por el usuario durante la implementación.**
  - **Por qué:** las dos preguntas de opción no alcanzaron el criterio de aceptación del re-juicio. El judge lee el idioma del mensaje con ruido, y ninguna redacción dejó todas las respuestas correctas en 0,5 o más:
    - con la mejor, `margin-share-by-category` de #35 quedó en 0,44;
    - con la más simple, `as-pie-chart` quedó en 0,36 y 0,48, porque el judge leía "mostralo como gráfico de torta" como otro idioma.
  - **Qué se hizo:** se adelantó la decisión diferida *El idioma esperado en el golden*.
    - Cada caso del golden lleva `language` (`English` o `Spanish`), obligatorio.
    - El criterio es una sola pregunta de opción sobre el idioma del texto del bot (`English`, `Spanish`, `mixed` u `other`), y su valor es la probabilidad del idioma del caso.
    - El reporte guarda la respuesta tal como vino, el valor y el idioma esperado (`expectedLanguage`).
  - **Qué reemplaza:** las "dos preguntas de opción comparadas en código" de *Scope*, *Expected behavior*, *Data* y el primer criterio de aceptación. El campo del golden sale del *NOT in*. Los demás criterios de aceptación siguen igual.

## Pull request
Branch: `fix/38-idioma-respuestas-cortas` → `main`

### Qué hace
- **El criterio de idioma** (`judgeLanguage` en `backend/src/evaluate.ts`) deja de ser un predicado. Es una pregunta de opción sobre el idioma del texto del bot: sus narrativas o su respuesta, los nombres de columna y los títulos. No cuentan el SQL, los valores de las filas ni los nombres propios.
  - Las opciones son `English`, `Spanish`, `mixed` y `other`.
  - **El valor** es la probabilidad que el judge le da al idioma del caso; `mixed` y `other` nunca coinciden.
  - Vale igual para las respuestas de datos y las de texto. El input del request no cambia.
  - Es un cambio respecto del issue, que pedía dos preguntas (ver *Notes*).
- **La descripción de `mixed`** aclara que un nombre o un valor en otro idioma no hace mixta una respuesta.
- **El golden:** cada caso lleva `language` (`English` o `Spanish`), obligatorio. `parseGolden` frena el eval antes de llamar a OpenAI si falta o no es uno de los dos.
- **Bordes:**
  - si el judge rechaza la pregunta, el criterio queda *refused*;
  - si la respuesta no es una opción, o sus probabilidades no traen todas las opciones, es un error del caso.
- **El reporte** guarda la respuesta tal como vino (`answer`), el valor (`probability`) y el idioma esperado del caso (`expectedLanguage`). La salida no cambia: `language <probabilidad>` y el promedio en el resumen.
- **Tests:**
  - el valor con varias combinaciones: el idioma esperado, otro, `mixed`, `other` y parcialmente `mixed`;
  - el rechazo, en una respuesta de texto y en una de datos;
  - 4 respuestas de otra forma: un predicado, una opción que no existe, probabilidades sin todas las opciones y una probabilidad que no es número;
  - el idioma faltante o desconocido en el golden;
  - lo que guarda el reporte.
- **Docs:** el criterio, el campo del golden y el reporte, en `docs/ARCHITECTURE.md` y `README.md`.

### Hallazgos de la verificación
- **Las dos preguntas del issue no alcanzaron.** Con el re-juicio, el texto del bot se lee bien, pero el idioma del mensaje sale con ruido y depende de la respuesta que lo acompaña. "Hola" dio español entre 0,61 y 0,97, según la corrida. Se probaron 5 redacciones de la pregunta del mensaje, y cada una dejaba alguna respuesta correcta por debajo de 0,5:

  | Redacción del mensaje | Respuestas correctas bajo 0,5 |
  |---|---|
  | La simple | `as-pie-chart`: 0,36 y 0,48. Leía "mostralo como gráfico de torta" como otro idioma, con hasta 0,63 |
  | "Only the words of the question count" | `margin-share-by-category` 0,44, `return-rate-by-category` 0,40 y `target-march-2025` 0,28 |
  | La simple, más "Spanish: any variety, such as Rioplatense" | `margin-share-by-category` de #35: 0,44 |

  Por eso el usuario eligió adelantar la decisión diferida: el idioma esperado en el golden.
- **`mixed` necesitaba su descripción.** Con "some parts in one language and some in another", las respuestas en español con "Office Supplies" salían `mixed` con hasta 0,40. Con la descripción actual, `mixed` quedó en 0,21 como máximo en las respuestas correctas.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (33 archivos, 660 tests), sobre el último commit (`ebb4ad6`). Una corrida anterior, antes de la self-review, cortó con "Timeout waiting for worker to respond" en 4 archivos del frontend: es el corte de workers descrito en `docs/ARCHITECTURE.md` (Quality gate). La siguiente pasó completa.
- Coverage: 99,75% de statements, 97,48% de branches, 99,63% de funciones y 100% de líneas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno (`evaluate.ts` al 100%).
- **Re-juicio con respuestas fijas.** Se usó el `evaluateCase` real con un LLM falso que repite cada respuesta guardada. Las filas salen de correr su SQL sobre `data.db`. Solo el request del idioma fue al judge real: 89 llamadas, una por respuesta.
  - **Qué se re-juzgó:** las 84 respuestas, de datos y de texto, de las corridas de #33 (`eval-2026-10-23T15-51-23-980Z`), #34 (`…16-40-21-050Z`), #36 (`…24T01-03-18-455Z`) y #35 (`…24T02-01-35-651Z`), más las 5 en el idioma equivocado de #29.
  - **Una de las 84 no es correcta:** `capital-of-france-after-spanish` de #34 salió en español, el bug de #37. Va con las rotas.

  | Medición | Con el predicado | Ahora |
  |---|---|---|
  | `margin-share-by-category` (#33, #34, #36, #35) | 0,91, 0,75, 0,03, 0,64 | **0,79, 0,89, 0,91, 0,77** |
  | La más baja de las 83 correctas | 0,03 | **0,77** (`margin-share-by-category` de #35) |
  | `as-pie-chart` (las 4) | 0,92 a 0,99 | 0,89 a 0,97 |
  | Las 5 rotas de #29 | 0,03 a 0,48 | **0,00 a 0,02** |
  | `capital-of-france-after-spanish` de #34 | 0,00 | 0,00 |
  | Promedio de idioma por corrida (#33, #34, #36, #35) | 0,99, 0,93, 0,95, 0,98 | 0,98, 0,93, 0,98, 0,98 |

- Criterios de aceptación (con los cambios de *Notes*):
  - **El criterio, para las respuestas de datos y las de texto: pass.** Es una pregunta de opción comparada en código con el idioma del caso, como dice *Notes*.
  - **Tests offline del valor, del rechazo, de las respuestas de otra forma y del reporte: pass.**
  - **Re-juicio: pass.**
    - Las 83 respuestas correctas dan 0,77 o más, incluidas las 4 de `margin-share-by-category`.
    - Las 5 rotas dan 0,02 como máximo.
  - **Corrida real en Verification: pass** (abajo).
  - **`docs/ARCHITECTURE.md`: pass.**
  - **Quality gate: pass.**
- `npm run eval` real (2026-10-24, pipeline `gpt-5.4-mini`, judge `gpt-6-luna`), 23 casos, salida 0. Corrió sobre `5bcb1fa`. El último commit solo une dos tipos y suma un test.
  ```
  sales-by-month-2025: classification ok | sql 2.00/2 | narrative 2.00/2 | chart 0.95 | language 1.00
  revenue-by-country: classification ok | sql 1.98/2 | narrative 1.91/2 | chart 0.98 | language 1.00
  top-products-by-units: classification ok | sql 2.00/2 | narrative 2.00/2 | chart 1.00 | language 1.00
  category-share: classification ok | sql 1.97/2 | narrative 1.97/2 | chart 0.98 | language 0.90
  customer-count: classification ok | sql 2.00/2 | narrative 1.98/2 | chart n/a | language 1.00
  average-order-by-segment: classification ok | sql 2.00/2 | narrative 1.95/2 | chart 0.96 | language 1.00
  orders-2024: classification ok | sql 2.00/2 | narrative 2.00/2 | chart n/a | language 0.99
  separate-lists: classification ok | sql 1.97/2 | narrative 1.98/2 | chart 0.99 | language 0.98
  greeting: classification ok | language 0.00
  capital-of-france: classification ok | language 1.00
  how-are-we-doing: classification ok | language 1.00
  chart-not-shown: classification ok | sql 1.53/2 | narrative 1.98/2 | chart 0.95 | language 0.96
  as-pie-chart: classification ok | sql 1.48/2 | narrative 1.95/2 | chart 0.99 | language 0.96
  and-in-2024: classification ok | sql 1.88/2 | narrative 1.67/2 | chart 0.99 | language 0.99
  thanks-after-answer: classification ok | language 1.00
  capital-of-france-after-spanish: classification ok | language 1.00
  top-products-after-spanish: classification ok | sql 1.97/2 | narrative 1.97/2 | chart 0.98 | language 1.00
  margin-share-by-category: classification ok | sql 1.99/2 | narrative 2.00/2 | chart n/a | language 0.70
  margin-by-country-2025: classification ok | sql 2.00/2 | narrative 0.95/2 | chart 0.96 | language 1.00
  target-march-2025: classification ok | sql 1.98/2 | narrative 1.96/2 | chart n/a | language 0.99
  categories-below-target-2025: classification ok | sql 0.99/2 | narrative 1.98/2 | chart 0.95 | language 1.00
  return-rate-by-category: classification ok | sql 1.91/2 | narrative 1.99/2 | chart n/a | language 0.93
  most-common-return-reason: classification ok | sql 2.00/2 | narrative 2.00/2 | chart n/a | language 1.00
  Summary: 23 questions, 18 answered, 0 without an answer, 5 with another label, 0 errors
    The SQL answers the question: 1.87/2 (18 judged, 0 refused, 0 not applicable)
    The narrative is faithful to the data: 1.90/2 (18 judged, 0 refused, 0 not applicable)
    The chart fits: 0.97 average probability (12 judged, 0 refused, 6 not applicable)
    The answer is in the language of the message: 0.93 average probability (23 judged, 0 refused, 0 not applicable)
    Classification: 23/23 correct (0 without a label)
  ```
  - **No es estrictamente comparable con las corridas anteriores,** porque cambió el criterio de idioma.
  - **`greeting`, 0,00 de idioma: es un acierto.** El bot contestó "Hola" en inglés: "Hi! I can help answer questions about customers, products, orders…". Sin ese caso, el promedio de idioma es 0,97.
  - **`margin-share-by-category`, 0,70 de idioma:** la respuesta está en español, y el judge la ve `Spanish` con 0,70 y `mixed` con 0,25.
  - **`categories-below-target-2025`, 0,99 de SQL: el SQL está mal.** Une `sales_targets` en cada pedido, así que suma el objetivo de cada mes una vez por pedido. El judge lo marca con razón. Es una respuesta nueva del pipeline.
  - **`margin-by-country-2025`, 0,95 de narrativa:** las cifras coinciden con las filas. El judge probablemente objeta "a relatively narrow range" (de 5.535 a 7.996). El request de la narrativa no cambió con este PR.
- Self-review: 1 ronda con un agente nuevo (separado), sin bloqueantes. Se aplicaron:
  - un solo caso `judged` en `CriterionResult`, con la probabilidad opcional;
  - un test del idioma rechazado en una respuesta de datos;
  - un párrafo del README reacomodado.

  La sugerencia de verificar las cifras de las docs (hasta 0,63, 0,45 y 0,40) se revisó: son las probabilidades de una opción en el re-juicio, distintas de los valores del criterio que cita *Notes*. No se cambió.
- Plan: aprobado por el usuario ("si", 2026-10-24), con `other` contra `other` como coincidencia. Después, el usuario eligió el idioma en el golden (ver *Notes*), y esa regla dejó de aplicar.
- Security: no se tocó superficie de seguridad. Es el eval offline: el campo nuevo del golden se valida contra una lista fija, y la respuesta sigue yendo al judge como contenido, nunca como instrucciones. No hay secretos en el diff.
- Docs: updated `docs/ARCHITECTURE.md` y `README.md`

### Out of scope / follow-ups
- La respuesta de texto a "Hola" (`greeting`) salió en inglés en la corrida real. Se ofrece como follow-up.
- El SQL de `categories-below-target-2025` suma el objetivo una vez por pedido. Se ofrece como follow-up.
- Sigue diferido sacar el esquema del input del idioma. Ahora el judge no lee el idioma del mensaje, así que podría no hacer falta, pero se mide aparte.
