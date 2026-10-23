---
id: 32
title: Ampliar el dataset demo con costos, objetivos y devoluciones
type: epic
status: refined
parent:
created: 2026-10-23
---

## Goal
Que la demo responda preguntas de negocio que obliguen al bot a calcular y a comparar, no solo a sumar y ordenar: margen, cumplimiento de objetivos y devoluciones. Es para quien muestra el POC. Hoy el dataset demo (`backend/src/demo-dataset.ts`) tiene 3 tablas chicas: 20 clientes, 15 productos en 4 categorías y 280 pedidos de 2024–2025. Con eso el bot responde ventas, rankings y repartos, nada más.

## Scope
- In: tres hijos, cada uno con su PR chico hacia la rama `epic/32-ampliar-el-dataset-demo`:
  1. #33 — el costo de los productos, para preguntar por el margen.
  2. #34 — objetivos mensuales de ventas por categoría, para comparar contra la meta.
  3. #35 — devoluciones con motivo, para preguntar por la tasa de devolución.
- Reglas comunes a los tres hijos:
  - **Datos fijos:** los datos nuevos salen de una fórmula fija, sin azar, como `generateOrders`, así cada seed carga las mismas filas.
  - **Metadatos:** cada tabla y columna nueva va con su descripción en los metadatos (`meta_tables`, `meta_columns`, y `meta_relationships` para cada foreign key nueva), para que el bot sepa usarla.
  - **Lo que ya existe no cambia:** las columnas y filas de `customers`, `products` y `orders` siguen igual, así que las respuestas de hoy y los historiales del golden siguen valiendo.
  - **Tests:** `demo-dataset.test.ts` ajusta los que fijan la estructura (la lista de tablas y las columnas) y suma los invariantes de los datos nuevos.
  - **Golden:** 2 casos nuevos por hijo, uno en español y uno en inglés. El golden pasa de 17 a 23 casos.
  - **Docs:** la descripción del dataset demo en `README.md` y en `docs/ARCHITECTURE.md` (*Initial data*).
- NOT in:
  - Cambiar el pipeline, sus prompts o el eval: solo cambian el dataset, sus metadatos, sus tests, el golden y las docs.
  - El canal de venta y la fecha de alta de los clientes, las otras dos ideas (ver *Deferred decisions*).
  - Más volumen de datos (más clientes, productos o pedidos).

## Expected behavior
- Al terminar el epic, `npm run seed` crea las tablas `products` (con el costo), `sales_targets` y `returns`. El bot responde las preguntas de los tres hijos, y el catálogo de la UI muestra las tablas nuevas sin cambios en el frontend, porque se arma desde los metadatos.

## Dependencies
- Orden de los hijos: #33, #34 y #35, uno después del otro, porque los tres tocan `demo-dataset.ts` y su test.
- Externo: las corridas reales del eval usan OpenAI, como hoy.

## Acceptance criteria
- [ ] #33, #34 y #35 cerrados en la rama `epic/32-ampliar-el-dataset-demo`.
- [ ] `/finish-epic 32` corre el quality gate y una corrida real de `npm run eval` con los 23 casos sobre la rama del epic, y la deja en su Verification.

## Non-functional notes
- **Costo del eval:** cada caso de datos nuevo son unas 5 llamadas (clasificación, SQL, insights y dos del judge). Los 6 casos suman unas 30 llamadas por corrida, de unas 75 a unas 105. Sigue fuera del quality gate.
- **Re-seed:** cada hijo cambia `data/data.db`. Hay que parar el backend antes de `npm run seed`, porque en Windows el seed falla si el backend tiene el archivo abierto.

## Assumptions
Confirmadas en el refinamiento (2026-10-23):
- Se hace como un epic con 3 hijos: costo, objetivos y devoluciones.
- Cada hijo suma 2 casos al golden, uno en español y uno en inglés.

Propuestas al escribir el issue, sin una pregunta aparte:
- Los datos nuevos salen de una fórmula fija, como los pedidos de hoy.
- Lo que ya existe no cambia, así las respuestas de hoy y el golden siguen valiendo.
- El orden de los hijos es #33, #34 y #35.

## Deferred decisions
- **El canal de venta** (`orders.channel`) y **la fecha de alta de los clientes** (`customers.signup_date`). Eran las otras dos ideas; se suman si la demo pide más dimensiones o preguntas de clientes nuevos contra recurrentes.
- **Más volumen de datos.** Hoy alcanza para que las respuestas tengan sentido.

## Notes
- 2026-10-23: se suma #36, follow-up de #34: los puntajes del judge cambiaron al sumar `sales_targets` al esquema, aunque las respuestas eran las mismas. Va antes de #35, que suma otra tabla. El orden de los hijos queda #33, #34, #36 y #35.
