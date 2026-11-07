# Guion — Clase de agentes

**Duración:** 45 minutos · **Audiencia:** alumnos de sistemas · **31 slides + 1 de respaldo**
(deck: [presentacion.pptx](presentacion.pptx); las notas de cada slide también están en el deck).

El cliente no se nombra en ninguna slide: es "una empresa multinacional". No se muestra código, solo arquitectura.

| Bloque | Slides | Tiempo |
|---|---|---|
| Apertura | 1–2 | 2 min |
| Parte 1 — Problema, solución, impacto | 3–8 | 9 min |
| Parte 2 — Cómo funciona por dentro | 9–18 | 13 min |
| Parte 3 — Cómo se construye: a mano, vibe coding y spec driven | 19–29 | 16 min |
| Cierre y preguntas | 30–31 | 5 min |

Si el tiempo aprieta, las slides 15 (atajos y datos materializados) y 16 (calidad) se pueden pasar rápido.

---

## Apertura (2 min)

### Slide 1 — Portada
- **Agentes en la práctica: de la pregunta al dato en segundos**
- Un caso real, su arquitectura y cómo se construye con agentes.

### Slide 2 — Agenda
1. El problema, la solución y su impacto.
2. Cómo funciona por dentro.
3. Cómo se construye: a mano, vibe coding y spec driven.

> Nota: anticipar que hay una demo en vivo.

---

## Parte 1 — Problema, solución, impacto (9 min)

### Slide 3 — Separador: Parte 1

### Slide 4 — El problema
- El área de finanzas de una empresa multinacional necesita datos para decidir: cobranzas, pagos e inventario.
- Los datos están en el ERP. Para conseguirlos, el usuario de negocio le pide a Sistemas.
- Diagrama del ciclo: Negocio escribe un email → Sistemas lo lee → espera un hueco → arma la consulta → responde.

> Nota: glosario rápido, sin profundizar. **DSO**: días que tarda la empresa en cobrar. **DPO**: días que tarda en pagar. **DIO**: días que el inventario está en stock.

### Slide 5 — El costo del ciclo
- Escribir el email, que Sistemas lo lea, que tenga tiempo para hacerlo y que responda: **con suerte, medio día**.
- Cada repregunta ("¿y por región?", "¿y el trimestre anterior?") reinicia el ciclo.
- Sistemas se vuelve el cuello de botella de las preguntas repetitivas.

> Nota: preguntarle a la audiencia cuántas preguntas se hace un analista antes de llegar a una conclusión.

### Slide 6 — La solución
- Un asistente donde el usuario escribe la pregunta en lenguaje natural.
  - Ejemplo: *"¿Cuáles son los 5 clientes con mayor DSO este trimestre?"*
- La respuesta trae:
  - un texto que explica el resultado;
  - una tabla y un gráfico;
  - 3 preguntas sugeridas para seguir;
  - la descarga a CSV.
- Por detrás, un agente traduce la pregunta a SQL, la ejecuta y explica el resultado.

### Slide 7 — Demo en vivo (3 min)
Con la demo de UTDT: el mismo patrón, con datos ficticios de ventas.
1. *"¿Cuáles son las ventas por mes en 2025?"* → texto, tabla y gráfico.
2. *"¿Y en 2024?"* → un seguimiento que usa la conversación.
3. *"Los 5 clientes con más ventas y un listado separado de los 3 productos con más ventas"* → dos secciones. Se retoma en la parte 3.
4. *"¿Cuál es la capital de Francia?"* → está fuera de alcance, así que no corre ningún SQL.

> Nota: las cuatro son casos del golden del eval, así que ya están probadas. Igual conviene correrlas antes de la clase.

### Slide 8 — Impacto
- **Antes:** medio día por pregunta, con suerte. **Ahora:** segundos.
- La repregunta es inmediata: el usuario explora en lugar de esperar.
- Sistemas deja de responder consultas repetitivas y se enfoca en mantener los datos y su descripción.
- Cada usuario ve solo los datos que su rol le permite.

> Nota: no hay métricas formales. El argumento es el ciclo que se elimina.

---

## Parte 2 — Cómo funciona por dentro (13 min)

### Slide 9 — Separador: Parte 2

### Slide 10 — Arquitectura general
- **UI web** (SAPUI5 / Fiori):
  1. le pide un token al middleware;
  2. le manda la pregunta y el token al agente.
