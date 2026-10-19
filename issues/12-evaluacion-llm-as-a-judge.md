---
id: 12
title: Evaluar respuestas offline con LLM-as-a-judge (npm run eval)
type: feat
status: open
parent: 1
created: 2026-10-19
---

## Goal
Medir la calidad de las respuestas del chatbot de forma repetible. `npm run eval` corre un set de preguntas golden por el pipeline real, y un juez (la Decisions API de OpenAI) puntúa cada respuesta. Es para quien desarrolla el POC: lo corre a mano para ver si un cambio de prompts o del pipeline mejora o empeora las respuestas.

## Scope
- In:
  - Un archivo golden versionado (JSON) con preguntas sobre el dataset demo de #2 (pendiente: pregunta 1).
  - El comando `npm run eval`, desde la raíz y sin argumentos. Para cada pregunta corre el pipeline completo en proceso (sin HTTP) y juzga la respuesta con la Decisions API.
  - Los criterios del juez: el SQL responde la pregunta, la narrativa es fiel a los datos y el gráfico es adecuado (pendiente: pregunta 2).
  - Un resumen por consola y un reporte JSON en una ruta gitignored (pendiente: pregunta 3).
  - Las llamadas `scores` / `predicates` a la Decisions API, dentro del único módulo de OpenAI que define `docs/ARCHITECTURE.md`.
  - Tests unitarios offline (cliente OpenAI falso y pipeline falso) y la documentación en `README.md`.
- NOT in:
  - Formar parte del quality gate (`npm run lint`, `npm run test:coverage`) o correr dentro de los tests.
  - La evaluación online (juzgar cada respuesta del chat en vivo) y las explicaciones del juez vía Responses API. Las dos están diferidas en `docs/ARCHITECTURE.md`.
  - Conversaciones multi-turn en el set golden: cada pregunta corre sola, en una conversación nueva.
  - Evaluar la clasificación de #10 (pendiente: pregunta 4). Tampoco se evalúan las sugerencias de seguimiento ni la tabla, que el backend arma con las filas reales.
  - Filtros por id o categoría, corridas en paralelo, repeticiones por pregunta, comparación entre corridas, costo en tokens y umbrales que hagan fallar el comando (pendiente: pregunta 3).
  - Guardar resultados en SQLite (el reporte JSON es la única salida persistida). Tampoco hay ajustes "lenient" de veredictos como los del proyecto de referencia.

## Expected behavior
- Normal case:
  1. `npm run eval` chequea primero la configuración de OpenAI que usan el pipeline y el juez (`OPENAI_API_KEY` y los ids de modelo). También chequea que el archivo golden sea válido y que exista `data/data.db`. Recién entonces empieza.
  2. Toma las preguntas en orden, de a una. Cada pregunta corre por el pipeline como una conversación nueva: clasificación si existe #10, SQL con reintentos, ejecución con guardas, insights y gráfico. La corrida no escribe en `data/app.db`.
  3. Con la respuesta, le pide al juez cada criterio (pendiente: pregunta 2). Guarda el valor que devuelve la Decisions API: el score en la escala de la rúbrica o la probabilidad del predicado, más la confianza si viene.
  4. Imprime una línea por pregunta, con el id y el resultado de cada criterio o el error. Al final imprime el resumen: el agregado por criterio y cuántas preguntas quedaron sin respuesta, cuántos criterios fueron rechazados y cuántos no aplican (pendiente: pregunta 3).
  5. Escribe el reporte JSON, imprime su ruta y sale con código 0 aunque haya puntajes bajos o preguntas sin respuesta (pendiente: pregunta 3).
- Edge cases:
  - Respuesta sin gráfico: el criterio del gráfico queda como "no aplica". No se le pregunta al juez y no entra en los agregados.
  - Resultado con 0 filas: se juzga igual, porque la narrativa debería decir que no hay datos. Si no hay gráfico, ese criterio no aplica.
  - El pipeline no da una respuesta con datos: la clasificación de #10 marca la pregunta como no respondible, o se agotan los reintentos de SQL. La pregunta queda "sin respuesta" con el motivo, no se llama al juez y la corrida sigue con la siguiente (pendiente: pregunta 4).
  - El juez rechaza un criterio (la respuesta de tipo `refusal` de la Decisions API): ese criterio queda como "rechazado" y no entra en los agregados. Los demás criterios de la misma pregunta se guardan.
