---
id: 33
title: Sumar el costo de los productos para preguntar por el margen
type: feat
status: open
parent: 32
created: 2026-10-23
---

## Problema

`products` tiene `unit_price` pero no costo, así que el bot no puede responder por márgenes. Con un costo por producto podría responder preguntas como:

- "¿Qué categoría deja más margen?"
- "¿Qué productos se venden mucho pero dejan poco?"
- "Margen por país en 2025"

## Contexto conocido

- El margen saldría de `orders.amount - quantity × costo`. Hoy `orders.amount` es `quantity × unit_price` (por ejemplo, 4 × 24,99 = 99,96).
- Parte del epic #32.
