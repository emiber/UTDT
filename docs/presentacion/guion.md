# Guion — Clase de agentes

**Duración:** 45 minutos · **Audiencia:** alumnos de sistemas · **21 slides + 4 de respaldo**
(deck: [presentacion.pptx](presentacion.pptx); las notas de cada slide también están en el deck).

El cliente no se nombra en ninguna slide: es "una empresa multinacional". No se muestra código, solo arquitectura.

| Bloque | Slides | Tiempo |
|---|---|---|
| Apertura | 1–2 | 2 min |
| Parte 1 — Problema, solución e impacto | 3–6 | 8 min |
| Parte 2 — Cómo funciona por dentro | 7–12 | 12 min |
| Parte 3 — Cómo se construye: a mano, vibe coding y spec driven | 13–19 | 18 min |
| Cierre y preguntas | 20–21 | 5 min |
| Respaldo | 22–25 | si preguntan |

---

## Apertura (2 min)

### Slide 1 — Portada
- **Agentes en la práctica: de la pregunta al dato en segundos**
- Un caso real, su arquitectura y cómo se construye con agentes.
- Maqueta de una respuesta: *"¿Cuáles son los 5 clientes con mayor DSO este trimestre?"*

> Nota: "en segundos" se refiere a la demo, que responde con 3,5 s de mediana.

### Slide 2 — Agenda
1. **Problema, solución e impacto** (8 min): por qué hacía falta y qué cambió.
2. **Cómo funciona por dentro** (12 min): la arquitectura y las decisiones de diseño.
3. **Cómo se construye** (18 min): a mano, vibe coding y spec driven.

> Nota: anticipar que hay una demo en vivo en la parte 1.

---

## Parte 1 — Problema, solución e impacto (8 min)

### Slide 3 — El problema: cada dato es un pedido
- El área de finanzas de una empresa multinacional necesita datos para decidir: cobranzas, pagos e inventario.
- Los datos están en el ERP. Para conseguirlos, el usuario de negocio le pide a Sistemas.
- El ciclo: Negocio escribe un email → Sistemas lo lee → espera un hueco en la agenda → arma la consulta y responde.
- **½ día** por pregunta, con suerte (estimación: escribir el email, que Sistemas lo lea, tenga tiempo y responda).
- Cada repregunta ("¿y por región?", "¿y el trimestre anterior?") reinicia el ciclo.
- Sistemas se vuelve el cuello de botella de las preguntas repetitivas.

> Nota: glosario rápido, sin profundizar. **DSO**: días que tarda la empresa en cobrar. **DPO**: días que tarda en pagar. **DIO**: días que el inventario está en stock.
>
> Preguntarle a la audiencia cuántas preguntas se hace un analista antes de llegar a una conclusión. El medio día es una estimación.

### Slide 4 — La solución: preguntarle a un agente
- El usuario escribe la pregunta como se la haría a una persona.
- La respuesta trae un texto que explica el resultado, una tabla, un gráfico, 3 preguntas sugeridas y la exportación a Excel.
- Por detrás, un agente traduce la pregunta a SQL, la ejecuta y explica el resultado.

> Nota: esta slide describe el caso real. La demo tiene las preguntas sugeridas, pero no la exportación. En el caso real, cuando la respuesta no trae tabla, ofrece un link para bajar los datos en CSV.

### Slide 5 — Demo en vivo (3 min)
Con la demo de UTDT:
1. *"¿Cuáles son las ventas por mes en 2025?"* → texto, tabla y gráfico.
2. *"¿Y en 2024?"* → un seguimiento que usa la conversación.
3. *"Los 5 clientes con más ventas y un listado separado de los 3 productos con más ventas"* → dos secciones. Se retoma en la parte 3.
4. *"¿Cuál es la capital de Francia?"* → fuera de alcance: no corre ningún SQL.

> Nota: las cuatro consultas son casos del golden del eval, así que ya están probadas. Igual conviene correrlas antes de la clase.
>
> No arrancar la demo con "Hola": en la última corrida del eval, el bot contestó el saludo en inglés. No pedirle al bot que liste bases de datos: puede mostrar la ruta absoluta del archivo de datos.
>
> Plan B: si falla la red o el LLM, ir a la slide de respaldo con las capturas (slide 23).