- Errors:
  - Errores de arranque: falta `OPENAI_API_KEY` o un id de modelo, o el archivo golden no existe, no es JSON válido, está vacío o tiene casos sin pregunta o con ids repetidos. En todos imprime un mensaje claro, sale con un código distinto de 0, no llama a OpenAI y no escribe reporte.
  - Falta `data/data.db`: lo mismo, y el mensaje sugiere correr `npm run seed`.
  - Falla una llamada al juez (red, 4xx/5xx, cambio de la beta) o hay un error inesperado en una pregunta: se registra en esa pregunta y la corrida sigue. No hay reintentos propios, solo los del SDK.

## Data
- Entrada: el archivo golden JSON, versionado. Cada caso trae un `id` único y la `question` (pendiente: pregunta 1). Está escrito para el dataset demo de #2 y se reemplaza junto con él. Trae un set chico de preguntas que ejercita los tres criterios: al menos una debería producir un gráfico, por ejemplo una evolución en el tiempo. La cantidad y el texto exactos se definen en el plan.
- Lo que recibe el juez por pregunta:
  - la pregunta;
  - el contexto de esquema, el mismo que #7 arma desde los metadatos;
  - el SQL ejecutado;
  - el resultado: columnas y filas, acotadas por el tope de #6;
  - la narrativa;
  - la especificación del gráfico (tipo, eje X, series, título), si hay.

  Cómo se reparte entre llamadas (una por pregunta con todos los criterios, o una por criterio) se decide en el plan. Lo que se juzga (SQL, narrativa, filas) va como contenido a evaluar, nunca como instrucciones para el juez.
- Salida:
  - El resumen en consola, en inglés.
  - Un reporte JSON por corrida, en una ruta gitignored. Como mínimo trae la fecha y hora de la corrida, los modelos usados y los agregados del resumen. Por cada pregunta trae el id, la pregunta, el SQL, la cantidad de filas, la narrativa, la especificación del gráfico (si hay) y el resultado de cada criterio: el valor y la confianza, o "no aplica" / "rechazado" / el error. Si la pregunta quedó sin respuesta, trae el motivo.
  - La forma exacta del JSON y el nombre del archivo se definen en el plan.
- Persistido: solo el reporte. Nada en `data/app.db`. `data/data.db` se usa solo con la conexión read-only.

## Dependencies
- Lo bloquean:
  - #7: generación de SQL y contexto de esquema.
  - #8: la orquestación del pipeline.
  - #9: la especificación del gráfico.
  - #6: ejecución con guardas y tope de filas.
  - #2: dataset demo y `npm run seed`.
- Relacionadas:
  - #10: si ya está, el pipeline incluye la clasificación. Comparte con este issue la llamada a la Decisions API en el módulo de OpenAI y la variable del modelo.
  - #11: cada pregunta golden corre sin turnos previos.
- Externo: la OpenAI API, con Responses para el pipeline y Decisions para el juez. Decisions está en beta pública desde octubre de 2026, y lo que se sabe de ella viene de fuentes secundarias. Al implementar hay que verificar contra la documentación oficial de OpenAI la forma del request, los tipos de pregunta, la forma de la respuesta (incluido `refusal`) y el soporte en el SDK `openai`. Si el SDK no la tipa, se llama por su método genérico de request, como dice `docs/ARCHITECTURE.md`. Nada de este issue es el contrato de la API.

