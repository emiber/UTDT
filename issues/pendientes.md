# Pendientes para analizar

Esto no es un issue. Es la lista de lo que quedó abierto al cerrar el epic #1 (2026-10-21), para decidir más adelante qué se hace. Cada ítem dice de dónde salió. Si alguno se va a trabajar, se convierte en issue con `/create-issue`.

## Pendientes técnicos

Ordenados por prioridad sugerida.

### 1. Los tests del frontend fallan a veces al arrancar
- **Qué pasa:** con la máquina cargada, los workers de Vitest del frontend no llegan a arrancar ("Failed to start forks worker"), y el gate falla sin que haya un error en el código. Pasó 3 veces el 2026-10-21; al repetir pasó siempre.
- **Antecedentes:**
  - #18 bajó los workers a 4 (`maxWorkers` en `vitest.config.ts`).
  - El `testTimeout` de 20 s del backend (`backend/vitest.config.ts`, #8) es un parche de la misma familia.
- **Ideas:**
  - medir qué tarda en el arranque en frío (el entorno jsdom, los imports);
  - probar el pool `threads` en lugar de `forks`;
  - correr los dos proyectos en serie;
  - subir el timeout de arranque de los workers.
- **Prioridad:** media. Es lo único que hace fallar el gate sin motivo.

### 2. El set golden no evalúa la clasificación ni las conversaciones
- **Qué pasa:** `backend/eval/golden.json` solo tiene preguntas de datos sueltas, sin historial. No mide si la clasificación de #10 acierta, ni los seguimientos ("No veo el gráfico", "¿y en 2024?"), ni el idioma en conversaciones mezcladas.
- **Antecedentes:** los problemas de #10 (pedidos de gráfico tomados como charla) y los de #22 y #23 (el idioma de la conversación pisando el del mensaje) se encontraron a mano. Un eval así los habría detectado solo.
- **Ideas:**
  - agregar al golden la etiqueta esperada de cada pregunta;
  - sumar preguntas que no son de datos ("Hola", "¿Cuál es la capital de Francia?");
  - sumar casos de varios turnos, con su historial.
  - Hoy el judge solo puntúa el SQL, la narrativa y el gráfico.
- **Origen:** diferido en #12 y #10.
- **Prioridad:** media.

### 3. Un gráfico descartado no se explica
- **Qué pasa:** si el LLM propone un gráfico que `buildChart` descarta (`backend/src/chart.ts`, warning "Chart dropped" en `pipeline.ts`), la respuesta sale sin gráfico. Si la persona lo pidió, el texto no dice por qué. Pasa poco: la spec casi siempre encaja.
- **Ideas:**
  - si la pregunta pedía un gráfico, sumar una frase fija al texto;
  - o repetir los insights con el motivo del descarte.
- **Origen:** #10.
- **Prioridad:** baja.

### 4. El backend sigue trabajando cuando la UI corta por timeout
- **Qué pasa:** a los 6 minutos `postChat` se rinde. El backend no se entera: termina el pipeline, gasta las llamadas a OpenAI y guarda el turno.
- **Idea:** cuando se cierra el request, cortar las llamadas al SDK de OpenAI con un `AbortSignal`.
- **Origen:** #17.
- **Prioridad:** baja. Es un caso raro: cada llamada ya se corta a los 30 s.

### 5. El tamaño total de una respuesta solo lo acota el tope de filas
- **Qué pasa:** cada valor tiene un tope de 1.000.000 de bytes (#15), pero 500 filas con varias columnas grandes todavía pueden sumar cientos de MB.
- **Idea:** llevar la cuenta de los bytes mientras `executeSql` lee las filas, y cortar con un error `row_limit` o uno nuevo.
- **Origen:** #15, que lo dejó fuera de alcance.
- **Prioridad:** baja. El dataset demo no se acerca.

### 6. El timeout de OpenAI es fijo
- **Qué pasa:** cada llamada se corta a los 30 s (`REQUEST_TIMEOUT_MS` en `backend/src/llm.ts`). Con un modelo más lento en `OPENAI_MODEL`, por ejemplo uno de razonamiento, cada llamada que pase de 30 s sería un 502.
- **Idea:** pasarlo a una variable de `.env`, o subirlo si se cambia de modelo.
- **Origen:** #17.
- **Prioridad:** baja. Solo importa si se cambia de modelo.

### 7. Correr `npm audit`
- **Qué pasa:** al instalar `vue-router` (#26) el audit de npm se cortó por timeout de red (`ETIMEDOUT`) y no se pudo verificar. El usuario aprobó mergear igual (2026-10-22).
- **Qué hacer:** correr `npm audit` cuando haya red y revisar si reporta algo.
- **Prioridad:** media. Es rápido, y es la única dependencia nueva sin auditar.

### 8. Menores
- `generateSql` vuelve a armar el contexto de esquema que el pipeline ya armó para la clasificación. Se podría recibir como parámetro. El costo es mínimo. Origen: #10.
- El corte de `fetch` por timeout del navegador se verificó en Chrome, Edge y Node, no en Firefox ni Safari. Origen: #17.

## Decisiones que tomé sin consultarte

Están implementadas y documentadas en cada issue. Conviene validarlas.

- **#10, clasificación:**
  - cuatro etiquetas: pregunta de datos, charla, demasiado vaga y fuera de tema;
  - si la confianza es menor que 0,5 en una etiqueta que no es de datos, se intenta responder con datos;
  - si la clasificación falla, el chat sigue como antes de #10;
  - un valor único (1 fila × 1 columna) va sin tabla.
- **#10, configuración:** `OPENAI_DECISIONS_MODEL` es obligatoria para el backend. Hoy la Decisions API solo acepta `gpt-6-luna`.
- **#15:** el mínimo pasa a Node 24.15, porque el tope por valor usa una opción de `node:sqlite` que llegó en esa versión.
- **#17:**
  - 30 s por llamada a OpenAI, con 1 reintento;
  - la UI espera 6 minutos, por encima del peor caso del backend: 5 llamadas × 2 intentos × 30 s.
- **#22 y #23:** el SQL, los insights y la respuesta de texto escriben primero un campo `language` y después el resto. El valor no se usa: solo sirve para que el modelo no arrastre el idioma de los turnos anteriores. Reforzar la regla del prompt no alcanzó.
- **Modelos en `.env`:** `OPENAI_MODEL=gpt-5.4-mini` y `OPENAI_DECISIONS_MODEL=gpt-6-luna`.

## Acciones tuyas
- Tu `APP_ACCESS_KEY` tiene 3 caracteres. Para la demo local alcanza. Si la demo sale de tu máquina, generá una nueva con el comando del `README.md`.

## Decisiones diferidas (ya documentadas)

Están en `docs/ARCHITECTURE.md`, en la sección *Deferred decisions*, con el motivo de cada una:
- importar CSV o Excel;
- Azure OpenAI;
- una lista blanca de tablas para el SQL del LLM;
- un judge en vivo, y que el judge explique sus puntajes;
- usuarios y autenticación real;
- un timeout de las consultas a SQLite (worker thread);
- prompts estándar, botones de feedback y descarga CSV;
- respuestas en streaming;
- un kit de UI, router, librería de estado e i18n;
- Docker y deploy.
