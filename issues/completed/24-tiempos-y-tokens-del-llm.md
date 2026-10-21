---
id: 24
title: Registrar el tiempo y los tokens de cada llamada al LLM
type: feat
status: closed
parent:
created: 2026-10-21
---

## Goal
Que cada turno guardado en `app.db` diga cuánto tardó y cuántos tokens usó cada llamada al LLM, para analizar el rendimiento y el costo. Hoy `turns` solo guarda la duración total del turno (`duration_ms`).

Pedido del usuario:
1. cuánto demoró la llamada al LLM para generar la consulta SQL;
2. cuánto demoró la llamada al LLM para generar la respuesta;
3. los tokens de cada llamada, sumando los de los reintentos.

## Scope
- In:
  - **Una tabla nueva en `app.db`,** con un registro por llamada al LLM:
    ```
    llm_calls
      id             INTEGER PRIMARY KEY
      turn_id        INTEGER NOT NULL REFERENCES turns (id)
      step           TEXT NOT NULL      -- 'classify' | 'sql' | 'answer'
      attempt        INTEGER NOT NULL   -- 1 a 3 en 'sql'; 1 en el resto
      model          TEXT NOT NULL
      duration_ms    INTEGER NOT NULL   -- solo la llamada al LLM
      input_tokens   INTEGER            -- vacío si OpenAI no los informó
      output_tokens  INTEGER
    ```
  - **Qué llamadas se registran:**
    - `sql`: la generación del SQL (Responses API), una fila por intento. El tiempo es solo el de la llamada al LLM, sin la ejecución en SQLite.
    - `answer`: la llamada que escribe la respuesta. Para una pregunta de datos son los insights; para un mensaje que no es de datos, la respuesta de texto.
    - `classify`: la clasificación (Decisions API). Usa otro modelo, así que queda en su propio `step`, separada de las dos anteriores.
  - **Cómo se guarda:** el turno y sus llamadas se guardan en una misma transacción. Un turno que falla guarda las llamadas que se llegaron a hacer. Una llamada que falla del todo (timeout, error de OpenAI) guarda su tiempo, con los tokens vacíos.
  - **`app.db` existente:** la tabla se crea al arrancar si falta, y los turnos se conservan.
  - Tests y docs (`docs/ARCHITECTURE.md`: el paso de persistencia y *Observability*).
- NOT in:
  - Mostrar estos datos en la UI o en el reporte de `npm run eval`.
  - Los tokens cacheados u otros detalles de uso. La tabla permite sumarlos después sin tocar `turns`.

## Expected behavior
- Una pregunta de datos que sale al primer intento guarda 3 filas: `classify`, `sql` (intento 1) y `answer`.
- Una pregunta de datos que necesita 3 intentos de SQL guarda 5 filas, con `sql` en los intentos 1, 2 y 3.
- Un "Hola" guarda 2 filas: `classify` y `answer`.
- Si falla la clasificación, el pipeline sigue por el camino de datos: queda la fila de `classify` con su tiempo y sin tokens, y después las del SQL y la respuesta.
- Los totales por turno y por paso salen con un `GROUP BY turn_id, step`.

## Acceptance criteria
- [x] `llm_calls` se crea al arrancar, también sobre un `app.db` existente, sin perder turnos (test).
- [x] Cada llamada al LLM del turno queda en `llm_calls` con su `step`, `attempt`, `model`, `duration_ms` y los tokens de entrada y salida que devuelve OpenAI (tests con el cliente falso).
- [x] Los reintentos del SQL quedan como filas separadas, con su número de intento (test).
- [x] Un turno que falla guarda las llamadas hechas hasta la falla; una llamada fallida queda con su tiempo y sin tokens (tests).
- [x] Verificación manual con la API real: algunas preguntas, y los valores guardados en `app.db` revisados.
- [x] Docs actualizados.
- [x] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- Una tabla aparte y no columnas en `turns`: es una fila por llamada (de 2 a 5 por turno), conserva el detalle de cada reintento y el modelo de cada llamada, y se extiende sin tocar `turns`. Lo decidió el usuario.
- Los tokens se guardan separados en entrada y salida, porque OpenAI los cobra a precios distintos. Lo decidió el usuario.

