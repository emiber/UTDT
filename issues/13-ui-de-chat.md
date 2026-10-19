---
id: 13
title: Agregar la UI de chat con narrativa, tabla y sugerencias
type: feat
status: refined
parent: 1
created: 2026-10-19
---

## Goal
Que el usuario haga preguntas en lenguaje natural desde la pantalla principal y vea, en un hilo, la respuesta de `POST /api/chat` (#8): la narrativa en markdown, la tabla con los datos reales y sugerencias que puede mandar con un clic. Es la mitad frontend del chat; el backend es #8. El gráfico lo suma #9.

## Scope
- In:
  - **Vista de chat** en la pantalla principal, la que se ve después de la access key (#4). Va en la misma pantalla que la sección plegable *Available data* del catálogo de #5, junto a ella, y no la cambia. Tiene el hilo de la conversación, un input para la pregunta y un botón para enviar.
  - **`postChat`** en `frontend/src/api.ts`, que llama a `POST /api/chat` con la función de request autenticada de #4. Así:
    - lleva `Authorization: Bearer <key>`;
    - un `401` vuelve a pedir la key sin que el chat lo maneje;
    - los demás errores HTTP exponen su status.
  - **Renderer de bloques**, que los muestra en orden: `text` como markdown, sin interpretar HTML crudo, y `table` como tabla HTML simple, con encabezados. #9 le suma el bloque `chart`.
  - **Sugerencias** como botones debajo de cada respuesta. Un clic manda la sugerencia en el momento como la pregunta siguiente, en la misma conversación.
  - **Estados** de espera y de error, incluido el `404` de un `conversationId` que no existe.
  - **El hilo y el `conversationId`, solo en memoria**: recargar la página empieza una conversación nueva.
  - **Una dependencia nueva** para renderizar markdown, que `docs/ARCHITECTURE.md` ya prevé. Se elige en el plan y se justifica en el PR.
  - Docs:
    - en `docs/ARCHITECTURE.md`:
      - en *Frontend*, quitar *(later issue)* de la vista de chat (el gráfico sigue siendo de #9) y decir que las sugerencias son botones;
      - en *Tech stack*, sumar la librería de markdown;
    - en `README.md`, actualizar *Status*: la UI ya tiene el chat, con narrativa, tabla y sugerencias.
  - Tests unitarios del frontend.
- NOT in:
  - El backend: `POST /api/chat`, el pipeline, los insights y la persistencia son de #8.
  - El bloque `chart` y su componente: son de #9.
  - Un botón *New conversation*: recargar la página empieza una conversación nueva.
  - Recuperar el hilo después de recargar, o listar conversaciones: no hay un endpoint para leerlas (#8).
  - Guardar el hilo o el `conversationId` en `sessionStorage`, `localStorage` o cookies.
  - Reenviar una pregunta automáticamente después de un error.
  - Mostrar el SQL: no está en el contrato.
  - Formatear valores en la tabla (miles, monedas, fechas): se muestran como llegan, que es como los devuelve SQLite.
  - Lo que `docs/ARCHITECTURE.md` difiere (ver *Deferred decisions*).

## Expected behavior
- Caso normal:
  1. El usuario escribe una pregunta y la envía.
  2. La pregunta aparece en el hilo con un indicador de espera. El input, el botón y las sugerencias quedan deshabilitados hasta que llega la respuesta.
  3. Al llegar, se muestran los bloques en orden y, debajo, las sugerencias como botones.
  4. La primera pregunta va sin `conversationId`. Las siguientes mandan el recibido.
- Sugerencias:
  - un clic manda la sugerencia en el momento, con el `conversationId` actual, y la muestra en el hilo como cualquier otra pregunta;
  - los botones de todas las respuestas del hilo siguen disponibles, y se deshabilitan mientras hay una pregunta en curso.
- El hilo y el `conversationId` viven en memoria: recargar la página empieza una conversación nueva, con el hilo vacío. No hay un botón para empezar otra.
- Edge cases:
  - Respuesta con solo el bloque `text` (0 filas, o los intentos agotados de #8): se muestra la narrativa, sin tabla.
  - `suggestions: []` (intentos agotados): no se muestran botones.
  - Encabezados repetidos o numéricos (`id`, `id`, `2023`): la tabla muestra todas las columnas, en el orden de `columns`. Cada celda se ubica por su posición en la fila, no por el nombre de la columna.
  - Narrativa con HTML (p. ej. `<img src=x onerror=…>`): se muestra como texto y no se interpreta.
  - Input vacío o solo con espacios: no se puede enviar.
- Errores. Se muestran en el hilo, en el lugar de la respuesta, y después se vuelve a habilitar el input:
  - `404` (el `conversationId` ya no existe en el backend):
    - se descarta el `conversationId` guardado;
    - se muestra un mensaje corto, p. ej. *This conversation is no longer available. Your next question will start a new one.*;
    - la pregunta no se reenvía sola. La siguiente que mande el usuario va sin `conversationId` y empieza una conversación nueva;
    - el hilo visible no se borra.
  - Error de red o cualquier otro status de error (p. ej. `502` o `500`):
    - se muestra un mensaje de error con el status, p. ej. *Could not get an answer: HTTP 502*, o con el mensaje del error si fue de red;
    - el `conversationId` guardado se conserva. Si era la primera pregunta, todavía no hay uno, así que la siguiente empieza una conversación nueva.
  - `401`: el chat no muestra un error propio. La función de request de #4 borra la key y vuelve a la pantalla de key.

## Data
- Request a `POST /api/chat`: `{ conversationId?, question }`. `question` es lo que escribió el usuario o el texto de la sugerencia.
- Respuesta `200`, definida por #8. Los nombres exactos son los que fije #8 al implementarse.

  ```ts
  {
    conversationId: string; // opaco: solo se guarda y se devuelve
    turnId: number;         // todavía no se usa
    blocks: Block[];        // [text, table], o solo [text]
    suggestions: string[];  // 3, o [] si se agotaron los intentos
  }

  type Block =
    | { type: 'text'; markdown: string }
    | { type: 'table'; columns: string[]; rows: (string | number | null)[][] };
  ```

- Errores: el error que rechaza la función de request de #4 expone el status si fue una respuesta HTTP. El chat solo distingue el `404`, y no lee el body de error.
- Estado en memoria del componente:
  - el `conversationId` actual, o ninguno;
  - el hilo: una lista de turnos, cada uno con la pregunta y su estado (esperando, respuesta con bloques y sugerencias, o error).
- Persistido en el navegador: nada. La key sigue en `sessionStorage` (#4).

## Dependencies
- Depende de:
  - #8: el contrato de `POST /api/chat`. Son los bloques `text` y `table`, las sugerencias, el `200` con el mensaje fijo de los intentos agotados y los errores `404`, `502` y `500`.
  - #4: la función de request autenticada, el manejo del `401` y el status HTTP en los errores.
  - #5: la pantalla principal con la sección *Available data*, junto a la que va el chat.
- Bloquea a #9, en su parte de frontend: el componente del gráfico se suma a este renderer de bloques.
- Servicios externos: ninguno. Los tests no necesitan el backend: stubbean `fetch` o mockean la función de la API.

## Acceptance criteria
- [ ] `postChat` llama a `POST /api/chat` a través de la función de request de #4 (lleva `Authorization: Bearer <key>`) y devuelve el JSON. Ante un status de error o un error de red, lanza el error de #4, con su status si lo hay.
- [ ] La primera pregunta va sin `conversationId`, y las siguientes, con el recibido.
- [ ] El hilo muestra cada pregunta y sus bloques en orden: el markdown renderizado (p. ej. `**x**` da un `<strong>`) y la tabla con encabezados y filas.
- [ ] Con dos columnas del mismo nombre, la tabla muestra las dos, cada una con su valor.
- [ ] Una narrativa con `<img src=x onerror=…>` se muestra escapada: no aparece ningún elemento `img`.
- [ ] Una respuesta con solo un bloque `text` no muestra tabla, y una con `suggestions: []` no muestra botones.
- [ ] Mientras espera la respuesta, se ve un indicador, y el input, el botón y las sugerencias están deshabilitados. Con el input vacío o solo con espacios no se puede enviar.
- [ ] Un clic en una sugerencia la manda en el momento como pregunta, con el mismo `conversationId`, y aparece en el hilo.
- [ ] Ante un `404`, se muestra el mensaje corto en el lugar de la respuesta y no se hace otra llamada. La siguiente pregunta va sin `conversationId`.
- [ ] Ante un error de red o un status de error (p. ej. `500`), se muestra un mensaje de error en el hilo y se puede volver a preguntar. Si ya había un `conversationId`, la siguiente pregunta lo conserva.
- [ ] El hilo y el `conversationId` no se guardan en `sessionStorage` ni en `localStorage`: al montar de nuevo la pantalla, el hilo está vacío y la primera pregunta va sin `conversationId`.
- [ ] El chat está en la pantalla principal, junto a la sección *Available data* de #5, y los tests del catálogo siguen pasando.
- [ ] La única dependencia nueva es la del markdown, en `frontend/package.json`, justificada en el PR.
- [ ] `docs/ARCHITECTURE.md` y `README.md` quedan actualizados como dice *Scope*.
- [ ] Los tests unitarios usan Vitest, `@vue/test-utils` y jsdom, con `fetch` stubbeado o la función de la API mockeada.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85% (líneas, sentencias, funciones y ramas), y el código nuevo queda cubierto.
- [ ] Verificación manual, fuera del gate, con #8 andando, una `OPENAI_API_KEY` real y el seed demo. Después de ingresar la key:
  - una pregunta en español y otra en inglés muestran la narrativa en su idioma y una tabla con datos reales;
  - un clic en una sugerencia se responde en la misma conversación.

## Non-functional notes
- Seguridad: la narrativa sale de un LLM que recibe texto del usuario y datos, así que se renderiza sin HTML crudo para evitar XSS. La key la maneja #4.
- Una pregunta a la vez y sin streaming: el usuario espera la respuesta completa, que puede llevar varias llamadas a OpenAI (#8).
- La tabla puede traer hasta 500 filas (el tope de #6) y se muestra entera, sin paginar.
- Textos de la UI en inglés y hardcodeados. Estilos en SCSS, con los tokens existentes. Sin router, librería de estado ni UI kit (`docs/ARCHITECTURE.md`, *Frontend*).

## Assumptions
- **Este issue salió de #8, a pedido del usuario** (pregunta 1 de #8, opción A, confirmada el 2026-10-19). #8 quedó con el backend, y este issue tomó entera la parte de frontend de su borrador. Es el mismo corte que #3 y #4.

Decisiones confirmadas por el usuario el 2026-10-19 que aplican acá:
- **`conversationId` desconocido** (pregunta 2 de #8, opción A). El backend responde `404` y no persiste nada. La UI descarta el `conversationId`, muestra un mensaje corto en el lugar de la respuesta y deja que la próxima pregunta empiece una conversación nueva, sin reenviar sola. Para eso, la función de request de #4 expone el status HTTP en los errores.
- **Fallos del pipeline** (pregunta 3 de #8, opción C). Los intentos agotados llegan como un `200` con un bloque `text` fijo en inglés y `suggestions: []`, y se muestran como cualquier respuesta. Un fallo de OpenAI (`502`) o un error inesperado (`500`) se muestran como error.
- **Sugerencias** (pregunta 4 de #8, opción A): botones que mandan la sugerencia en el momento, como la pregunta siguiente en la misma conversación.
  - Las sugerencias ya son preguntas completas, y un solo clic es lo que las hace útiles.
  - Se descartaron copiarla al input para editarla (suma un paso) y mostrarla como texto sin acción.
- **0 filas** (pregunta 5 de #8, opción A): solo llega el bloque `text`, sin tabla.
- **Recargar empieza una conversación nueva** (pregunta 2 de #11, opción A): el hilo y el `conversationId` viven solo en memoria, sin botón *New conversation*.
- **Ubicación** (pregunta 1 de #5, opción A): el catálogo es una sección `<details>` *Available data* en la pantalla principal, y el chat va en esa misma pantalla.

Derivadas de una fuente, sin pregunta:
- **El `conversationId` se guarda solo en memoria.** Fuente: el contrato de `docs/ARCHITECTURE.md`, donde el backend lo genera y siempre lo devuelve. Además, la tabla *Backend API* no tiene un endpoint para leer conversaciones, así que, después de recargar, el hilo no se podría mostrar.
- **Una pregunta a la vez, con un indicador de espera.** Fuente: `docs/ARCHITECTURE.md` difiere el streaming ("Fine to wait for the full answer in a POC").
- **El markdown se renderiza sin HTML crudo.** Fuente: un hecho técnico. La narrativa sale de un LLM que recibe texto del usuario y datos, y renderizarla como HTML abre un XSS.
- **Las celdas se ubican por posición.** Fuente: #6 y #8 mandan las filas como listas para conservar las columnas con el mismo nombre.
- **Textos de la UI en inglés.** Fuente: `docs/ARCHITECTURE.md`, *Frontend*. La narrativa y las sugerencias vienen en el idioma de la pregunta (#8).

## Deferred decisions
Ya están diferidos en `docs/ARCHITECTURE.md`:
- Tablas con orden, paginado o exportación (UI kit) y descarga CSV.
- Botones de feedback.