- **Middleware** (SAP CAP, Node.js): emite el token con los roles del usuario y programa la copia de datos.
- **Agente** (Python, FastAPI): genera el SQL, lo valida, lo ejecuta y arma la respuesta.
- **Base de datos** (SAP HANA Cloud) y **LLM** (SAP Gen AI Hub).
- Todo corre en SAP BTP (Cloud Foundry). Cambiar de modelo (OpenAI o Anthropic) es cambiar una variable de configuración.

### Slide 11 — El recorrido de una pregunta
1. La UI le pide un token al middleware. Es un JWT firmado, válido por 60 minutos, con los roles del usuario (DSO, DPO, DIO).
2. La UI manda la pregunta y el token al agente.
3. El agente arma el esquema de datos que ese usuario puede ver.
4. Si la pregunta es una de las frecuentes, usa un SQL ya validado. Si no, le pide el SQL al LLM.
5. Valida el SQL con guardas y lo ejecuta.
6. Hace una segunda llamada al LLM, que convierte las filas en texto, tabla, gráfico y sugerencias.
7. Registra todo (pregunta, SQL, respuesta y tiempos) y devuelve la respuesta.

### Slide 12 — Decisión 1: el LLM solo ve lo que describimos
- El esquema que recibe el LLM sale de tablas de metadatos. Cada tabla y cada columna tiene una descripción en lenguaje de negocio.
  - Ejemplo: aclarar que una columna es un acumulado móvil, para que el LLM no la sume entre períodos.
- La calidad de las respuestas depende tanto de cómo se describen los datos como del prompt.

### Slide 13 — Decisión 2: no confiar en el LLM (seguridad en capas)
- El rol del usuario viaja en un token firmado, así que el agente sabe qué dominios puede ver ese usuario.
- **Capa 1:** el LLM solo recibe las tablas que el rol permite.
- **Capa 2:** después de que el LLM genera el SQL, el código verifica que no use tablas fuera de esa lista. Si usa alguna, lo bloquea.
- **Solo lectura:** si la pregunta pide modificar datos, el agente responde que no puede.
- **Fail-closed:** si el usuario no tiene ningún rol de datos, el pedido se corta antes de llamar al LLM.

> Nota: preguntarle a la audiencia por qué no alcanza con pedirle al LLM, en el prompt, que no use esas tablas. La respuesta: el prompt es una sugerencia y el código es una garantía.

### Slide 14 — Decisión 3: guardas deterministas y autocorrección
- **Guardas de intención:** reglas simples (expresiones regulares) que comparan la pregunta con el SQL y no tienen costo de LLM. Detectan, por ejemplo:
  - una pregunta que dice "menor a 60" con un SQL que usa `>=`;
  - un pedido de "top 5" con un SQL que no limita a 5;
  - un mes o un año nombrado en la pregunta que el SQL no filtra.
- **Autocorrección:** si falla una guarda, si el SQL da error o si devuelve más de 1000 filas, el agente le devuelve al LLM el SQL y el problema, y el LLM lo regenera.
- Tiene hasta 3 intentos. Si no lo logra, responde que no pudo, en vez de inventar.

### Slide 15 — Decisión 4: atajos y datos materializados
- **Preguntas frecuentes:** tienen un SQL validado de antemano. Si la pregunta coincide, no se le pide el SQL al LLM, así que la respuesta es más rápida, más barata y siempre igual.
- **Datos materializados:** el ERP se lee a través de tablas virtuales. Un job programado copia esos datos a tablas locales, y el LLM consulta solo las copias. Así:
  - la performance es estable;
  - el agente nunca toca el ERP en vivo.
- Después de copiar los datos, el mismo job genera un pronóstico de DSO con un modelo de ML (XGBoost).

### Slide 16 — Cómo se mide la calidad
- **Preguntas golden:** un set de preguntas con respuesta conocida, que se corre contra el pipeline real.
- **LLM como juez:** otro LLM evalúa si el SQL responde la pregunta y si el texto es fiel a los datos.
- **En producción:** el usuario marca cada respuesta con 👍 o 👎, y cada interacción queda registrada.

