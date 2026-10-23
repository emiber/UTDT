---
id: 35
title: Sumar devoluciones para preguntar por la tasa de devolución
type: feat
status: open
parent: 32
created: 2026-10-23
---

## Problema

Sin devoluciones, el bot no puede responder preguntas como "Tasa de devolución por producto" o "¿Qué categoría se devuelve más?".

## Contexto conocido

- Los datos tienen que ser coherentes con los pedidos: una devolución no puede superar la cantidad pedida ni ser anterior al pedido.
- Falta definir si las preguntas de ventas que ya existen pasan a restar las devoluciones (ventas brutas o netas). Eso puede cambiar las respuestas del golden.
- Parte del epic #32.
