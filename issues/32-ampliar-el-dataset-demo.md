---
id: 32
title: Ampliar el dataset demo con costos, objetivos y devoluciones
type: epic
status: open
parent:
created: 2026-10-23
---

## Problema

El dataset demo (`backend/src/demo-dataset.ts`) tiene 3 tablas chicas: 20 clientes, 15 productos en 4 categorías y 280 pedidos de 2024–2025. El bot responde ventas, rankings y repartos, pero ninguna pregunta de negocio lo obliga a calcular o a comparar contra una meta. Sumar datos hace la demo más interesante.

## Hijos

- #33 Sumar el costo de los productos para preguntar por el margen
- #34 Sumar objetivos mensuales para comparar las ventas contra la meta
- #35 Sumar devoluciones para preguntar por la tasa de devolución

## Contexto conocido

- Cada dato nuevo necesita su descripción en los metadatos (`meta_tables`, `meta_columns`) para que el bot sepa usarlo.
- Conviene sumar casos al golden del eval (`backend/eval/golden.json`) para medirlo.

Origen: ideas para hacer más interesante la demo (2026-10-23).