## Acceptance criteria
- [ ] `npm run eval` existe en el `package.json` raíz y corre la evaluación sin levantar el servidor ni pedir `APP_ACCESS_KEY`.
- [ ] El repo trae el archivo golden con preguntas sobre el dataset demo de #2. Incluye al menos una pregunta que debería producir un gráfico (pendiente: pregunta 1).
- [ ] Cada pregunta respondida se juzga con los criterios acordados, usando `scores` y/o `predicates` de la Decisions API a través del módulo único de OpenAI (pendiente: pregunta 2). Un test con cliente falso verifica qué se le pide al juez y cómo se registra la respuesta.
- [ ] Si la respuesta no trae gráfico, el criterio del gráfico queda "no aplica" y no se le pregunta al juez por él (test).
- [ ] Si una pregunta queda sin respuesta del pipeline, se registra con su motivo, sin llamar al juez, y la corrida sigue (test) (pendiente: pregunta 4).
- [ ] Un `refusal` del juez deja el criterio "rechazado", fuera de los agregados (test).
- [ ] Si el juez falla en una pregunta, el error queda registrado y la corrida sigue (test).
- [ ] Si falta configuración, el archivo golden es inválido o no existe `data/data.db`: mensaje claro, salida distinta de 0, sin llamadas a OpenAI y sin reporte (tests).
- [ ] Los agregados del resumen se calculan solo sobre los criterios juzgados (pendiente: pregunta 3) (test).
- [ ] El reporte JSON trae los campos de *Data* y se escribe en una ruta que `git check-ignore` confirma ignorada. En los tests se escribe en un directorio temporal.
- [ ] La corrida no escribe en `data/app.db` (test con las dependencias inyectadas).
- [ ] Los tests son offline y deterministas: cliente OpenAI falso, sin red. `npm run lint` y `npm run test:coverage` pasan con cobertura ≥ 85%. El script de entrada solo llama funciones testeadas y queda excluido de la cobertura en `vitest.config.ts`, como permite `docs/ARCHITECTURE.md`.
- [ ] Si este issue suma variables de entorno, quedan en `.env.example` con un placeholder.
- [ ] `README.md` explica cómo correr la evaluación: requisitos (`npm run seed` y un `.env` con claves reales), que cuesta plata y dónde queda el reporte. Si los criterios finales cambian el diseño, se actualiza la sección *Evaluation* de `docs/ARCHITECTURE.md`.
- [ ] Verificación manual, fuera del gate y con una `OPENAI_API_KEY` real: una corrida contra el `data.db` sembrado imprime el resumen y escribe el reporte.

## Non-functional notes
- Costo: cada pregunta paga una corrida completa del pipeline más las llamadas al juez. Por eso el set es chico, se corre a mano y queda fuera del gate.
- No es determinístico: dos corridas pueden dar puntajes distintos. El resultado se lee como tendencia, no como test.
- Corre secuencial, una pregunta por vez. Es lo más simple: `node:sqlite` es sincrónico y el set es chico.
- Seguridad:
  - Las claves salen de `.env` y el reporte no incluye secretos.
  - El SQL generado pasa por las mismas guardas de #6 que el chat.
  - Lo que se juzga es salida de un LLM y datos, así que se trata como contenido no confiable y nunca como instrucciones para el juez.
- La Decisions API no da justificación, así que el reporte muestra valores sin explicaciones.
- Sin dependencias nuevas: `openai` lo suma #7 y el archivo golden es JSON.

## Assumptions
- La base confirmada es la sección *Evaluation* de `docs/ARCHITECTURE.md` y el "Ok" del usuario en el epic.
- El eval corre el pipeline en proceso, llamando a sus funciones y no a `POST /api/chat`. Viene de `docs/ARCHITECTURE.md`, que dice tres cosas: el eval corre las preguntas "por el pipeline", las funciones del pipeline reciben el cliente como parámetro, y los scripts que solo llaman funciones testeadas quedan fuera de la cobertura. Por eso no necesita servidor ni `APP_ACCESS_KEY`.
- El archivo golden es JSON y su ruta es fija, no configurable:
  - JSON porque no suma dependencias (`workflow/principles.md`: "justificar cada dependencia").
  - Ruta fija porque `docs/ARCHITECTURE.md` deja fijas las rutas hasta que haya un motivo.
- Las preguntas son independientes, sin multi-turn: `docs/ARCHITECTURE.md` habla de "un archivo de preguntas golden".
- No escribe en `data/app.db`. `docs/ARCHITECTURE.md` nombra como salidas del eval el resumen y el reporte JSON, y `app.db` guarda las conversaciones del chat.
- El modelo del juez sale de `.env`, nunca del código (`docs/ARCHITECTURE.md`: "Model ids come from `.env`"). Si la Decisions API necesita un modelo distinto de `OPENAI_MODEL`, se usa la misma variable que defina #10. Fuentes secundarias indican que la beta soporta un único modelo.
- Los valores de la Decisions API se registran tal cual vienen. Según fuentes secundarias, `scores` devuelve una posición ponderada que puede caer entre niveles, `predicates` devuelve una probabilidad, y cualquier pregunta puede volver como `refusal`. Hay que verificarlo al implementar.
- La consola y las claves del JSON van en inglés, porque `workflow/rules.md` pide código y logs en inglés.