## Pull request
Branch: `feat/24-tiempos-y-tokens-del-llm` → `main`

### What it does
- **Tabla `llm_calls`** en `app.db` (`backend/src/conversations.ts`), con una fila por llamada al LLM: `turn_id`, `step` (`classify`, `sql`, `answer`), `attempt`, `model`, `duration_ms`, `input_tokens` y `output_tokens`. Se crea al arrancar si falta, sin tocar los turnos. `saveTurn` guarda el turno y sus llamadas en una misma transacción.
- **Medición** (`backend/src/llm.ts`): `requestStructured` y `requestDecision` miden cada llamada y se la pasan a un callback opcional (`onCall`).
  - El tiempo es el de la llamada al LLM, con los reintentos del SDK incluidos, y no incluye la ejecución en SQLite.
  - Una llamada sin respuesta (timeout, error de la API) queda con su tiempo y sin tokens. Un rechazo o una respuesta incompleta conservan los tokens que informa OpenAI.
- **Etiquetado:**
  - cada paso del pipeline (`pipeline.ts`) marca sus llamadas: `classify`, `sql`, y `answer` para los insights o la respuesta de texto;
  - `generateSql` agrega el número de intento;
  - la ruta del chat (`chat.ts`) junta las llamadas y las guarda también si el turno falla (502 o 500).
- **Fakes de los tests:** `jsonResponse` y `fakeClassifier` devuelven tokens, como OpenAI.
- **Docs:** `docs/ARCHITECTURE.md` (tabla de bases, paso 6 con la consulta de totales, *Observability*) y `README.md`.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (28 archivos, 438 tests)
- Coverage: 100% en sentencias, funciones y líneas, y 98,93% en ramas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno.
- Manual: pass, con la API real (`gpt-5.4-mini` y `gpt-6-luna`), sobre una copia del `app.db` real.
  - La copia conservó sus 95 turnos. La tabla ya existía: el `npm run dev` del usuario, con `--watch`, tomó el código de la rama y registró sus propias preguntas (turnos 90 a 95).
  - "Hola!" guardó 2 filas: `classify` y `answer`.
  - "Ventas por mes en 2025", "¿Cuántos clientes hay?" y "Top 5 products by units sold" guardaron 3 filas cada una: `classify`, `sql` y `answer`.
    - Todas tienen su modelo y tokens reales. Por ejemplo, el turno 97: `classify` 448 ms con 767/0 tokens, `sql` 1307 ms con 850/114, y `answer` 1849 ms con 1057/184.
    - La suma de las llamadas cabe en la duración total del turno: 3604 de 3654 ms en el turno 97.
    - La clasificación siempre tiene 0 tokens de salida: la Decisions API solo cobra la entrada.
  - Los reintentos del SQL y las llamadas fallidas no se dieron con la API real. Quedan cubiertos por tests, incluido un test de mutación de la medición del tiempo.
- Self-review: 2 rondas en un subagente nuevo, sin blockers.
  - La 1.ª pidió:
    - un test que fije la medición del tiempo;
    - tests de los caminos de falla que faltaban: la respuesta de texto fallida, un 500 después de llamadas registradas y la respuesta fallida en el 502;
    - la nota de migración;
    - volver a desarmar la respuesta de `requestDecision` dentro del `try`.
  - La 2.ª pidió fijar que cada camino de `requestDecision` registra una sola llamada, y precisar dos expectativas y una frase de la doc.
  - Todo se aplicó.
- Plan: aprobado por el usuario el 2026-10-21. El diseño de la tabla aparte también lo eligió el usuario.
- Security: los `INSERT` son parametrizados. No se expone nada por HTTP, y en `llm_calls` no van ni la pregunta ni el SQL.
- Docs: updated `docs/ARCHITECTURE.md`, `README.md`

### Out of scope / follow-ups
- Mostrar estos datos en la UI o en el reporte de `npm run eval`, y registrar los tokens cacheados. El issue los deja fuera de alcance, y la tabla permite sumarlos sin tocar `turns`.