### Slide 6 — Impacto
- **Antes:** ½ día por pregunta, con suerte (estimación). **Ahora, en la demo:** 3,5 s de mediana por pregunta.
- **El usuario explora:** pregunta, repregunta y profundiza en lugar de esperar.
- **Sistemas se enfoca:** mantiene los datos y su descripción en vez de responder consultas repetitivas.
- **Acceso por dominio:** cada usuario ve los dominios de datos (DSO o DPO) que su rol permite.

> Nota: los 3,5 s son la mediana de la demo, medida en su base de conversaciones, que incluye las de desarrollo y pruebas. Del caso real no hay una medición formal de tiempos. El argumento central es el ciclo que se elimina.
>
> Acceso por dominio: hoy DSO y DPO dan las mismas tablas y el único rol incluye los dos, así que en la práctica todos ven lo mismo. El mecanismo está listo para separarlos.

---

## Parte 2 — Cómo funciona por dentro (12 min)

### Slide 7 — Arquitectura general
- Todo corre en SAP BTP (Cloud Foundry).
- **UI web** (SAPUI5 / Fiori): 1. le pide un token al middleware; 2. le manda la pregunta y el token al agente.
- **Middleware** (SAP CAP): emite el token con los roles y dispara la copia de datos.
- **Agente** (Python, FastAPI): genera, valida y ejecuta el SQL, y arma la respuesta.
- **SAP HANA Cloud:** copias de los datos del ERP. **SAP Gen AI Hub:** el LLM, OpenAI o Anthropic.
- Claves: el agente es el único que habla con el LLM; cambiar de modelo es cambiar una variable de configuración; el token lleva los roles del usuario (DSO o DPO).

> Nota: la copia la programa SAP Job Scheduler; el middleware expone la acción que la hace.
>
> Cambiar de modelo es cambiar la variable `LLM_MODELS` y reiniciar la app. El primer cambio, de OpenAI a Anthropic, sí necesitó código. Roles: hoy existe un solo rol, que incluye DSO y DPO.

### Slide 8 — El recorrido de una pregunta
1. **UI → Middleware:** pide un token con los roles.
2. **UI → Agente:** manda pregunta + token.
3. **Agente:** arma el esquema permitido.
4. **Agente → LLM:** pide el SQL al LLM.
5. **Agente → Base:** valida y ejecuta.
6. **Agente → LLM:** arma la respuesta.
7. **Agente → UI:** registra y devuelve.

**2 de 7** pasos llaman al LLM, como mucho. El resto es código: permisos, guardas, ejecución y registro.

> Nota: como mucho 2 de los 7 pasos llaman al LLM, el 4 y el 6, sin contar los reintentos de la slide de guardas. Si la pregunta está fuera de alcance, lo detecta la misma llamada del paso 4, y es una sola.
>
> Detalle que no está en la slide: el paso 1 devuelve un JWT firmado, válido 60 minutos, con los roles del usuario; el paso 6 convierte las filas en texto, tabla, gráfico y sugerencias; el paso 7 registra la pregunta, el SQL final, la respuesta y el tiempo total.

### Slide 9 — Decisión 1: el LLM ve solo lo descrito
- El esquema que recibe el LLM sale de tablas de metadatos.
- Las tablas y las columnas tienen descripciones en lenguaje de negocio.
- La calidad de las respuestas depende tanto de cómo se describen los datos como del prompt.
- Ejemplo real: la columna `SalesForecast`, "Total móvil de 3 meses (el actual y los dos anteriores). No sumar entre meses."
- **Por qué importa:** si una columna es un acumulado móvil y no se aclara, el LLM la suma entre períodos y la respuesta sale mal con total confianza.
- **Prompt del LLM:** solo las tablas y columnas descritas y permitidas para el rol del usuario.

> Nota: es una columna real del caso. Su descripción, en inglés, dice: "calculated as a rolling three-month total (current month and two preceding months). AggregationRule: Do not aggregate across months unless explicitly requested by the user". El prompt lo refuerza con una regla general: "NEVER SUM ROLLING TOTALS ACROSS MULTIPLE TIME PERIODS".

### Slide 10 — Decisión 2: no confiar en el LLM
- **Token firmado:** el rol del usuario viaja en el token, así que el agente sabe qué dominios puede ver.
- **Capa 1:** el LLM solo recibe las tablas que el rol permite.
- **Capa 2:** el código revisa el SQL generado; si usa una tabla fuera de la lista, lo rechaza y pide otro.
- **Solo lectura:** solo lo pide el prompt; no hay otra barrera en el código. Es el punto débil.
- **Fail-closed:** sin ningún rol de datos, el pedido se corta antes de llamar al LLM.
- **Límite:** el usuario de base tiene lectura y escritura, porque la API escribe los logs en esa base.
- ¿Por qué no alcanza con pedírselo al LLM en el prompt? El prompt es una sugerencia. El código es una barrera. La garantía son los permisos de la base.