## Deferred decisions
- La evaluación online y la justificación del juez: ya están diferidas en `docs/ARCHITECTURE.md`.
- Casos golden multi-turn, filtros por id, paralelismo, repeticiones para medir la varianza, comparación con una corrida base y costo en tokens. Se suman cuando aparezca una necesidad real.
- Referencias esperadas por pregunta (SQL o hechos clave), según la respuesta a la pregunta 1.
- Evaluar la clasificación de #10, según la respuesta a la pregunta 4.

## Open questions
1. **¿Qué trae cada caso del archivo golden?**
   - (a) Solo `id` y `question`. El juez evalúa sin referencia, contra la pregunta, el esquema y las filas reales.
   - (b) Además un `expectedSql` opcional. El eval lo ejecuta con las guardas de #6 y suma un criterio "el resultado coincide con el esperado": un predicado del juez sobre los dos resultados. Es más preciso, pero hay que escribir y mantener un SQL por pregunta y rehacerlo cuando cambia el dataset.
   - (c) Además un `expectedAnswer` opcional en texto libre, con los hechos clave, juzgado con un predicado "la narrativa es consistente con la respuesta esperada".
   - Recomendación: (a). Es lo que piden los criterios aprobados, y el set se reescribe fácil cuando se reemplaza el dataset. (b) y (c) se pueden sumar después como campos opcionales.
2. **¿Qué criterios exactos y con qué mecanismo?**
   - (a) Los tres criterios aprobados:
     - "el SQL responde la pregunta", como `scores` con una rúbrica de 3 niveles: no la responde / la responde en parte / la responde por completo;
     - "la narrativa es fiel a los datos", como `scores` con 3 niveles: contradice o inventa cifras / tiene imprecisiones menores / es totalmente fiel;
     - "el gráfico es adecuado", como `predicate`, solo cuando hay gráfico.
   - (b) Los tres como `predicates` de sí o no. Es más simple de leer, pero pierde el "en parte" y deja `scores` sin uso.
   - (c) Lo de (a) más predicados extra: "responde en el idioma de la pregunta" (lo pide `docs/ARCHITECTURE.md`), "la narrativa responde directamente la pregunta" y "las sugerencias son relevantes".
   - Recomendación: (a). Cubre exactamente lo aprobado y usa los dos mecanismos que nombra `docs/ARCHITECTURE.md`. Sumar un criterio después es una entrada más.
3. **¿Cómo se resumen los resultados y cuándo falla el comando?** Según fuentes secundarias, `scores` devuelve un número continuo en la escala de la rúbrica y `predicates` una probabilidad.
   - (a) Sin veredicto ni umbrales. El reporte guarda los valores tal cual. El resumen muestra el promedio por criterio (los scores sobre el máximo de la escala, los predicados como probabilidad promedio) y los conteos de sin respuesta, rechazados y no aplica. Sale con 0 si la corrida terminó.
   - (b) Además, PASS/FAIL por pregunta con una regla fija: cada predicado da ≥ 0.5 y cada score redondea al nivel más alto. El resumen muestra "X/N PASS". Sale con 0 igual.
   - (c) Como (b), pero sale con un código distinto de 0 si alguna pregunta da FAIL.
   - Recomendación: (a). El eval es informativo y queda fuera del gate, y un veredicto obliga a fijar umbrales arbitrarios que hoy nadie pidió. (b) se puede sumar después sin cambiar el reporte.
4. **(Se solapa con #10) ¿Qué pasa con la clasificación?** Si #10 ya está, el pipeline puede marcar una pregunta golden como "necesita aclaración" o "fuera de alcance" y no generar SQL.
   - (a) El set golden solo trae preguntas respondibles. Si el pipeline no da una respuesta con datos, ya sea por la clasificación o por agotar los reintentos, la pregunta queda "sin respuesta" con el motivo y se cuenta en el resumen. La clasificación no se evalúa.
   - (b) Cada caso puede traer una etiqueta de clasificación esperada, que se compara exacto, sin juez. Así se pueden probar preguntas fuera de alcance, pero el formato del archivo golden queda atado a las etiquetas de #10, que todavía no están definidas.
   - (c) Lo de (b) más un predicado del juez para las respuestas fuera de alcance: "explica qué datos sí hay".
   - Recomendación: (a). No depende del diseño pendiente de #10, y un rechazo indebido igual aparece como "sin respuesta". (b) se suma cuando #10 tenga sus etiquetas.
