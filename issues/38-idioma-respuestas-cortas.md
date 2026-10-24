---
id: 38
title: Evitar falsos negativos del criterio de idioma en respuestas cortas con nombres en inglés
type: fix
status: refined
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
