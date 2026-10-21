---
id: 23
title: Escribir los alias del SQL en el idioma de la pregunta aunque la conversación venga en otro
type: fix
status: refined
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
- [ ] El esquema del SQL empieza con `language`, y `required` lista todas las propiedades (test). La función sigue devolviendo solo el SQL.
- [ ] Verificación manual con la API real, con el historial de la conversación que falló: los alias salen en inglés, y la prueba de punta a punta en el navegador responde en inglés a la pregunta en inglés.
- [ ] `npm run lint` y `npm run test:coverage` pasan con el umbral de 85%.

## Assumptions
- El campo `language` alcanza, como en #22. El experimento previo lo confirma: sin el campo, 6 de 6 en español; con el campo, 6 de 6 en inglés.
