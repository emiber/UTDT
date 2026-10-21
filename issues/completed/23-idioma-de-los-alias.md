---
id: 23
title: Escribir los alias del SQL en el idioma de la pregunta aunque la conversación venga en otro
type: fix
status: closed
parent: 1
created: 2026-10-21
---

## Goal
Que los encabezados de la tabla y las leyendas del gráfico estén en el idioma de la pregunta, aunque la conversación venga en otro.

En la prueba de punta a punta después de #22, "Top 5 products by units sold" llegó tras varias preguntas en español. Respondió con los alias "Producto" y "Unidades vendidas", y con la narrativa en español: los insights siguieron a las columnas.

Con el historial real de esa conversación pasó 6 de 6 veces. #22 había dejado afuera el prompt de SQL, suponiendo que sus alias ya seguían el idioma de la pregunta (#21). Con este historial no lo hacen.

## Scope
- In:
  - El esquema de Structured Outputs de la generación de SQL (`generate-sql.ts`) empieza con un campo `language`: el idioma de la pregunta, no el de los turnos anteriores, en el que se escriben los alias. El valor no se usa. Es el mismo arreglo de #22.
  - Tests del esquema y una línea en `docs/ARCHITECTURE.md` (pasos 3 y 5).
- NOT in:
  - Cambiar las reglas de los alias de #21.

## Expected behavior
- En una conversación en español, "Top 5 products by units sold" devuelve las columnas "Product" y "Units sold", y la narrativa en inglés.
- Una conversación en un solo idioma sigue como hoy.

## Acceptance criteria
- [x] El esquema del SQL empieza con `language`, y `required` lista todas las propiedades (test). La función sigue devolviendo solo el SQL.
- [x] Verificación manual con la API real, con el historial de la conversación que falló: los alias salen en inglés, y la prueba de punta a punta en el navegador responde en inglés a la pregunta en inglés.
- [x] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- El campo `language` alcanza, como en #22. El experimento previo lo confirma: sin el campo, 6 de 6 en español; con el campo, 6 de 6 en inglés.

## Pull request
Branch: `fix/23-idioma-de-los-alias` → `epic/1-poc-chatbot-text-to-sql`

### What it does
- **Esquema del SQL** (`backend/src/generate-sql.ts`): la salida pasa a ser `{ language, sql }`, con `language` primero: el idioma de la pregunta, en el que se escriben los alias. El valor no se usa, y solo el SQL sigue al ejecutor.
  - Es el mismo arreglo de #22, que había dejado afuera el SQL.
  - Los insights siguen a las columnas, así que esto también arregla la narrativa de una pregunta de datos.
- **Tests:**
  - el orden de las propiedades y el `required` completo;
  - el helper de los tests devuelve `language`, como la salida real, así que cada test con `toEqual` confirma que el resultado no lo incluye.
- **Docs:** `docs/ARCHITECTURE.md`. El paso 3 dice cuál es la forma de la salida, y el párrafo *Language* del paso 5 nombra el SQL.

### Verification
- Lint: `npm run lint` — pass
- Tests: `npm run test:coverage` — pass (28 archivos, 420 tests). Una corrida de la review tuvo el flake de arranque de los workers; al repetirla pasó.
- Coverage: 100% en sentencias, funciones y líneas, y 98,91% en ramas (umbral 85%). Archivos nuevos o cambiados bajo el umbral: ninguno.
- Manual: pass, con la API real.
  - **Con el historial real de la conversación que falló,** "Top 5 products by units sold" salió con alias en español 6 de 6 veces sin el campo. Con el campo salió en inglés 6 de 6.
  - **Por el pipeline completo,** 4 de 4 dieron "Product, Units sold", con la narrativa y el título del gráfico en inglés.
  - **Después de eso, "¿Y por categoría?"** volvió al español ("Categoría, Unidades vendidas").
  - **Prueba de punta a punta en Edge headless,** con `npm run dev`: "Hola!", "Ventas por mes en 2025", "No veo el gráfico", "¿Cuántos clientes hay?", "What is the capital of France?" y "Top 5 products by units sold".
    - Cada respuesta salió en el idioma de su mensaje.
    - Las columnas en español fueron "Mes, Ventas totales", y en inglés "Product, Units sold".
    - Hubo tabla y gráfico donde correspondía. "¿Cuántos clientes hay?" dio solo texto.
  - **`npm run eval`:**
    - La 1.ª corrida dio SQL 1.76/2: "What is the average order amount per customer segment?" salió una vez como promedio por cliente. La misma pregunta, generada 6 veces con el esquema nuevo y 6 con el viejo, salió bien las 12, así que fue variación.
    - La 2.ª corrida dio SQL 2.00/2, narrativa 2.00/2 y gráfico 0.98.
- Self-review: 1 ronda en un subagente nuevo, sin blockers. Sus sugerencias se aplicaron y verificaron inline, porque son docs y tests:
  - la frase vieja del paso 3, que decía `{ sql }`;
  - que los tests confirmen que el resultado no incluye `language`;
  - dejar constancia en Verification del eval y de una conversación en un solo idioma.
- Plan: abierto y refinado en la prueba previa a cerrar el epic.
- Security: no security surface touched. El SQL sigue pasando por las guardas de #6.
- Docs: updated `docs/ARCHITECTURE.md`

### Out of scope / follow-ups
None
