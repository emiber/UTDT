---
id: 25
title: Agregar una pantalla de reporte de uso del LLM con filtros y granularidad
type: feat
status: closed
parent:
created: 2026-10-21
---

## Goal
Ver cuánto se usa el LLM, cuánto tarda y cuánto cuesta, sin consultar `app.db` a mano. Los datos ya están en `llm_calls` (#24). Pedido del usuario: una pantalla en el mismo front, con filtros y granularidad, y un costo estimado.

## Scope
- In:
  - **Backend: `GET /api/usage`**, protegido con la access key. Calcula todo con consultas fijas sobre `llm_calls` y `turns`; el LLM no participa.
    - **Parámetros:**
      - `from` y `to`: fechas inclusivas, `YYYY-MM-DD`;
      - `granularity`: `hour`, `day`, `week` (de lunes a domingo) o `month`;
      - `tz`: el desplazamiento del navegador respecto de UTC, en minutos, para que los días y las horas sean locales;
      - `model` y `step` (`classify`, `sql`, `answer`): filtros opcionales.
    - Un rango que da más de 1.000 intervalos (por ejemplo, un año por hora) responde `400`.
    - **Respuesta:**
      - **totales:** llamadas, turnos, tokens de entrada y salida, costo estimado, tiempo promedio y máximo por llamada, llamadas fallidas (sin tokens) y reintentos de SQL (intento mayor que 1);
      - **serie:** por cada hora, día, semana o mes del rango, con los intervalos vacíos en cero. Lleva llamadas, turnos, tokens, costo y tokens por paso;
      - **desglose por paso y modelo:** llamadas, tokens, costo, tiempo promedio y máximo, y llamadas fallidas;
      - **los 10 turnos con más tokens:** fecha, pregunta, llamadas, tokens, costo y tiempo;
      - **los modelos** que aparecen en `llm_calls`, para el filtro, y los que no tienen precio.
  - **Costo estimado:**
    - **Variable:** `OPENAI_PRICES`, opcional, en el `.env`. Lleva los precios en USD por millón de tokens, con el formato `modelo=entrada/salida` separado por comas. Por ejemplo: `OPENAI_PRICES=modelo-a=0.25/2,modelo-b=1.25/10`. Los valores los carga el usuario.
    - **Cálculo:** el costo de una llamada sale de sus tokens por el precio de su modelo. Una llamada sin tokens no suma costo.
    - **Modelos sin precio:** sus llamadas no suman costo y el reporte los nombra. Si ninguna llamada de un grupo tiene precio, su costo queda vacío.
    - **Validación:** si `OPENAI_PRICES` está mal escrita, el backend no arranca, y el error nombra la variable.
  - **Frontend: pantalla "Usage".**
    - **Navegación:** se entra con un botón en el encabezado y se vuelve al chat sin perder la conversación. No hace falta router.
    - **Filtros:** desde, hasta, granularidad, modelo y paso. Por defecto: los últimos 7 días, por día y todos los modelos y pasos.
    - **Contenido:**
      - tarjetas con los totales;
      - un gráfico de tokens por intervalo, separado por paso;
      - las tablas de la serie, del desglose y de los turnos con más tokens;
      - un aviso cuando hay modelos sin precio.
    - Reusa los componentes de tabla y gráfico del chat. Los textos van en inglés, como el resto de la UI.
  - Tests de los dos lados y docs: `docs/ARCHITECTURE.md` (*Backend API*, *Frontend*, *Configuration*), `README.md` y `.env.example`.
- NOT in:
  - Las llamadas de `npm run eval`, que no se guardan en `app.db`.
  - Exportar el reporte (CSV u otro).
  - Abrir las tablas de uso al chatbot. Lo descartamos por privacidad y exactitud.

## Expected behavior
- Con los filtros por defecto, la pantalla muestra los últimos 7 días por día, con 7 intervalos aunque alguno esté vacío.
- Filtrar por `model=gpt-6-luna` y `step=classify` deja solo esas llamadas en todos los números.
- Sin `OPENAI_PRICES`, los costos quedan vacíos y el aviso nombra los modelos. Con precios, el costo de cada grupo es la suma de sus llamadas.
- Un turno de las 23:30 hora local cae en su día local, no en el siguiente de UTC.

## Acceptance criteria
- [x] `GET /api/usage` exige la access key y valida sus parámetros: un valor inválido o un rango con más de 1.000 intervalos dan `400` (tests).
- [x] Los totales, la serie (con intervalos vacíos), el desglose y los turnos con más tokens salen bien para cada granularidad, con filtros y huso horario (tests sobre datos conocidos).
- [x] El costo usa `OPENAI_PRICES`: suma por modelo, deja vacío lo que no tiene precio y nombra los modelos sin precio. Una variable mal escrita impide arrancar (tests).
- [x] La pantalla "Usage" pide el reporte con los filtros, muestra totales, gráfico y tablas, y se puede volver al chat sin perder la conversación (tests).
- [x] Verificación manual con el `app.db` real, en el navegador.
- [x] Docs y `.env.example` actualizados.
- [x] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- **Un solo issue** para el backend y el frontend. Lo eligió el usuario.
- **Las preguntas** se muestran en la tabla de turnos. Cualquiera con la access key las ve; en un POC local con una sola key, el usuario lo aceptó.
- **Los turnos con más tokens** se ordenan por tokens y no por costo, para que el orden no dependa de los precios.
- **Huso horario:** el reporte usa el desplazamiento del navegador para todo el rango y no contempla cambios de horario de verano dentro del rango. En Argentina no hay.

## Pull request
Branch: `feat/25-reporte-de-uso-del-llm` → `main`

### What it does
- **`GET /api/usage`** (`backend/src/usage.ts`, `usage-route.ts`): el reporte de uso del LLM, con consultas fijas sobre `llm_calls` y `turns`.
  - Trae los totales, la serie por hora, día, semana (desde el lunes) o mes en hora local, el desglose por paso y modelo, y los 10 turnos con más tokens con su pregunta.
  - Acepta filtros por modelo y paso. Parámetros inválidos o más de 1.000 intervalos dan `400`.
- **Costo estimado** (`backend/src/prices.ts`): sale de `OPENAI_PRICES`, opcional, con el formato `modelo=entrada/salida` en USD por millón de tokens.
  - Los modelos sin precio no suman y el reporte los nombra.
  - Si la variable está mal escrita, el backend no arranca.
  - Las sumas se redondean a 1e-8 USD.
- **Pantalla "Usage"** (`frontend/src/components/UsageView.vue`):
  - filtros (desde, hasta, granularidad, modelo, paso), por defecto los últimos 7 días por día;
  - tarjetas con los totales, un gráfico de tokens por intervalo y paso, y las tres tablas, dibujadas con `ResponseBlocks`;
  - un aviso de modelos sin precio;
  - si llega tarde la respuesta de un pedido viejo, se descarta.
- **Navegación:** un botón en el encabezado (`App.vue`) alterna con el chat, que queda montado (`v-show`) para no perder la conversación. `getUsage` manda el desplazamiento del navegador.
- **Docs:** `docs/ARCHITECTURE.md` (*Backend API*, *Frontend*, *Usage report*, *Configuration*), `README.md` y `.env.example` (`OPENAI_PRICES` vacío, sin precios inventados).

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (32 archivos, 499 tests). Algunas corridas sueltas tuvieron el flake de arranque de los workers del frontend; al repetirlas pasaron.
- Coverage: 100% de líneas, 99,79% de sentencias y 97,74% de ramas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno.
- Manual: pass.
  - **API y pantalla:**
    - `GET /api/usage` contra el backend del usuario, que corre con `--watch`, devolvió sus 6 turnos con llamadas registradas (90 a 95): 18 llamadas y máximo 12108 ms, que coincide con `llm_calls`.
    - En Edge headless contra la app real: tarjetas, aviso de modelos sin precio, gráfico y tablas (7 días, 5 filas de desglose, 6 turnos).
    - Por hora, las preguntas cayeron en las 18:00 locales (21:00 UTC).
    - El filtro `gpt-6-luna` + `answer` dejó 2 llamadas con 9,1 s de promedio.
    - Al volver al chat se conservó lo escrito.
  - **Costo:** con precios **de prueba** sobre una copia de `app.db`, el total (0.022888) coincidió con el cálculo directo en SQL, y `gpt-6-luna` quedó como modelo sin precio.
  - **Configuración:** con `OPENAI_PRICES` mal escrita, el backend no arrancó y el error nombró la variable.
- Self-review: 1 ronda en un subagente nuevo, sin blockers. La review contrastó los intervalos del SQL contra una implementación independiente en 1.500 corridas aleatorias, sin diferencias.
  - **Sugerencias aplicadas** (verificadas inline, porque son cambios chicos con sus tests):
    - un mensaje genérico para el 400;
    - sacar `aria-pressed` del botón, cuyo texto cambia;
    - tests de un turno del domingo a la noche y del cambio de año con un huso positivo;
    - meses como números;
    - un costo diminuto que se muestra como `<$0.0001`.
  - **Diferida:** al alternar con `v-show`, el hilo del chat vuelve arriba. Pasa a #26 (rutas separadas, pedido del usuario), que cambia ese mecanismo.
- Plan: aprobado por el usuario el 2026-10-21. Lo de un solo issue, el costo con precios en `.env` y mostrar las preguntas lo decidió el usuario.
- Security: hay una entrada nueva, `GET /api/usage`, protegida con la access key. Los parámetros se validan y van como parámetros nombrados de SQL. Las preguntas son visibles para quien tenga la key; el usuario lo aceptó.
- Docs: updated `docs/ARCHITECTURE.md`, `README.md`, `.env.example`

### Out of scope / follow-ups
- La posición del scroll del chat al cambiar de pantalla: se resuelve en #26, junto con las rutas.
- Si `app.db` crece mucho, pasar el top 10 de turnos a SQL (`ORDER BY ... LIMIT 10`). Hoy se arma en JS sobre las filas del período.
- La tarjeta "Turns" cuenta los turnos con llamadas registradas. Los anteriores a #24 no tienen.
- `docs/ARCHITECTURE_DIAGRAM.md` ya estaba desactualizado: no tiene `llm_calls`, ni la clasificación como hecha, ni el reporte.
