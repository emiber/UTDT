---
id: 36
title: Evitar que los puntajes del judge cambien al sumar tablas al esquema
type: fix
status: refined
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