### Slide 17 — Cómo se construyó el caso real
- **Equipo:** 4 personas.
- **Tiempo:** 1 mes hasta la primera versión. Después, se fue refinando y se sumaron funcionalidades.
- **Cómo:** una parte se escribió a mano y otra con vibe coding, es decir, pidiéndole código a una IA sin una spec formal.

> Nota: es el puente hacia la parte 3. ¿Qué cambia si el mismo tipo de sistema se construye con spec driven?

### Slide 18 — Mismo patrón, dos escalas
| | Caso real | Demo UTDT |
|---|---|---|
| Datos | SAP HANA Cloud | SQLite |
| LLM | SAP Gen AI Hub | OpenAI |
| Acceso | Roles + JWT por dominio | Una clave compartida |
| UI | SAPUI5 / Fiori | Vue |
| Backend | Python (FastAPI) + SAP CAP | Node.js (Fastify) |

- El patrón es el mismo en los dos: pregunta → SQL → guardas → ejecución → texto, tabla y gráfico.
- Con la escala cambian la seguridad, los datos y la operación.

---

## Parte 3 — Cómo se construye: a mano, vibe coding y spec driven (16 min)

### Slide 19 — Separador: Parte 3

### Slide 20 — Tres formas de construir (1/2): cómo arranca y quién hace qué
| | A mano | Vibe coding | Spec driven |
|---|---|---|---|
| Punto de partida | Un ticket corto. Los detalles se aclaran mientras se programa. | Un prompt. El agente completa lo que falta. | Una spec refinada: alcance, qué no entra, casos borde y criterios de aceptación. |
| Quién escribe el código | El desarrollador | El agente, a partir del prompt | El agente, contra la spec |
| Qué hace el desarrollador | Escribe y depura el código | Pide, prueba y corrige con más prompts | Especifica, decide y revisa |
| La ambigüedad | Aparece tarde, en el código o en QA | La resuelve el agente, suponiendo | Se resuelve antes, en el refinamiento: el agente pregunta |

> Nota: no es que hacerlo a mano esté mal. Las specs, los tests y la revisión ya existían como buenas prácticas. Spec driven las vuelve obligatorias, porque sin una spec el agente completa los huecos inventando, que es justamente lo que pasa con vibe coding.

### Slide 21 — Tres formas de construir (2/2): qué queda y hasta dónde escala
| | A mano | Vibe coding | Spec driven |
|---|---|---|---|
| Las decisiones | En la cabeza de alguien, en un chat o en un email | En el historial del chat, y se pierden | Escritas en el issue y versionadas con el código |
| Tests y docs | Dependen de la disciplina y del tiempo que quede | Hay solo si se piden | Son criterios de aceptación y parte del gate |
| La revisión | Un compañero, cuando puede | Ver si "anda" | Un agente con contexto limpio y después el humano, contra los criterios |
| El límite de velocidad | Cuánto código escribe una persona | Es rápido al principio y se frena cuando nadie entiende el código | Cuánto especifica y revisa una persona |

> Nota: el riesgo de spec driven es que una spec mal escrita hace que el agente implemente lo equivocado con total confianza. Por eso la spec se revisa antes de escribir código.

### Slide 22 — Spec driven en la práctica: el ciclo
- `/create-issue` → `/refine-issue` → `/work-issue` → `/review-pr`.
- En cada paso, el humano tiene un rol: describe, responde, aprueba el plan y decide.
- El issue es la spec: un archivo Markdown en el repo. Su estado pasa de `open` a `refined` y después a `closed`.
- Las reglas están escritas y el agente las lee siempre. Por ejemplo: nunca commitear en `main`, nunca subir secretos y hacer lo mínimo que resuelve el problema.
- Un modelo más capaz planifica (Opus) y uno más rápido implementa (Sonnet).

### Slide 23 — 1. Crear el issue
- **Entrada:** una descripción corta del problema.
- **Salida:** `issues/30-…md`, con título, tipo y estado `open`.
  - El título original fue *"Devolver listados separados cuando el mensaje pide más de uno"*.
- Es una captura liviana: todavía no se diseña nada.