> Nota: preguntarle a la audiencia por qué no alcanza con pedirle al LLM, en el prompt, que no use esas tablas. Respuesta: el prompt es una sugerencia y el código es una barrera determinista; la garantía real son los permisos de la base.
>
> Lo que el caso real todavía no hace: la solo lectura está solo en el prompt. El código ejecuta lo que recibe, y la revisión de tablas mira solo lo que sigue a FROM o JOIN, así que un UPDATE no lo detecta. Como el usuario de base tiene escritura, lo correcto es separar usuarios: uno de solo lectura sobre las tablas del dominio para las consultas, y otro con escritura solo sobre las tablas de logs.
>
> Capa 1: hoy DSO y DPO dan las mismas tablas y el único rol incluye los dos, así que en la práctica todos ven el mismo esquema. Capa 2: si el SQL usa una tabla fuera de la lista, vuelve al LLM como un reintento más.
>
> Contraste con la demo: la base de datos se abre en solo lectura, el chequeo exige una única sentencia SELECT o WITH, y los logs van a otra base, con otra conexión. La demo no valida tablas por rol: está documentado como decisión diferida.

### Slide 11 — Decisión 3: guardas y autocorrección
- **Guardas de intención:** reglas simples (expresiones regulares) que comparan la pregunta con el SQL. No cuestan una llamada al LLM.

  | La pregunta dice | Pero el SQL… |
  |---|---|
  | "menor a 60" | usa `>=` |
  | "top 10" | no corta el ranking en 10 |
  | "en marzo de 2025" | no filtra ese mes ni ese año |

- **Disparan un reintento:** una guarda que falla, un error de SQL o más de 1000 filas.
- Si falla, el SQL y el error vuelven al LLM (máx. 3 intentos). Si no lo logra, responde que no pudo, en vez de inventar.

> Nota: las guardas de intención no tienen costo de LLM. El caso real funciona en inglés: las guardas reconocen "less than", "top 10" o "March", y los ejemplos están traducidos. Además de estas, hay guardas "soft" que solo quedan en el log, como un top 5 sin LIMIT.
>
> La autocorrección le devuelve al LLM el SQL y el problema, y el LLM lo regenera. Tiene hasta 3 intentos.

### Slide 12 — Mismo patrón, dos escalas
Pregunta → SQL → guardas → ejecución → texto, tabla y gráfico.

| | Caso real | Demo UTDT |
|---|---|---|
| Datos | SAP HANA Cloud | SQLite |
| LLM | SAP Gen AI Hub | OpenAI |
| Acceso | Roles + JWT por dominio | Una clave compartida |
| Contra escrituras | Solo el prompt | Conexión de solo lectura |
| Cómo se construyó | 4 personas, 1 mes, a mano + vibe coding | 1 persona, spec driven |

- Con la escala cambian la seguridad, los datos y la operación.
- Puente a la parte 3: ¿qué cambia si se construye con spec driven?

> Nota: el caso real se construyó a mano y con vibe coding, sin una spec formal: un equipo de 4 personas entregó la primera versión en 1 mes, cuando lo previsto eran 3.
>
> La demo separa mejor las escrituras que el caso real, pero se hizo después, con las lecciones del caso real: no presentarlo como prueba del método.
>
> Detalle que ya no está en la tabla. Validación de tablas: el caso real valida por rol; la demo no (decisión diferida). Logs: en el caso real van a la misma base y con el mismo usuario que las consultas; en la demo, a otra base con otra conexión. Contra escrituras: en el caso real lo pide solo el prompt y el usuario de base tiene lectura y escritura; la demo usa una conexión de solo lectura y exige una única sentencia SELECT o WITH. UI: SAPUI5 / Fiori en el caso real, Vue en la demo. Backend: Python (FastAPI) + SAP CAP en el caso real, Node.js (Fastify) en la demo.

---

## Parte 3 — Cómo se construye: a mano, vibe coding y spec driven (18 min)

