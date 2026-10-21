---
id: 24
title: Registrar el tiempo y los tokens de cada llamada al LLM
type: feat
status: refined
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
- [ ] `llm_calls` se crea al arrancar, también sobre un `app.db` existente, sin perder turnos (test).
- [ ] Cada llamada al LLM del turno queda en `llm_calls` con su `step`, `attempt`, `model`, `duration_ms` y los tokens de entrada y salida que devuelve OpenAI (tests con el cliente falso).
- [ ] Los reintentos del SQL quedan como filas separadas, con su número de intento (test).
- [ ] Un turno que falla guarda las llamadas hechas hasta la falla; una llamada fallida queda con su tiempo y sin tokens (tests).
- [ ] Verificación manual con la API real: algunas preguntas, y los valores guardados en `app.db` revisados.
- [ ] Docs actualizados.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- Una tabla aparte y no columnas en `turns`: es una fila por llamada (de 2 a 5 por turno), conserva el detalle de cada reintento y el modelo de cada llamada, y se extiende sin tocar `turns`. Lo decidió el usuario.
- Los tokens se guardan separados en entrada y salida, porque OpenAI los cobra a precios distintos. Lo decidió el usuario.