### Slide 24 — 2. Refinar el issue (escribir la spec)
- El agente lee el código y pregunta todo lo que haga falta hasta que el issue se pueda implementar.
- El resultado tiene objetivo, alcance (qué entra y qué no), comportamiento esperado, casos borde, errores, criterios de aceptación y decisiones diferidas.
- Ejemplo del #30, que salió con un título nuevo: *"Responder con varias tablas y gráficos cuando el mensaje pide resultados separados"*.
  - **Entra:**
    - de 1 a 5 consultas, cada una con un título;
    - cada consulta pasa por las guardas;
    - si una falla, se regenera el set completo.
  - **No entra:** cambios en el frontend ni respuestas parciales.
  - **Caso borde:** "mostralo como gráfico de torta", después de una respuesta de dos secciones, repite las dos consultas.

> Nota: lo que no entra importa tanto como lo que entra, porque evita que el agente haga de más.

### Slide 25 — 3. Trabajar el issue
1. El agente crea una rama (`feat/30-listados-separados`). Nunca toca `main` directamente: un hook de git lo impide.
2. Presenta un plan y espera la aprobación del humano.
3. Implementa el código con sus tests.
4. Corre el quality gate: lint, tests y cobertura mínima del 85%.
5. **Self-review:** un agente nuevo, sin el contexto del que programó, revisa el diff contra el issue y contra un checklist de seguridad.
6. Escribe el PR dentro del issue: qué hace, qué encontró y una sección *Verification* con cada gate (pass o n/a, con el motivo).
7. Mergea a `main` solo si todo pasó.

### Slide 26 — 4. Revisar el PR
- `/review-pr <n>` revisa la rama contra los criterios de aceptación del issue y contra la Definition of Done.
- Es de solo lectura: no commitea ni mergea.
- **¿Por qué un agente nuevo?** El que escribió el código tiende a confirmar su propia solución. Uno con el contexto limpio no está anclado.
- El que decide sigue siendo el humano.

### Slide 27 — Caso real: cuando el plan no alcanza (#38)
- **El problema:** el evaluador que mide si la respuesta está en el idioma correcto marcaba como mal respuestas que estaban bien.
- **La spec:** pedía un umbral medible: todas las respuestas correctas tenían que dar 0,5 o más.
- **Qué pasó:** la solución planificada no alcanzó el umbral. El agente probó 5 variantes y lo reportó con los datos.
- **La decisión:** el humano eligió cambiar el enfoque, y el cambio quedó escrito en el issue con el porqué.
- **Línea de tiempo:** abierto a las 23:26, refinado a las 23:58 y mergeado a la 01:37.
- **Lección:** con criterios medibles se ve cuándo algo no funciona, en vez de darlo por terminado.

### Slide 28 — Los números de la demo
- **38** issues cerrados.
- **311** commits y **45** merges.
- **660** tests, con una cobertura del **99%** de los statements.
- **Entre 2 y 3 horas** por issue, de abierto a mergeado. Por ejemplo:
  - el #30: 2 h 30 min;
  - el #38: 2 h 11 min.

### Slide 29 — Los tiempos
| | Caso real | Demo, a mano | Demo, spec driven |
|---|---|---|---|
| Tiempo | **1 mes** hasta la primera versión | **2 semanas o más** (estimado) | **6 días** (del 19 al 24 de octubre de 2026) |
| Equipo | 4 personas | 1 persona | 1 persona |
| Cómo | A mano + vibe coding | A mano | Spec driven con agentes |
| Resultado | Primera versión, después refinada | Sin la profundidad ni los tests de la versión actual | 38 issues, 660 tests y 99% de cobertura |

- El caso real y la demo no se comparan 1 a 1: el caso real suma SAP, seguridad por roles y deploy en la nube.

> Nota: las 2 semanas son una estimación propia, no una medición. Decirlo así.

---

## Cierre (5 min)

### Slide 30 — Lo que nos llevamos
1. El valor no está solo en el LLM, sino en los datos bien descritos, las guardas y la seguridad que lo rodean.
2. No hay que confiar en el modelo: lo que importa se verifica en código.
3. Con spec driven, el trabajo humano pasa de escribir código a especificar, decidir y revisar.

### Slide 31 — Preguntas

---

## Respaldo

### Slide 32 — Lo que todavía falta en el caso real
- No tiene CI/CD: cada deploy es manual.
- El deploy requiere pasos manuales que no están en los descriptores.
- La UI llama directo al agente, sin pasar por el middleware. Por eso no hay un punto central para registrar o limitar el tráfico.

> Nota: sirve si preguntan por los trade-offs de llevarlo a producción.