### Slide 13 — Tres formas de construir
| | A mano | Vibe coding | Spec driven |
|---|---|---|---|
| Punto de partida | Un ticket | Un prompt | Una spec refinada |
| La ambigüedad | Aparece tarde | El agente supone | Se resuelve antes |
| Las decisiones | En la cabeza de alguien | Se pierden en el chat | Versionadas en el issue |
| Tests y docs | Según el tiempo | Solo si se piden | Parte del gate |
| La revisión | Un compañero, si puede | Ver si "anda" | Un agente con contexto limpio |

Sin una spec, el agente completa los huecos inventando.

> Nota: no es que hacerlo a mano esté mal. Las specs, los tests y la revisión ya existían como buenas prácticas. Spec driven las vuelve obligatorias, porque sin una spec el agente completa los huecos inventando.
>
> El riesgo de spec driven: una spec mal escrita hace que el agente implemente lo equivocado con total confianza. Por eso la spec se revisa antes de escribir código. La tabla describe la experiencia de este proyecto (una persona, un caso), no un estudio.
>
> Detalle que ya no está en la tabla. Quién escribe: a mano, el desarrollador escribe y depura; con vibe coding, el agente, y el desarrollador pide, prueba y corrige; con spec driven, el agente contra la spec, y el desarrollador especifica y revisa. En spec driven la ambigüedad se resuelve en el refinamiento, donde el agente pregunta, y los tests y docs son criterios de aceptación y parte del gate.

### Slide 14 — Spec driven en la práctica: el ciclo
1. `/create-issue`: captura el problema. *Humano: describe.*
2. `/refine-issue`: preguntas, alcance y criterios. *Humano: responde.*
3. `/work-issue`: plan → código → tests → self-review → merge si el gate pasa. *Humano: aprueba el plan.*
4. (+) `/review-pr`: revisión aparte, de solo lectura. Con repo remoto, va antes de aprobar el PR. *Humano: decide el PR.*

- **El issue es la spec:** un archivo Markdown en el repo: `open` → `refined` → `closed`.
- **Reglas escritas:** el agente las lee siempre: nunca commitear código en `main`, nunca subir secretos, hacer lo mínimo.
- **Dos modelos:** la regla: uno más capaz planifica (Opus) y uno más rápido implementa (Sonnet).

> Nota: en la demo el merge es automático: si el gate está verde y la self-review no tiene bloqueantes, el agente mergea. Está autorizado así porque es un POC local, sin repo remoto. Con un repo remoto, una persona aprueba el PR antes del merge.
>
> La regla de modelos está escrita en el repo, pero en esta demo casi todo lo hizo Opus: lo dicen los commits (256 con Opus y 10 con Sonnet).

### Slide 15 — Del pedido a la spec: el issue #30
- **1 · Crear el issue.**
  - **Entrada:** "Cuando pido dos listados separados, el bot los junta en una sola tabla."
  - **Salida:** `issues/30-listados-separados.md`, con `title: Devolver listados separados cuando el mensaje pide más de uno`, `type: fix` y `status: open`.
  - Captura liviana: todavía no se diseña nada.
- **2 · Refinar: escribir la spec.** El agente lee el código y pregunta hasta que el issue se pueda implementar.
  - Título nuevo: *"Responder con varias tablas y gráficos cuando el mensaje pide resultados separados"*.
  - **Entra:** de 1 a 5 consultas, cada una con un título; cada consulta pasa por las guardas; si una falla, se regenera el set completo.
  - **No entra:** cambios en el frontend y respuestas parciales.
  - **Caso borde:** "Mostralo como gráfico de torta", después de dos secciones, repite las dos consultas.
  - **Criterio de aceptación:** una sección sin filas o con un gráfico que no encaja no afecta a las demás.

> Nota: la spec refinada tiene objetivo, alcance (qué entra y qué no), comportamiento esperado, casos borde, errores, criterios de aceptación y decisiones diferidas. El #30 salió del refinamiento con un título nuevo, y pasó de fix a feat.
>
> Lo que no entra importa tanto como lo que entra, porque evita que el agente haga de más.
>
> Los issues son archivos locales que se commitean directo en `main`, porque este proyecto no tiene repo remoto. Es la única excepción a la regla de no commitear en `main`.

