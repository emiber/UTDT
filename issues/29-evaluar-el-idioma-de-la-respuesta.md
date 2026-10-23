---
id: 29
title: Evaluar en el set golden que la respuesta esté en el idioma del mensaje
type: feat
status: refined
parent:
created: 2026-10-22
---

## Goal
Que `npm run eval` (#12) mida si la respuesta está en el idioma del último mensaje, aunque los turnos anteriores vengan en otro. Es para quien desarrolla el POC: los bugs de #22 y #23 se encontraron a mano, y hoy un cambio de prompts los puede volver a romper sin que nada avise.

- #22: "What is the capital of France?", después de varias preguntas en español, se respondió en español. Era una respuesta de texto (fuera de tema), y el judge hoy no ve las respuestas de texto.
- #23: "Top 5 products by units sold", después de preguntas en español, devolvió los alias del SQL ("Producto", "Unidades vendidas") y la narrativa en español.

Los dos se arreglaron con un campo `language` al principio de los esquemas de salida del SQL, de los insights y de la respuesta de texto. Reforzar la regla del prompt no alcanzó.

## Scope
- In:
  - Un criterio nuevo en la rúbrica del judge (`backend/src/evaluate.ts`), `language`: un predicado, como el del gráfico. Pregunta si todo lo que escribió el bot está en el idioma del último mensaje y no en el de los turnos anteriores (ver *Expected behavior*). El judge deduce el idioma del mensaje: el golden no suma un campo de idioma.
  - Las respuestas de datos suman el criterio a la llamada al judge de hoy. Los criterios de SQL (con la regla de seguimientos de #31), narrativa y gráfico no cambian.
  - Las respuestas de texto pasan a tener una llamada al judge, con solo el criterio de idioma. Su input tiene el historial del caso, el mensaje y el texto de la respuesta, como contenido, nunca como instrucciones.
  - La salida: `language` en cada línea por caso, una línea del criterio en el resumen, y la cuenta "not judged" del resumen pasa a mostrarse como "with another label".
  - 2 casos nuevos en el golden (ver *Data*).
  - Tests unitarios offline y las docs: la sección del eval en `README.md` y en `docs/ARCHITECTURE.md`.
- NOT in:
  - Cambiar el pipeline, sus prompts o sus esquemas. Si la corrida real muestra una respuesta en otro idioma, se anota, no se arregla acá.
  - Un campo con el idioma esperado en el golden.
  - Las sugerencias de las respuestas: el judge no las ve hoy, y no se suman a su input.
  - Juzgar el idioma de un caso mal clasificado.
  - Juzgar en las respuestas de texto otra cosa que el idioma.
  - Detectar el idioma en código (#22 lo dejó afuera).
  - Veredictos PASS/FAIL, umbrales o un código de salida por los resultados. Siguen diferidos como en #12.

## Expected behavior
- **Qué cuenta para el idioma:** el texto que escribió el bot y que el judge ve: la narrativa de cada resultado o el texto de la respuesta, los nombres de columna (los alias del SQL), los títulos de los resultados y los de los gráficos. No cuentan los valores de las filas ni los nombres propios: "Electronics" en una narrativa en español está bien.
- **El idioma esperado** es el del último mensaje, sea cual sea el de los turnos anteriores o el de los datos. Lo dice la rúbrica, y el judge lo deduce del mensaje.
- **Una respuesta mezclada** no cumple el criterio. Por ejemplo, para un mensaje en inglés, la narrativa en inglés y los alias en español.
- **Qué respuestas se juzgan por idioma:** las que tienen el tipo esperado.
  - Una respuesta de datos a un caso que espera `data_question`: el criterio va en la misma llamada que SQL, narrativa y gráfico.
  - Una respuesta de texto a un caso que espera otra etiqueta, aunque la etiqueta obtenida no sea la esperada: una llamada con solo el criterio de idioma.
  - No se juzga el idioma de un caso con el tipo equivocado (una respuesta de texto a una pregunta de datos, o una de datos a un caso que espera otra etiqueta), de un fallo de SQL ni de un error del pipeline. La clasificación o el estado del caso ya marcan el problema.
- **Edge cases:**
  - Una respuesta de texto no entra en las cuentas de SQL, narrativa ni gráfico, tampoco como "not applicable".
  - Si el judge rechaza el criterio de idioma, queda *refused*, como los otros.
- **Errores:** si el judge falla en una respuesta de texto, se anota en el caso y la corrida sigue, como hoy con las de datos. Ese caso queda afuera del conteo de clasificación, como cualquier caso con error.
- **Salida** (el formato exacto se cierra en el plan de `/work-issue`):
  - Cada línea juzgada por idioma suma `language <probabilidad>` al final. Por ejemplo, `greeting: classification ok | language 0.99` y `top-products-after-spanish: classification ok | sql 2.00/2 | narrative 2.00/2 | chart 1.00 | language 0.99`.
  - El resumen suma una línea como la del gráfico: `The answer is in the language of the message: 0.99 average probability (17 judged, 0 refused, 0 not applicable)`.
  - En la primera línea del resumen, la cuenta "not judged" pasa a "with another label", que es lo que significa: el caso espera una etiqueta que no es de datos. Por dentro el estado sigue siendo `not_judged`, y el reporte JSON sigue usando `notJudged`.
  - El comando sale con 0 cuando termina la corrida, sean cuales sean los resultados, como hoy.

## Data
- **Golden:** el formato del caso no cambia. Hay 2 casos nuevos (el golden pasa de 15 a 17), con el mismo historial en español:

  | id | Mensaje | Etiqueta esperada | Bug |
  |---|---|---|---|
  | `capital-of-france-after-spanish` | "What is the capital of France?" | `out_of_scope` | #22 |
  | `top-products-after-spanish` | "Top 5 products by units sold" | `data_question` | #23 |

  - El historial son los turnos en español de la conversación donde se vio #23: "Hola!", "Ventas por mes en 2025", "No veo el gráfico" y "¿Cuántos clientes hay?". El SQL y la narrativa de cada turno se copian de una corrida real del pipeline sobre el dataset demo, como en #28.
  - La dirección inversa (un mensaje en español después de turnos en inglés) ya la cubre `and-in-2024`. En la corrida de #28 respondió con alias en español ("Mes", "Ventas totales"), y el PR de #28 lo anotó como el bug de #23. Pero el mensaje, "¿y en 2024?", es en español: esa respuesta es la correcta.
- **Salida:** el reporte JSON (`data/eval/`, gitignored) guarda el resultado del criterio de idioma de cada caso juzgado, y su promedio y sus cuentas en el resumen.
- No se persiste nada nuevo: el eval sigue sin escribir en `app.db`.
- **Verificación de que el eval avisa** (un cambio local que no se commitea):
  - Se saca el campo `language` de los esquemas del SQL, de los insights y de la respuesta de texto (`generate-sql.ts`, `insights.ts` y `reply.ts`). Con eso, se corren los 2 casos nuevos 3 veces, por ejemplo con un golden descartable que solo los tiene a ellos.
  - Si un caso no responde en español en ninguna de las 3 corridas, el bug no se reproduce con ese historial. Se alarga el historial de ese caso hasta 5 turnos (los que manda el pipeline, `HISTORY_TURNS`), con otra pregunta en español sacada de una corrida real, y se repite. Si sigue sin reproducirse, se anota en el PR y se consulta.
  - Después, los esquemas vuelven a estar como antes, y la corrida real se hace con el arreglo.

## Dependencies
- Se apoya en #12 (el eval), #28 (el historial en el golden y en el input del judge) y #31 (el criterio de SQL de los seguimientos), todos cerrados.
- Externo: la corrida real usa OpenAI (Responses API y Decisions API), igual que hoy.

## Acceptance criteria
- [ ] La rúbrica tiene el criterio de idioma, un predicado, con lo que dice *Expected behavior*. Cuentan la narrativa o el texto de la respuesta, los alias y los títulos. El idioma es el del último mensaje y no el de los turnos anteriores. No cuentan los valores de las filas ni los nombres propios.
- [ ] Una respuesta de datos a un caso que espera `data_question` se juzga por idioma en la misma llamada que los otros criterios.
- [ ] Una respuesta de texto a un caso que espera otra etiqueta tiene una llamada con solo el criterio de idioma, con el historial, el mensaje y la respuesta como contenido.
- [ ] No se juzga el idioma de los casos con el tipo equivocado, de los fallos de SQL ni de los errores.
- [ ] Las respuestas de texto no entran en las cuentas de SQL, narrativa ni gráfico. Si el judge falla en una respuesta de texto, el error queda en el caso y la corrida sigue.
- [ ] Las líneas por caso muestran `language`, y el resumen tiene la línea del criterio. La cuenta "not judged" se muestra como "with another label". El reporte JSON incluye el resultado del idioma.
- [ ] Los 2 casos nuevos de *Data* están en el golden, con el historial copiado de una corrida real.
- [ ] Con el campo `language` sacado de los esquemas (sin commitear), cada caso nuevo responde en español (o mezclado) al menos una vez. Cada vez que pasa, el criterio de idioma da menos de 0,5. Los resultados de todas esas corridas van en Verification.
- [ ] En la corrida real de `npm run eval` con el arreglo, el criterio de idioma da 0,5 o más en todos los casos juzgados. Si un caso da menos, se mira su respuesta. Si de verdad está en otro idioma, es un bug del pipeline y se anota. Si está en el idioma correcto, el error es del criterio y se ajusta la rúbrica.
- [ ] Tests unitarios offline (cliente OpenAI y pipeline falsos) para todo lo anterior. La cobertura sigue sobre el 85% y el quality gate pasa.
- [ ] `README.md` y `docs/ARCHITECTURE.md` describen el criterio de idioma, qué respuestas se juzgan y la cuenta renombrada.
- [ ] La sección Verification del PR incluye la verificación con el arreglo sacado y la corrida real con sus resultados. Compara SQL, narrativa y gráfico de los 15 casos de antes con la corrida de #31, y avisa que la corrida no es estrictamente comparable con las anteriores, porque la rúbrica suma un criterio.

## Non-functional notes
- **Costo:** una corrida pasa de unas 52 llamadas a unas 63. Son 5 llamadas nuevas del judge para las respuestas de texto (las 4 de hoy y la de `capital-of-france-after-spanish`), 1 de clasificación y 1 de respuesta para ese caso, y unas 4 para `top-products-after-spanish`. La verificación con el arreglo sacado son unas 7 llamadas por ronda de los 2 casos, unas 21 con 3 rondas. Todo sigue fuera del quality gate.
- **Riesgo:** sumar una pregunta a la llamada de las respuestas de datos podría mover los puntajes de los otros criterios (#31 vio que la redacción de la rúbrica los mueve). Verification lo compara con la corrida de #31. Si alguno baja claramente, se anota y se consulta antes de cerrar.
- **Seguridad:** el historial y las respuestas van al judge como contenido a juzgar, nunca como instrucciones, igual que hoy.

## Assumptions
Confirmadas en el refinamiento (2026-10-23):
- Se mide el idioma de las respuestas de datos y de las de texto.
- El judge deduce el idioma del último mensaje. El golden no suma un campo de idioma.
- Los 2 casos nuevos son los de los bugs, después de turnos en español. La dirección inversa ya la cubre `and-in-2024`.
- Que el eval avisa se comprueba sacando a mano el campo `language` de los esquemas, sin commitearlo. Si el bug no se reproduce con el historial del golden, se alarga.
- El criterio es un predicado.
- Cuentan la narrativa o el texto de la respuesta, los alias y los títulos. No cuentan los valores de las filas, los nombres propios ni las sugerencias.
- Solo se juzga el idioma cuando el tipo de respuesta coincide con el esperado.
- La cuenta "not judged" del resumen se muestra como "with another label". El estado interno no cambia.

Propuestas al escribir el issue, sin una pregunta aparte:
- El historial de los casos nuevos son los 4 turnos en español de la conversación de #23. Se alarga hasta 5 (`HISTORY_TURNS`) si el bug no se reproduce.
- Con el arreglo sacado, 3 corridas de los 2 casos. Alcanza con que el bug aparezca una vez en cada uno.
- El 0,5 de los criterios de aceptación es para leer las corridas: por encima, el "sí" es lo más probable, como el "nivel más probable" de #31. No es un veredicto: el eval sigue sin umbrales.
- El input de las respuestas de texto lleva el historial, como el de las de datos, y no lleva el esquema.
- Un fallo del judge en una respuesta de texto se trata como hoy en las de datos: es un error del caso.
- Los ids `capital-of-france-after-spanish` y `top-products-after-spanish`.

## Deferred decisions
- **Un campo con el idioma esperado en el golden.** Se suma si el judge se equivoca al deducirlo.
- **Las sugerencias.** Salen de la misma salida que la narrativa, con el mismo campo `language`. Sumarlas al input del judge podría mover los otros criterios.
- **Un puntaje de 3 niveles** que distinga la respuesta mezclada. Hoy alcanza con el predicado.
- **Juzgar el idioma de los casos mal clasificados.** La clasificación ya los marca.
- **Veredictos, umbrales, filtros por id y repeticiones por caso:** siguen diferidos como en #12.

## Notes
- 2026-10-23: en la implementación, con el idioma en la misma llamada que SQL, narrativa y gráfico, la corrida real dio 0,16 a `chart-not-shown` y 0,01 a `as-pie-chart`, respondidos en español como sus mensajes. Con respuestas fijas se vio la causa: el judge tomaba los ejemplos en inglés del encabezado del historial ("show it as a chart", en `history.liquid`, que es del pipeline) por el mensaje, y decía que "No veo el gráfico" estaba en inglés. Siete redacciones de la rúbrica no lo arreglaron. El usuario decidió juzgar el idioma en un request aparte, con el mismo input sin el historial, y la respuesta de texto también sin historial. Esto reemplaza "en la misma llamada" de *Scope* y *Expected behavior*, y la propuesta de *Assumptions* de que el input de texto lleve el historial. La Decisions API juzga cada pregunta por separado, así que el request aparte no mueve los otros criterios; cuesta unas 12 llamadas más por corrida.
- 2026-10-23: con respuestas fijas, `as-pie-chart` sigue en 0,43 sin el historial: el judge lee "mostralo como gráfico de torta" como español con 0,71 de probabilidad (es corto, con voseo, y "mostralo" también es italiano). El usuario aceptó anotarlo como un límite del judge.
