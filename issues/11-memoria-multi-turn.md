---
id: 11
title: Agregar memoria multi-turn a las conversaciones
type: feat
status: refined
parent: 1
created: 2026-10-19
---

## Goal
Que el bot entienda preguntas de seguimiento ("¿y para el año pasado?", "¿y por producto?") usando los turnos anteriores de la misma conversación. Después de #8 el hilo ya se persiste, pero cada pregunta se responde aislada.

## Scope
- In:
  - Leer de `app.db` los últimos 5 turnos de la conversación (los persiste #8), del más viejo al más nuevo, con pregunta, SQL y narrativa. Nunca las filas de datos. Un turno fallido entra solo con su pregunta.
  - Mandar ese historial como contexto a la generación de SQL (#7), en cada uno de sus 3 intentos, y al paso de insights (narrativa y sugerencias, de #8).
  - Ajustar los prompts de esos dos pasos para que presenten el historial como contexto para resolver referencias de la pregunta actual. El historial va como una sección de sus templates LiquidJS (el mecanismo de #7, que también usa el prompt de insights de #8).
  - Tests unitarios y de integración, con cliente OpenAI falso.
- NOT in:
  - Persistir conversaciones y turnos (incluidos los fallidos, con su `error`), y el ida y vuelta del `conversationId`: es #8.
  - Mandar el historial a la clasificación: lo conecta #10, reutilizando el mismo historial.
  - Cambios en el contrato de `POST /api/chat`.
  - Cambios en el frontend, incluido un botón de "nueva conversación". Una conversación nueva empieza al recargar la página: el frontend del chat (#13) guarda el `conversationId` solo en memoria, y la access key sobrevive a la recarga en `sessionStorage` (#4).
  - Resumir o truncar el historial, o hacer configurable la ventana de 5 turnos.
  - El feedback de reintentos dentro de un mismo turno (errores de guardas o de SQL): es de #7 y no forma parte del historial.

## Expected behavior
- Caso normal: el usuario pregunta "ventas por mes en 2024" y después, con el `conversationId` que devolvió ese turno, "¿y para 2023?". El backend carga el turno anterior y lo pasa a la generación de SQL y a los insights. El SQL nuevo repite el agrupamiento por mes con el filtro en 2023, y la narrativa puede referirse al turno anterior.
- Empezar una conversación nueva: el usuario recarga la página. El frontend (#13) pierde el `conversationId`, que vive solo en memoria, y no vuelve a pedir la access key, que sigue en `sessionStorage` (#4). La pregunta siguiente sale sin `conversationId`, así que #8 crea otra conversación y el historial es vacío.
- Qué es el historial:
  - los turnos ya persistidos de esa conversación, anteriores a la pregunta actual (la actual no se incluye);
  - como máximo 5, del más viejo al más nuevo;
  - por turno: la pregunta, el SQL final si lo tiene, y la narrativa (el texto que respondió el bot). No incluye filas, bloques `table` ni `chart`, ni sugerencias.
- Edge cases:
  - Sin `conversationId` (conversación nueva), o conversación sin turnos: historial vacío. Los pasos funcionan como single-turn, sin turnos previos en los requests al LLM.
  - Menos de 5 turnos previos: van todos. Más de 5: solo los 5 últimos.
  - Turno sin SQL (p. ej. una respuesta que no consultó datos, como las que agregue #10): va con pregunta y narrativa.
  - Turno fallido: cualquier turno persistido con `error`, p. ej. cuando se agotan los 3 intentos de #7 y #8 responde `200` con un texto fijo y sin sugerencias.
    - Entra al historial solo con su pregunta. Nunca van el último SQL intentado, el texto del error ni la narrativa o respuesta que haya quedado persistida (p. ej. el texto fijo).
    - Ocupa un lugar en la ventana de 5, como cualquier otro turno.
    - Así, un "¿y por producto?" posterior todavía puede referirse a esa pregunta, sin que el modelo tome como válido un SQL que se sabe roto.
  - Pregunta nueva que no depende de las anteriores (cambio de tema): el prompt presenta el historial solo como contexto; la pregunta actual es la que se responde.
  - Turnos de otras conversaciones nunca entran.
  - Si #9 ya está, el spec de gráfico se arma en el paso de insights, así que también ve el historial.
- Errores:
  - `conversationId` inexistente: #8 responde `404`, y el frontend (#13) descarta el id, así que la próxima pregunta empieza una conversación nueva. Este issue no cambia ese comportamiento.
  - Falla la lectura del historial en `app.db`: sin manejo especial, se propaga como cualquier otro error de `app.db` en #8.

## Data
- Entrada: el `conversationId` del request, que ya está en el contrato de #8. El cliente no manda historial: el backend lo lee de `app.db`.
- Lee de la tabla de turnos de #8, por turno: pregunta, SQL (puede faltar), narrativa (puede faltar), `error` (solo para saber si el turno falló; su texto no se usa) y orden de creación.
- Salida interna: una lista ordenada de hasta 5 elementos `{ question, sql?, narrative? }`, que reciben los pasos de SQL y de insights. Un turno con `error` queda solo con `question`.
- No persiste nada nuevo. No cambia el esquema de `app.db` ni la respuesta de `POST /api/chat`.

## Dependencies
- Depende de #8: persistencia de conversaciones y turnos (también los fallidos, con su `error`), `conversationId`, y el paso de insights.
- Depende de #7: generación de SQL con 3 intentos en total, y sus templates LiquidJS, donde va el historial.
- #9: no depende. Los bloques `chart` no entran al historial.
- #10: no depende. En el epic va antes de #10, porque #10 conecta este mismo historial a la clasificación.
- #13: no depende, porque este issue no toca el frontend. Que guarde el `conversationId` solo en memoria es lo que hace que recargar la página empiece una conversación nueva. La verificación manual de la recarga usa su UI.
- #12: no depende. Corre cada pregunta golden sin turnos previos, así que usa los pasos con historial vacío.
- Servicio externo: OpenAI Responses API, a través del módulo LLM de #7. Los tests usan un cliente falso.

## Acceptance criteria
- [ ] Con 7 turnos persistidos en una conversación, se cargan exactamente los 5 últimos, del más viejo al más nuevo. Con 3, se cargan los 3.
- [ ] Sin `conversationId`, o con una conversación sin turnos, el historial es vacío y los requests al LLM no llevan turnos previos.
- [ ] Con dos conversaciones intercaladas en `app.db`, el historial de una nunca incluye turnos de la otra.
- [ ] Cada request de la generación de SQL lleva pregunta, SQL y narrativa de cada turno del historial. Cuando #7 agota sus 3 intentos, los 3 requests lo llevan (test con cliente falso).
- [ ] El request del paso de insights lleva el mismo historial.
- [ ] Un valor centinela que solo aparece en las filas de un turno anterior (tabla o gráfico) no aparece en ningún request al LLM.
- [ ] La pregunta actual no aparece como turno del historial.
- [ ] Un turno sin SQL o sin narrativa se incluye con los campos que tiene, sin dejar valores vacíos ni `null` en el prompt.
- [ ] Un turno persistido con `error`, con valores centinela en su SQL, en el texto del error y en su narrativa o respuesta, entra al historial solo con su pregunta: la pregunta aparece en los requests al LLM y ninguno de esos centinelas aparece en ningún request (test con cliente falso).
- [ ] Un turno fallido cuenta para la ventana: con 6 turnos persistidos, uno de ellos fallido entre los 5 últimos, se cargan exactamente esos 5, y el fallido solo con su pregunta.
- [ ] Test de integración con `app.inject`:
  - un segundo `POST /api/chat` con el `conversationId` del primero manda el primer turno como contexto a la generación de SQL y a los insights; uno sin `conversationId` no manda historial;
  - si en el primer turno se agotan los 3 intentos de #7 (`200` con texto fijo), el segundo turno de esa conversación manda solo la pregunta del primero, sin su SQL ni su error.
- [ ] La forma de la respuesta de `POST /api/chat` no cambia: los tests de contrato de #8 siguen pasando.
- [ ] El cambio no toca el código de `frontend/`.
- [ ] Verificación manual con la API real y el seed demo: una pregunta con filtro de período y, en la misma conversación, "¿y para el año anterior?" devuelve un SQL con el mismo agrupamiento y el período cambiado.
- [ ] Verificación manual en la UI del chat (#13): después de ese hilo, recargar la página no vuelve a pedir la access key, y la pregunta siguiente sale sin `conversationId` y se responde sin el contexto anterior.
- [ ] `npm run lint` y `npm run test:coverage` pasan, con cobertura ≥ 85% en líneas, sentencias, funciones y ramas.

## Non-functional notes
- El contexto queda acotado por la ventana fija de 5 turnos, una constante en el código. No se trunca ni se resume: las narrativas son cortas por diseño.
- Seguridad: el historial sale solo de `app.db`, filtrado por `conversationId`, así que el cliente no puede inyectar turnos. Las preguntas previas son texto del usuario, con la misma confianza que la actual. Las guardas de #6 siguen protegiendo la ejecución.
- Tests offline y determinísticos: SQLite en memoria o en archivo temporal, y cliente OpenAI falso.

## Assumptions
- Los insights reciben el mismo historial que la generación de SQL, con el SQL incluido. Sale de `docs/ARCHITECTURE.md` (*Multi-turn*: "the last 5 turns (question, SQL, narrative) go to the classify, SQL and insights steps").
- "Narrativa" de un turno es el texto que respondió el bot, sin tabla, gráfico ni sugerencias. Sale de "question, SQL, narrative — not the data rows" en `docs/ARCHITECTURE.md`.
- La pregunta actual no forma parte de su propio historial. El turno se persiste al final del pipeline (paso 6 en `docs/ARCHITECTURE.md`), y la pregunta ya viaja aparte a cada paso.
- La ventana de 5 turnos es una constante, no una variable de `.env`. Sale de *Configuration* en `docs/ARCHITECTURE.md` (los "context turns" son un valor fijo).
- El historial se lee en el servidor y no viaja en el request. Sale del contrato `{ conversationId?, question }` en `docs/ARCHITECTURE.md`.
- Conectar el historial a la clasificación queda para #10. Sale del comentario del usuario en #10 ("Hablemos de esto en un chat aparte cuando sea el momento"): su diseño todavía no existe.
- Un error al leer el historial no tiene fallback (no se responde "sin memoria" en silencio). Es la opción mínima (`workflow/principles.md`, Ponytail).
- **Turnos fallidos en el historial.** Decisión propuesta durante el refinamiento y confirmada por el usuario el 2026-10-19 (opción A): un turno persistido con `error` entra solo con su pregunta, nunca con el SQL fallido ni el texto del error.
- **Cómo empezar una conversación nueva.** Decisión propuesta durante el refinamiento y confirmada por el usuario el 2026-10-19 (opción A): recargando la página, sin UI nueva, porque el frontend del chat (#13) guarda el `conversationId` solo en memoria y la access key sobrevive en `sessionStorage` (#4).

## Deferred decisions
- Resumir o truncar el historial, o hacer configurable la ventana: con 5 turnos cortos no hace falta. `docs/ARCHITECTURE.md` lo deja fijo hasta que haya un motivo.
- Estado de conversación del lado de OpenAI (`previous_response_id`): `docs/ARCHITECTURE.md` decidió guardar los turnos en `app.db` y mandar el contexto desde el backend, así el mismo historial sirve a los tres pasos.
- Casos multi-turn en la evaluación offline: #12 los deja afuera (cada pregunta golden corre sin turnos previos). Se suman allá si aparece la necesidad.
- Un botón de "nueva conversación" en la UI: recargar la página alcanza, y la ventana de 5 turnos ya limita cuánto arrastra el contexto viejo.