### Slide 16 — Trabajar el issue
1. Crea una rama (`feat/30-listados-separados`). Un hook pre-commit impide commitear código en `main`.
2. Presenta un plan y espera la aprobación del humano. *(Humano)*
3. Implementa el código con sus tests.
4. Corre el quality gate: lint, tests y cobertura mínima del 85%. *(Gate)*
5. Self-review: un agente nuevo, sin el contexto del que programó, revisa el diff contra el issue y la seguridad. *(Agente nuevo)*
6. Escribe el PR dentro del issue: qué hace, qué encontró y una sección *Verification* por cada gate.
7. Mergea a `main` solo si el gate pasa y la self-review no tiene bloqueantes. En la demo es automático. *(Merge)*

> Nota: el hook es un reemplazo local de la protección de ramas: deja pasar solo archivos de `issues/` y commits de merge. En la demo el merge es automático porque es un POC local, sin repo remoto. Con un repo remoto, una persona aprobaría el PR antes.

### Slide 17 — La revisión: por qué un agente nuevo
- Autor (conoce sus supuestos) → diff + issue (lo único que pasa) → revisor nuevo (contexto limpio) → resultado (bloqueantes o sugerencias).
- **¿Por qué un agente nuevo?** El que escribió el código tiende a confirmar su propia solución. Uno con el contexto limpio no está anclado.
- **Ejemplo del #38:** una ronda, sin bloqueantes; 3 mejoras menores aplicadas, en el código, en los tests y en el README; 1 sugerencia revisada y descartada, con el motivo escrito.

> Nota: la self-review la hace un subagente dentro de `/work-issue`: lee el diff y el issue, sin el contexto del que programó. `/review-pr` es una opción aparte; en esta demo el control humano está en la spec y en el plan.

### Slide 18 — Cuando el plan no alcanza: el #38
- **2 h 11 min**, de abierto a mergeado: abierto 23:26 → refinado 23:58 → cambio de enfoque 01:19 → cerrado 01:34 → mergeado 01:37.
- **El problema:** el eval (preguntas de prueba que califica otro LLM) marcaba como "otro idioma" respuestas que estaban en español.
- **La spec:** un criterio medible: las respuestas correctas tenían que aprobar, y las que estaban en otro idioma, no.
- **Qué pasó:** el plan no alcanzó: el juez leía con ruido el idioma de la pregunta. El agente probó varias formas de preguntarle, ninguna cumplió, y lo reportó con datos.
- **La decisión:** el humano eligió el plan B que ya estaba en la spec: guardar el idioma esperado de cada pregunta. El cambio quedó escrito en el issue.
- **Resultado:** con el mismo criterio, las correctas aprueban y las de otro idioma, no.
- **Lección:** con criterios medibles se ve cuándo algo no funciona, y las decisiones diferidas escritas dejan listo el plan B.

> Nota: es un issue de la demo, no del caso real.
>
> El eval: un set de preguntas de prueba (el "golden") que se corre contra el bot real; otro LLM, el juez, califica cada respuesta. Uno de sus criterios es si la respuesta está en el idioma de la pregunta. "Aprobar" quiere decir que el juez da al menos 50% de probabilidad de que lo esté.
>
> El plan original: que el juez dijera el idioma de la pregunta y el de la respuesta, y compararlos en código. Falló porque el juez se confundía con el idioma de la pregunta: por ejemplo, leía "mostralo como gráfico de torta" como otro idioma. El plan B ya estaba escrito en la spec como decisión diferida: guardar el idioma de cada pregunta de prueba, para que el juez mire solo la respuesta. El criterio no se aflojó.
>
> Horarios tomados de git log, hora de Argentina.

### Slide 19 — Los números y los tiempos
- **38** issues cerrados · **311** commits y 45 merges · **660** tests automáticos · **99,75%** de cobertura de statements.
- Gráfico, días corridos hasta la versión: caso real, 4 personas: 30 · demo a mano, 1 persona (estimado): 14 · demo spec driven, 1 persona: 4,5.
- No se comparan 1 a 1: el caso real suma SAP, roles y deploy en la nube; la demo spec driven se hizo después, con el dominio ya conocido; las 2 semanas son una estimación.

> Nota: los 311 commits y 45 merges son al cerrar el #38; después se sumaron los de la presentación. Caso real: 1 mes hasta la primera versión, cuando lo previsto eran 3.
>
> La demo spec driven llevó unos 4,5 días corridos: del 19 de octubre a las 12:11 al 24 a la 01:34. Son unos 8 issues por día, en serie, una persona.
>
> Si preguntan por el tiempo por issue: mediana de 7 h 44 min de abierto a cerrado (23 issues, de 1 h 46 min a 42 h), con tiempo en cola incluido. Algunos, unas 2 h (#30: 2 h 29 min hasta el merge; #38: 2 h 11 min).
>
> La cobertura la miden tests que escribió el mismo agente: mide qué código se ejecuta, no si los tests son buenos.

---

## Cierre (5 min)

### Slide 20 — Lo que nos llevamos
1. El valor no está solo en el LLM, sino en los datos bien descritos, las guardas y la seguridad que lo rodean.
2. No hay que confiar en el modelo: lo que importa se verifica en código y en los permisos de la base.
3. Con spec driven, el trabajo humano pasa de escribir código a especificar, aprobar el plan y definir los criterios con los que se verifica el resultado.

> Nota: sobre el punto 2: el caso real todavía no lo cumple para las escrituras. La solo lectura está solo en el prompt, y el usuario de base tiene escritura (ver la slide 10 y el respaldo).

### Slide 21 — ¿Preguntas? Gracias

---

## Respaldo

### Slide 22 — Cómo se mide la calidad
- **Preguntas golden** (demo): un set de preguntas con respuesta conocida, que se corre contra el pipeline real.
- **LLM como juez** (demo): otro LLM evalúa si el SQL responde la pregunta y si el texto es fiel a los datos.
- **Feedback en producción** (caso real): el usuario califica cada respuesta, y cada interacción queda registrada.
- Qué califica el eval de la demo (23 preguntas de prueba): clasificación (¿entendió qué tipo de mensaje era?), SQL (¿responde la pregunta?), narrativa (¿el texto es fiel a los datos?), gráfico (¿encaja?) e idioma (¿está en el idioma del mensaje?).
- Una corrida encontró dos defectos reales: el bot contestó "Hola" en inglés y un SQL sumaba mal los objetivos.

> Nota: el pipeline y el juez son modelos del mismo proveedor (OpenAI). SQL y texto se califican de 0 a 2: no responde, parcial o completa. Gráfico e idioma son una probabilidad. La clasificación no la califica el juez: se compara en código con la esperada.
>
> El defecto del SQL: unía la tabla de objetivos con cada pedido, así que sumaba el objetivo de cada mes una vez por pedido. El caso real también tiene preguntas golden y un juez, pero se corren a mano.

### Slide 23 — Capturas de la demo (plan B)
Una captura por consulta de la demo: ventas por mes en 2025, el seguimiento de 2024, las dos secciones (clientes y productos) y la pregunta fuera de alcance.

> Nota: capturas de la demo real, una por consulta. La consulta 3 son dos capturas encadenadas: clientes arriba y productos abajo. Si cambian los datos o el modelo, volver a capturar antes de la clase.

### Slide 24 — Atajos y datos materializados
- **Atajos para preguntas frecuentes:** previsto: las preguntas frecuentes llevan un SQL validado y no pasan por el LLM (más rápida, más barata, siempre igual). Hoy ninguna lo tiene cargado.
- **Datos materializados:** un job programado copia los datos del ERP a tablas locales (ERP → copias locales → agente). El agente consulta solo las copias: performance estable y el agente no toca el ERP en vivo.
- Aparte: al terminar la copia, se dispara un pronóstico de DSO con ML.

> Nota: atajos: están previstos, pero no activos. Las preguntas estándar del caso real se muestran como sugerencias para clickear, pero ninguna tiene un SQL cargado, así que hoy siempre genera el LLM. El match sería por texto exacto.
>
> Pronóstico: lo dispara el job al terminar la copia y corre en la API Python. Es un ensamble de cuatro modelos: Random Forest, Gradient Boosting, XGBoost y suavizado exponencial.
>
> Que el agente no toque el ERP depende de la lista de tablas permitidas, no de los permisos de la base.

### Slide 25 — Lo que todavía falta en el caso real
- **Sin CI/CD:** cada deploy es manual.
- **Deploy con pasos manuales:** hay pasos que no están en los descriptores de deploy.
- **La UI llama directo al agente:** sin pasar por el middleware, no hay un punto central para registrar o limitar el tráfico.
- **Un solo usuario de base:** ejecuta el SQL del LLM y escribe los logs, así que tiene lectura y escritura. Falta uno de solo lectura para las consultas.

> Nota: sirve si preguntan por los trade-offs de llevarlo a producción.
