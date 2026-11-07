// Generates presentacion.pptx, the deck of the class on agents (its script is guion.md).
// Running it again overwrites any change made to that file by hand in PowerPoint.
//
// It's not part of the npm workspaces, so its dependencies live outside the repo:
//   npm install --prefix <dir> pptxgenjs@4
//   NODE_PATH=<dir>/node_modules SKILL_SCRIPTS=<pptx skill>/scripts node build.cjs [out.pptx]
// SKILL_SCRIPTS is the scripts folder of the pptx skill, which provides apply_theme.js:
// pptxgenjs can't write theme colors, and without it the deck gets Office's stock palette.
// Without out.pptx it writes presentacion.pptx next to this script.
//
// CommonJS on purpose: NODE_PATH resolves require() but not import.
/* global require, process, console, __dirname */
/* eslint-disable @typescript-eslint/no-require-imports */
const path = require('node:path');
const pptxgen = require('pptxgenjs');

if (!process.env.SKILL_SCRIPTS) {
  console.error('Set SKILL_SCRIPTS to the scripts folder of the pptx skill (see the header).');
  process.exit(1);
}
const { applyTheme } = require(path.join(process.env.SKILL_SCRIPTS, 'apply_theme.js'));

const OUT = process.argv[2] ?? path.join(__dirname, 'presentacion.pptx');

const THEME = {
  name: 'Agentes en la practica',
  headFontFace: 'Arial',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '1F2A30',
    lt1: 'FFFFFF',
    dk2: '0F3D3E',
    lt2: 'EAF4F2',
    accent1: '14918A',
    accent2: 'F2A541',
    accent3: 'C8364A',
    accent4: '5B7B7A',
    accent5: 'B9DCD6',
    accent6: '3D5A80',
    hlink: '14918A',
    folHlink: '5B7B7A',
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = 'LAYOUT_WIDE'; // 13.333 x 7.5 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = 'Agentes en la práctica';
pres.author = 'Emiliano Berestovoy';
const C = pres.SchemeColor;
const S = pres.shapes;
const MONO = 'Courier New';

// ---------- Layouts ----------
pres.defineSlideMaster({
  title: 'TITLE',
  background: { color: C.text2 },
  objects: [
    {
      placeholder: {
        options: {
          name: 'title',
          type: 'title',
          align: 'left',
          x: 0.8,
          y: 1.9,
          w: 6.6,
          h: 2.0,
          fontSize: 44,
          bold: true,
          color: C.background1,
          valign: 'bottom',
          margin: 0,
        },
        text: '',
      },
    },
    {
      placeholder: {
        options: {
          name: 'body',
          type: 'body',
          x: 0.8,
          y: 4.1,
          w: 6.6,
          h: 0.9,
          fontSize: 24,
          color: C.accent5,
          valign: 'top',
          margin: 0,
        },
        text: '',
      },
    },
  ],
});
pres.defineSlideMaster({
  title: 'SECTION',
  background: { color: C.text2 },
  objects: [
    {
      placeholder: {
        options: {
          name: 'kicker',
          type: 'body',
          x: 0.8,
          y: 2.0,
          w: 8.6,
          h: 0.5,
          fontSize: 20,
          bold: true,
          color: C.accent2,
          margin: 0,
        },
        text: '',
      },
    },
    {
      placeholder: {
        options: {
          name: 'title',
          type: 'title',
          align: 'left',
          x: 0.8,
          y: 2.55,
          w: 8.6,
          h: 1.6,
          fontSize: 44,
          bold: true,
          color: C.background1,
          valign: 'top',
          margin: 0,
        },
        text: '',
      },
    },
    {
      placeholder: {
        options: {
          name: 'sub',
          type: 'body',
          x: 0.8,
          y: 4.3,
          w: 8.6,
          h: 0.8,
          fontSize: 22,
          color: C.accent5,
          valign: 'top',
          margin: 0,
        },
        text: '',
      },
    },
  ],
});
pres.defineSlideMaster({
  title: 'CONTENT',
  background: { color: C.background1 },
  objects: [
    {
      placeholder: {
        options: {
          name: 'title',
          type: 'title',
          align: 'left',
          x: 0.6,
          y: 0.35,
          w: 12.13,
          h: 0.85,
          fontSize: 32,
          bold: true,
          color: C.text2,
          valign: 'middle',
          margin: 0,
        },
        text: '',
      },
    },
    {
      text: {
        text: 'Agentes en la práctica',
        options: { x: 0.6, y: 7.0, w: 5, h: 0.3, fontSize: 10, color: C.accent4, margin: 0 },
      },
    },
  ],
  slideNumber: { x: 12.23, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: C.accent4, align: 'right' },
});
pres.defineSlideMaster({
  title: 'DARK',
  background: { color: C.text2 },
  objects: [
    {
      placeholder: {
        options: {
          name: 'title',
          type: 'title',
          align: 'left',
          x: 0.6,
          y: 0.5,
          w: 12.13,
          h: 0.9,
          fontSize: 36,
          bold: true,
          color: C.background1,
          valign: 'middle',
          margin: 0,
        },
        text: '',
      },
    },
  ],
  slideNumber: { x: 12.23, y: 7.0, w: 0.5, h: 0.3, fontSize: 10, color: C.accent5, align: 'right' },
});

// ---------- Helpers ----------
let seq = 0;
const id = (p) => `${p}-${++seq}`;
let section = '';
function slide(master, sectionTitle) {
  if (sectionTitle && sectionTitle !== section) {
    pres.addSection({ title: sectionTitle });
    section = sectionTitle;
  }
  return pres.addSlide({ masterName: master, sectionTitle: section });
}
function card(s, x, y, w, h, color = C.background2, extra = {}) {
  s.addShape(S.ROUNDED_RECTANGLE, {
    objectName: id('card'),
    x,
    y,
    w,
    h,
    rectRadius: 0.12,
    fill: { color },
    line: { type: 'none' },
    ...extra,
  });
}
function t(s, text, o) {
  s.addText(text, {
    isTextBox: true,
    objectName: id('text'),
    fontSize: 16,
    color: C.text1,
    valign: 'top',
    margin: 0,
    ...o,
  });
}
function circle(s, x, y, d, color, label, fontSize = 18, textColor = C.background1) {
  s.addShape(S.OVAL, {
    objectName: id('circle'),
    x,
    y,
    w: d,
    h: d,
    fill: { color },
    line: { type: 'none' },
  });
  if (label !== undefined)
    t(s, String(label), {
      x,
      y,
      w: d,
      h: d,
      fontSize,
      bold: true,
      color: textColor,
      align: 'center',
      valign: 'middle',
    });
}
function chip(s, x, y, w, h, text, fill, color = C.background1, fontSize = 12) {
  card(s, x, y, w, h, fill, { rectRadius: h / 2 });
  t(s, text, { x, y, w, h, fontSize, bold: true, color, align: 'center', valign: 'middle' });
}
function seg(s, x1, y1, x2, y2, color = C.accent4, width = 2, arrowHead = true) {
  const o = {
    objectName: id('line'),
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.abs(x2 - x1),
    h: Math.abs(y2 - y1),
    line: { color, width },
  };
  if (arrowHead) o.line.endArrowType = 'triangle';
  if (x2 < x1) o.flipH = true;
  if (y2 < y1) o.flipV = true;
  s.addShape(S.LINE, o);
}
const arrow = (s, x1, y1, x2, y2, color, width) => seg(s, x1, y1, x2, y2, color, width, true);
function bullets(items, o = {}) {
  return items.map((text, i) => ({
    text,
    options: {
      bullet: { indent: 16 },
      paraSpaceAfter: o.space ?? 10,
      breakLine: i < items.length - 1,
    },
  }));
}
function lines(items) {
  // items: [text, options] pairs, one paragraph each
  return items.map(([text, options = {}], i) => ({
    text,
    options: { ...options, breakLine: i < items.length - 1 },
  }));
}
const title = (s, text) => s.addText(text, { placeholder: 'title' });
const subtitle = (s, text) =>
  t(s, text, { x: 0.6, y: 1.2, w: 12.13, h: 0.42, fontSize: 18, color: C.accent4 });
const COLS3 = [0.6, 4.74, 8.88];
const W3 = 3.85;

function divider(kicker, ttl, sub, num, sectionTitle, notes) {
  const s = slide('SECTION', sectionTitle);
  s.addText(kicker, { placeholder: 'kicker' });
  s.addText(ttl, { placeholder: 'title' });
  s.addText(sub, { placeholder: 'sub' });
  circle(s, 9.9, 2.0, 2.8, C.accent1, num, 110);
  s.addNotes(notes);
  return s;
}

// ---------- 1. Portada ----------
{
  const s = slide('TITLE', 'Apertura');
  s.addText('Agentes en la práctica', { placeholder: 'title' });
  s.addText('De la pregunta al dato en segundos', { placeholder: 'body' });
  t(s, 'Un caso real, su arquitectura y cómo se construye con agentes', {
    x: 0.8,
    y: 5.2,
    w: 6.6,
    h: 0.8,
    fontSize: 18,
    color: C.background1,
  });
  // Chat mock-up
  card(s, 8.2, 1.5, 4.5, 0.95, C.accent1);
  t(s, '¿Cuáles son los 5 clientes con mayor DSO este trimestre?', {
    x: 8.4,
    y: 1.55,
    w: 4.1,
    h: 0.85,
    fontSize: 15,
    color: C.background1,
    valign: 'middle',
  });
  card(s, 7.8, 2.75, 4.9, 3.45, C.background1);
  t(s, 'Estos son los 5 clientes con mayor DSO del trimestre:', {
    x: 8.05,
    y: 2.95,
    w: 4.4,
    h: 0.6,
    fontSize: 14,
    color: C.text1,
  });
  const heights = [1.9, 1.65, 1.4, 1.2, 1.0];
  heights.forEach((h, i) => {
    s.addShape(S.RECTANGLE, {
      objectName: id('bar'),
      x: 8.25 + i * 0.85,
      y: 5.85 - h,
      w: 0.55,
      h,
      fill: { color: i === 0 ? C.accent2 : C.accent1 },
      line: { type: 'none' },
    });
  });
  chip(s, 7.8, 6.4, 2.7, 0.45, 'Respuesta en segundos', C.accent2, C.text1, 13);
  s.addNotes(
    'Presentarse. La clase tiene tres partes: el problema y la solución de un caso real, cómo funciona por dentro y cómo se construye con agentes. En la parte 1 hay una demo en vivo.',
  );
}

// ---------- 2. Agenda ----------
{
  const s = slide('CONTENT', 'Apertura');
  title(s, 'Agenda');
  const items = [
    ['Problema, solución e impacto', 'Por qué hacía falta y qué cambió', '9 min'],
    ['Cómo funciona por dentro', 'La arquitectura y las decisiones de diseño', '13 min'],
    ['Cómo se construye', 'A mano, vibe coding y spec driven', '16 min'],
  ];
  items.forEach(([h, d, m], i) => {
    const x = COLS3[i];
    card(s, x, 1.7, W3, 4.2);
    circle(s, x + 0.3, 2.0, 0.8, C.accent1, i + 1, 26);
    t(s, h, { x: x + 0.3, y: 3.05, w: W3 - 0.6, h: 0.9, fontSize: 22, bold: true, color: C.text2 });
    t(s, d, { x: x + 0.3, y: 4.0, w: W3 - 0.6, h: 0.9, fontSize: 16 });
    chip(s, x + 0.3, 5.15, 1.3, 0.45, m, C.accent2, C.text1, 14);
  });
  t(s, 'Con una demo en vivo en la parte 1.', {
    x: 0.6,
    y: 6.2,
    w: 8,
    h: 0.4,
    fontSize: 16,
    italic: true,
    color: C.accent4,
  });
  s.addNotes('Anticipar que hay una demo en vivo en la parte 1.');
}

// ---------- 3. Divider Parte 1 ----------
divider(
  'Parte 1',
  'Problema, solución e impacto',
  'Por qué hacía falta y qué cambió',
  1,
  'Parte 1',
  'Parte 1: el problema del caso real, la solución y su impacto.',
);

// ---------- 4. El problema ----------
{
  const s = slide('CONTENT', 'Parte 1');
  title(s, 'El problema: cada dato es un pedido');
  t(
    s,
    bullets(
      [
        'El área de finanzas de una empresa multinacional necesita datos para decidir: cobranzas, pagos e inventario.',
        'Los datos están en el ERP.',
        'Para conseguirlos, el usuario de negocio le pide a Sistemas.',
      ],
      { space: 14 },
    ),
    { x: 0.6, y: 1.75, w: 4.75, h: 4.4, fontSize: 18 },
  );
  const steps = [
    'Negocio escribe un email',
    'Sistemas lo lee',
    'Espera un hueco en la agenda',
    'Arma la consulta y responde',
  ];
  const pos = [
    [5.85, 1.75],
    [9.7, 1.75],
    [9.7, 4.35],
    [5.85, 4.35],
  ];
  steps.forEach((text, i) => {
    const [x, y] = pos[i];
    card(s, x, y, 3.0, 1.5);
    circle(s, x + 0.2, y + 0.5, 0.5, C.accent3, i + 1, 16);
    t(s, text, { x: x + 0.85, y: y + 0.15, w: 2.0, h: 1.2, fontSize: 17, valign: 'middle' });
  });
  arrow(s, 8.95, 2.5, 9.6, 2.5, C.accent3, 2);
  arrow(s, 11.2, 3.35, 11.2, 4.25, C.accent3, 2);
  arrow(s, 9.6, 5.1, 8.95, 5.1, C.accent3, 2);
  arrow(s, 7.35, 4.25, 7.35, 3.35, C.accent3, 2);
  t(s, 'Cada repregunta reinicia el ciclo.', {
    x: 5.85,
    y: 6.1,
    w: 6.85,
    h: 0.45,
    fontSize: 18,
    bold: true,
    color: C.accent3,
  });
  s.addNotes(
    'Glosario rápido, sin profundizar. DSO: días que tarda la empresa en cobrar. DPO: días que tarda en pagar. DIO: días que el inventario está en stock.\n\nEl usuario de negocio no tiene acceso directo a los datos: cada pregunta es un pedido a Sistemas.',
  );
}

// ---------- 5. El costo del ciclo ----------
{
  const s = slide('CONTENT', 'Parte 1');
  title(s, 'El costo del ciclo');
  card(s, 0.6, 1.7, 4.0, 4.6);
  t(s, '½ día', {
    x: 0.9,
    y: 2.2,
    w: 3.4,
    h: 1.5,
    fontSize: 80,
    bold: true,
    color: C.accent3,
    valign: 'bottom',
  });
  t(s, 'por pregunta, con suerte', { x: 0.9, y: 3.85, w: 3.4, h: 0.6, fontSize: 20 });
  t(s, 'Escribir el email, que Sistemas lo lea, que tenga tiempo para hacerlo y que responda.', {
    x: 0.9,
    y: 4.6,
    w: 3.4,
    h: 1.4,
    fontSize: 15,
    color: C.accent4,
  });
  const segs = ['Escribir el email', 'Que Sistemas lo lea', 'Que tenga tiempo', 'Que responda'];
  segs.forEach((text, i) => {
    const x = 5.0 + i * 2.0;
    card(s, x, 1.8, 1.73, 0.95, C.accent3);
    t(s, text, {
      x: x + 0.12,
      y: 1.8,
      w: 1.49,
      h: 0.95,
      fontSize: 14,
      bold: true,
      color: C.background1,
      valign: 'middle',
      align: 'center',
    });
    if (i < segs.length - 1) arrow(s, x + 1.76, 2.275, x + 1.97, 2.275, C.accent3, 2);
  });
  card(s, 5.0, 3.15, 7.73, 1.4);
  circle(s, 5.3, 3.5, 0.7, C.accent2, '?', 24, C.text1);
  t(s, 'Cada repregunta ("¿y por región?", "¿y el trimestre anterior?") reinicia el ciclo.', {
    x: 6.25,
    y: 3.2,
    w: 6.2,
    h: 1.3,
    fontSize: 18,
    valign: 'middle',
  });
  card(s, 5.0, 4.85, 7.73, 1.4);
  circle(s, 5.3, 5.2, 0.7, C.accent3, '!', 24);
  t(s, 'Sistemas se vuelve el cuello de botella de las preguntas repetitivas.', {
    x: 6.25,
    y: 4.9,
    w: 6.2,
    h: 1.3,
    fontSize: 18,
    valign: 'middle',
  });
  s.addNotes(
    'Preguntarle a la audiencia: ¿cuántas preguntas se hace un analista antes de llegar a una conclusión? Cada una paga el ciclo completo.',
  );
}

// ---------- 6. La solución ----------
{
  const s = slide('CONTENT', 'Parte 1');
  title(s, 'La solución: preguntarle a un agente');
  t(s, 'Un asistente que responde en lenguaje natural', {
    x: 0.6,
    y: 1.7,
    w: 5.3,
    h: 0.8,
    fontSize: 20,
    bold: true,
    color: C.text2,
  });
  t(
    s,
    bullets(
      [
        'El usuario escribe la pregunta como se la haría a una persona.',
        'La respuesta trae un texto que explica el resultado, una tabla, un gráfico, 3 preguntas sugeridas y la descarga a CSV.',
        'Por detrás, un agente traduce la pregunta a SQL, la ejecuta y explica el resultado.',
      ],
      { space: 14 },
    ),
    { x: 0.6, y: 2.65, w: 5.3, h: 3.8, fontSize: 17 },
  );
  // Mock-up
  card(s, 6.3, 1.6, 6.43, 5.1);
  card(s, 8.1, 1.85, 4.4, 0.8, C.accent1);
  t(s, '¿Cuáles son los 5 clientes con mayor DSO este trimestre?', {
    x: 8.3,
    y: 1.9,
    w: 4.0,
    h: 0.7,
    fontSize: 14,
    color: C.background1,
    valign: 'middle',
  });
  card(s, 6.55, 2.85, 5.95, 3.6, C.background1);
  t(s, 'El Cliente A tiene el DSO más alto: 92 días, 26 más que el Cliente E.', {
    x: 6.75,
    y: 2.98,
    w: 5.55,
    h: 0.5,
    fontSize: 13,
  });
  const rows = [
    ['Cliente', 'DSO'],
    ['Cliente A', '92'],
    ['Cliente B', '85'],
    ['Cliente C', '78'],
    ['Cliente D', '71'],
    ['Cliente E', '66'],
  ];
  s.addTable(
    rows.map((r, i) =>
      r.map((v, j) => ({
        text: v,
        options: {
          bold: i === 0,
          color: i === 0 ? C.background1 : C.text1,
          fill: { color: i === 0 ? C.accent1 : C.background1 },
          align: j === 1 ? 'right' : 'left',
        },
      })),
    ),
    {
      objectName: id('table'),
      x: 6.75,
      y: 3.55,
      w: 2.5,
      colW: [1.6, 0.9],
      rowH: 0.27,
      fontSize: 11,
      margin: [0.03, 0.08, 0.03, 0.08],
      border: { type: 'solid', pt: 0.75, color: C.accent5 },
    },
  );
  s.addChart(
    pres.charts.BAR,
    [{ name: 'DSO', labels: ['A', 'B', 'C', 'D', 'E'], values: [92, 85, 78, 71, 66] }],
    {
      objectName: id('chart'),
      x: 9.45,
      y: 3.45,
      w: 2.9,
      h: 1.8,
      barDir: 'col',
      chartColors: [HEX.accent2],
      showLegend: false,
      showValue: false,
      valAxisHidden: true,
      valGridLine: { style: 'none' },
      catGridLine: { style: 'none' },
      catAxisLabelColor: HEX.accent4,
      catAxisLabelFontSize: 10,
      catAxisLabelFontFace: '+mn-lt',
      catAxisLineShow: false,
      barGapWidthPct: 60,
    },
  );
  [
    ['¿Y por región?', 6.75, 1.75],
    ['¿Y el año pasado?', 8.6, 1.85],
    ['¿Qué cambió?', 10.55, 1.6],
  ].forEach(([text, x, w]) => {
    card(s, x, 5.4, w, 0.42, C.background2, { rectRadius: 0.21 });
    t(s, text, {
      x,
      y: 5.4,
      w,
      h: 0.42,
      fontSize: 11,
      color: C.accent1,
      bold: true,
      align: 'center',
      valign: 'middle',
    });
  });
  t(s, 'Descargar CSV', {
    x: 6.75,
    y: 5.95,
    w: 2.0,
    h: 0.35,
    fontSize: 12,
    color: C.accent1,
    underline: { style: 'sng' },
  });
  s.addNotes(
    'La maqueta es ilustrativa: los clientes y los valores son inventados. Lo que importa es la forma de la respuesta: texto, tabla, gráfico, sugerencias y descarga.',
  );
}

// ---------- 7. Demo ----------
{
  const s = slide('CONTENT', 'Parte 1');
  title(s, 'Demo en vivo');
  chip(s, 10.43, 0.55, 2.3, 0.5, '3 min · demo UTDT', C.accent2, C.text1, 14);
  const rows = [
    ['¿Cuáles son las ventas por mes en 2025?', 'Texto, tabla y gráfico'],
    ['¿Y en 2024?', 'Un seguimiento que usa la conversación'],
    [
      'Los 5 clientes con más ventas y un listado separado de los 3 productos con más ventas',
      'Dos secciones (lo retomamos en la parte 3)',
    ],
    ['¿Cuál es la capital de Francia?', 'Fuera de alcance: no corre ningún SQL'],
  ];
  rows.forEach(([q, r], i) => {
    const y = 1.7 + i * 1.2;
    card(s, 0.6, y, 12.13, 1.0);
    circle(s, 0.85, y + 0.2, 0.6, C.accent1, i + 1, 18);
    t(s, q, { x: 1.7, y: y + 0.1, w: 6.6, h: 0.8, fontSize: 17, italic: true, valign: 'middle' });
    arrow(s, 8.45, y + 0.5, 8.95, y + 0.5, C.accent4, 2);
    t(s, r, {
      x: 9.1,
      y: y + 0.1,
      w: 3.45,
      h: 0.8,
      fontSize: 15,
      bold: true,
      color: C.text2,
      valign: 'middle',
    });
  });
  s.addNotes(
    'Demo con UTDT: el mismo patrón, con datos ficticios de ventas. Las cuatro preguntas son casos del golden del eval, así que ya están probadas. Igual conviene correrlas antes de la clase.\n\nLa tercera vuelve en la parte 3: es el issue #30.',
  );
}

// ---------- 8. Impacto ----------
{
  const s = slide('CONTENT', 'Parte 1');
  title(s, 'Impacto');
  card(s, 0.6, 1.7, 5.4, 2.5);
  t(s, 'Antes', { x: 0.9, y: 1.9, w: 4.8, h: 0.4, fontSize: 18, bold: true, color: C.accent4 });
  t(s, '½ día', {
    x: 0.9,
    y: 2.3,
    w: 4.8,
    h: 1.15,
    fontSize: 66,
    bold: true,
    color: C.accent3,
    valign: 'middle',
  });
  t(s, 'por pregunta, con suerte', { x: 0.9, y: 3.5, w: 4.8, h: 0.5, fontSize: 17 });
  arrow(s, 6.15, 2.95, 7.15, 2.95, C.accent2, 3);
  card(s, 7.33, 1.7, 5.4, 2.5, C.accent1);
  t(s, 'Ahora', {
    x: 7.63,
    y: 1.9,
    w: 4.8,
    h: 0.4,
    fontSize: 18,
    bold: true,
    color: C.background1,
  });
  t(s, 'segundos', {
    x: 7.63,
    y: 2.3,
    w: 4.8,
    h: 1.15,
    fontSize: 66,
    bold: true,
    color: C.background1,
    valign: 'middle',
  });
  t(s, 'por pregunta, y la repregunta es inmediata', {
    x: 7.63,
    y: 3.5,
    w: 4.8,
    h: 0.5,
    fontSize: 17,
    color: C.background1,
  });
  const items = [
    ['El usuario explora', 'Pregunta, repregunta y profundiza en lugar de esperar.'],
    [
      'Sistemas se enfoca',
      'Mantiene los datos y su descripción en vez de responder consultas repetitivas.',
    ],
    ['Cada uno ve lo suyo', 'Cada usuario ve solo los datos que su rol le permite.'],
  ];
  items.forEach(([h, d], i) => {
    const x = COLS3[i];
    card(s, x, 4.55, W3, 1.85);
    t(s, h, {
      x: x + 0.25,
      y: 4.75,
      w: W3 - 0.5,
      h: 0.45,
      fontSize: 17,
      bold: true,
      color: C.text2,
    });
    t(s, d, { x: x + 0.25, y: 5.25, w: W3 - 0.5, h: 1.05, fontSize: 15 });
  });
  s.addNotes(
    'No hay métricas formales. El argumento es el ciclo que se elimina: de medio día por pregunta, en el mejor caso, a segundos.',
  );
}

// ---------- 9. Divider Parte 2 ----------
divider(
  'Parte 2',
  'Cómo funciona por dentro',
  'La arquitectura y las decisiones de diseño',
  2,
  'Parte 2',
  'Parte 2: la arquitectura del caso real y cuatro decisiones de diseño.',
);

// ---------- 10. Arquitectura ----------
{
  const s = slide('CONTENT', 'Parte 2');
  title(s, 'Arquitectura general');
  s.addShape(S.ROUNDED_RECTANGLE, {
    objectName: id('container'),
    x: 0.6,
    y: 1.5,
    w: 8.75,
    h: 5.3,
    rectRadius: 0.15,
    fill: { color: C.background1 },
    line: { color: C.accent4, width: 1.25, dashType: 'dash' },
  });
  t(s, 'SAP BTP · Cloud Foundry', {
    x: 0.85,
    y: 1.62,
    w: 4,
    h: 0.35,
    fontSize: 12,
    bold: true,
    color: C.accent4,
  });
  const box = (x, y, w, h, fill, head, sub, headColor, subColor, extra = {}) => {
    card(s, x, y, w, h, fill, extra);
    t(
      s,
      lines([
        [head, { bold: true, fontSize: 15, color: headColor }],
        ...sub.map((l) => [l, { fontSize: 13, color: subColor }]),
      ]),
      { x: x + 0.2, y, w: w - 0.4, h, valign: 'middle' },
    );
  };
  box(3.2, 2.0, 3.6, 0.95, C.accent1, 'UI web', ['SAPUI5 / Fiori'], C.background1, C.background1);
  box(
    0.9,
    3.6,
    3.7,
    1.3,
    C.background2,
    'Middleware · SAP CAP',
    ['Emite el token con los roles', 'Programa la copia de datos'],
    C.text2,
    C.text1,
  );
  box(
    5.2,
    3.6,
    3.7,
    1.3,
    C.background2,
    'Agente · Python (FastAPI)',
    ['Genera, valida y ejecuta el SQL', 'Arma la respuesta'],
    C.text2,
    C.text1,
    { line: { color: C.accent2, width: 2 } },
  );
  box(
    0.9,
    5.5,
    3.7,
    1.0,
    C.text2,
    'SAP HANA Cloud',
    ['Copias de los datos del ERP'],
    C.background1,
    C.accent5,
  );
  box(
    5.2,
    5.5,
    3.7,
    1.0,
    C.text2,
    'SAP Gen AI Hub',
    ['LLM: OpenAI o Anthropic'],
    C.background1,
    C.accent5,
  );
  arrow(s, 3.9, 2.95, 2.75, 3.6);
  t(s, '1. pide un token', {
    x: 0.9,
    y: 3.02,
    w: 1.85,
    h: 0.3,
    fontSize: 12,
    color: C.accent4,
    align: 'right',
  });
  arrow(s, 6.1, 2.95, 7.05, 3.6);
  t(s, '2. pregunta + token', { x: 7.3, y: 3.02, w: 1.95, h: 0.3, fontSize: 12, color: C.accent4 });
  arrow(s, 2.75, 4.9, 2.75, 5.5);
  t(s, 'copia programada', { x: 2.9, y: 5.05, w: 1.7, h: 0.3, fontSize: 11, color: C.accent4 });
  arrow(s, 5.5, 4.9, 4.6, 5.5);
  t(s, 'SQL', { x: 4.6, y: 4.95, w: 0.4, h: 0.3, fontSize: 11, color: C.accent4 });
  arrow(s, 7.05, 4.9, 7.05, 5.5);
  t(s, 'prompts', { x: 7.2, y: 5.05, w: 1.2, h: 0.3, fontSize: 11, color: C.accent4 });
  t(s, 'Claves', { x: 9.6, y: 1.6, w: 3.13, h: 0.4, fontSize: 18, bold: true, color: C.text2 });
  [
    'El agente es el único que habla con el LLM.',
    'Cambiar de modelo (OpenAI o Anthropic) es cambiar una variable de configuración.',
    'El token lleva los roles del usuario: DSO, DPO o DIO.',
  ].forEach((text, i) => {
    const y = 2.15 + i * 1.45;
    card(s, 9.6, y, 3.13, 1.25);
    t(s, text, { x: 9.8, y, w: 2.73, h: 1.25, fontSize: 14, valign: 'middle' });
  });
  s.addNotes(
    'Tres capas: la UI, un middleware que emite tokens y programa la copia de datos, y el agente en Python, que es el que habla con el LLM. Todo corre en SAP BTP (Cloud Foundry). El LLM se usa a través de SAP Gen AI Hub, así que cambiar de modelo es cambiar una variable.',
  );
}

// ---------- 11. Recorrido ----------
{
  const s = slide('CONTENT', 'Parte 2');
  title(s, 'El recorrido de una pregunta');
  const steps = [
    [
      'UI → Middleware',
      'Pide un token: un JWT firmado, válido 60 minutos, con los roles del usuario.',
      false,
    ],
    ['UI → Agente', 'Manda la pregunta y el token.', false],
    ['Agente', 'Arma el esquema de datos que ese usuario puede ver.', false],
    [
      'Agente → LLM',
      'Si es una pregunta frecuente, usa un SQL ya validado. Si no, le pide el SQL al LLM.',
      true,
    ],
    ['Agente → Base', 'Valida el SQL con guardas y lo ejecuta.', false],
    ['Agente → LLM', 'Convierte las filas en texto, tabla, gráfico y sugerencias.', true],
    ['Agente → UI', 'Registra todo y devuelve la respuesta.', false],
  ];
  steps.forEach(([actor, text, llm], i) => {
    const y = 1.6 + i * 0.72;
    card(s, 0.6, y, 9.0, 0.62);
    circle(s, 0.75, y + 0.1, 0.42, C.accent1, i + 1, 14);
    chip(
      s,
      1.35,
      y + 0.13,
      1.9,
      0.36,
      actor,
      llm ? C.accent2 : C.accent5,
      llm ? C.text1 : C.text2,
      11,
    );
    t(s, text, { x: 3.45, y, w: 6.0, h: 0.62, fontSize: 15, valign: 'middle' });
  });
  card(s, 9.9, 1.6, 2.83, 4.94, C.text2);
  t(s, '2 de 7', {
    x: 10.15,
    y: 2.1,
    w: 2.4,
    h: 1.0,
    fontSize: 48,
    bold: true,
    color: C.accent2,
    valign: 'middle',
  });
  t(s, 'pasos usan el LLM.', {
    x: 10.15,
    y: 3.2,
    w: 2.4,
    h: 0.8,
    fontSize: 19,
    color: C.background1,
  });
  t(s, 'El resto es código: permisos, guardas, ejecución y registro.', {
    x: 10.15,
    y: 4.1,
    w: 2.4,
    h: 1.8,
    fontSize: 15,
    color: C.accent5,
  });
  s.addNotes(
    'Recorrer los 7 pasos. Remarcar que el LLM interviene en 2: generar el SQL y armar la respuesta. Todo lo demás es código determinista. Un agente útil es mucho más que el modelo.',
  );
}

// ---------- 12. Decisión 1 ----------
{
  const s = slide('CONTENT', 'Parte 2');
  title(s, 'Decisión 1: el LLM solo ve lo que describimos');
  t(
    s,
    bullets(
      [
        'El esquema que recibe el LLM sale de tablas de metadatos.',
        'Cada tabla y cada columna tiene una descripción en lenguaje de negocio.',
        'La calidad de las respuestas depende tanto de cómo se describen los datos como del prompt.',
      ],
      { space: 16 },
    ),
    { x: 0.6, y: 1.75, w: 5.6, h: 4.6, fontSize: 19 },
  );
  card(s, 6.7, 1.7, 6.03, 2.6, C.text2);
  t(s, 'Metadatos de una columna (ejemplo)', {
    x: 6.95,
    y: 1.85,
    w: 5.5,
    h: 0.35,
    fontSize: 13,
    bold: true,
    color: C.accent5,
  });
  t(
    s,
    lines([
      ['Columna', { bold: true, color: C.accent2, fontSize: 14 }],
      ['DSO_12M', { fontFace: MONO, color: C.background1, paraSpaceAfter: 8 }],
      ['Descripción', { bold: true, color: C.accent2, fontSize: 14 }],
      ['DSO acumulado de los últimos 12 meses. No sumar entre períodos.', { color: C.background1 }],
    ]),
    { x: 6.95, y: 2.3, w: 5.5, h: 1.85, fontSize: 17 },
  );
  arrow(s, 9.7, 4.4, 9.7, 4.9, C.accent4, 2);
  card(s, 6.7, 5.0, 6.03, 1.3);
  t(
    s,
    lines([
      ['Prompt del LLM', { bold: true, color: C.text2, fontSize: 17 }],
      [
        'Solo las tablas y columnas descritas y permitidas para el rol del usuario.',
        { fontSize: 15 },
      ],
    ]),
    { x: 6.95, y: 5.0, w: 5.5, h: 1.3, valign: 'middle' },
  );
  s.addNotes(
    'El ejemplo es ilustrativo, pero el caso es real: el prompt tiene una regla para no sumar acumulados móviles entre períodos. Sin esa descripción, el LLM suma columnas que no se pueden sumar y el resultado parece correcto pero está mal.',
  );
}

// ---------- 13. Decisión 2 ----------
{
  const s = slide('CONTENT', 'Parte 2');
  title(s, 'Decisión 2: no confiar en el LLM');
  subtitle(s, 'Seguridad en capas');
  const rows = [
    [
      'Token firmado',
      'El rol del usuario viaja en el token: el agente sabe qué dominios puede ver.',
    ],
    ['Capa 1', 'El LLM solo recibe las tablas que el rol permite.'],
    [
      'Capa 2',
      'El código verifica el SQL generado: si usa una tabla fuera de la lista, lo bloquea.',
    ],
    ['Solo lectura', 'Si la pregunta pide modificar datos, el agente responde que no puede.'],
    ['Fail-closed', 'Sin ningún rol de datos, el pedido se corta antes de llamar al LLM.'],
  ];
  rows.forEach(([label, text], i) => {
    const y = 1.8 + i * 0.95;
    card(s, 0.6, y, 7.7, 0.82);
    chip(s, 0.8, y + 0.17, 1.9, 0.48, label, C.accent1, C.background1, 13);
    t(s, text, { x: 2.9, y, w: 5.25, h: 0.82, fontSize: 15, valign: 'middle' });
  });
  card(s, 8.6, 1.8, 4.13, 4.62, C.text2);
  t(s, '¿Por qué no alcanza con pedírselo al LLM en el prompt?', {
    x: 8.9,
    y: 2.1,
    w: 3.55,
    h: 1.4,
    fontSize: 19,
    color: C.background1,
  });
  t(s, 'El prompt es una sugerencia.', {
    x: 8.9,
    y: 3.75,
    w: 3.55,
    h: 0.9,
    fontSize: 22,
    bold: true,
    color: C.accent5,
  });
  t(s, 'El código es una garantía.', {
    x: 8.9,
    y: 4.75,
    w: 3.55,
    h: 0.9,
    fontSize: 22,
    bold: true,
    color: C.accent2,
  });
  s.addNotes(
    'Hacer la pregunta del recuadro a la audiencia antes de mostrar la respuesta. El LLM puede ignorar una instrucción; el código que revisa el SQL no.',
  );
}

// ---------- 14. Decisión 3 ----------
{
  const s = slide('CONTENT', 'Parte 2');
  title(s, 'Decisión 3: guardas y autocorrección');
  t(s, 'Guardas de intención', {
    x: 0.6,
    y: 1.65,
    w: 5.9,
    h: 0.45,
    fontSize: 20,
    bold: true,
    color: C.text2,
  });
  t(
    s,
    'Reglas simples (expresiones regulares) que comparan la pregunta con el SQL. No cuestan una llamada al LLM.',
    { x: 0.6, y: 2.15, w: 5.9, h: 0.8, fontSize: 15 },
  );
  const rows = [
    ['La pregunta dice', 'Pero el SQL…'],
    ['"menor a 60"', 'usa >='],
    ['"top 5"', 'no limita a 5 filas'],
    ['"en marzo de 2025"', 'no filtra ese mes ni ese año'],
  ];
  s.addTable(
    rows.map((r, i) =>
      r.map((v) => ({
        text: v,
        options: {
          bold: i === 0,
          color: i === 0 ? C.background1 : C.text1,
          fill: { color: i === 0 ? C.accent1 : i % 2 ? C.background2 : C.background1 },
        },
      })),
    ),
    {
      objectName: id('table'),
      x: 0.6,
      y: 3.05,
      w: 5.9,
      colW: [2.6, 3.3],
      rowH: 0.45,
      fontSize: 14,
      valign: 'middle',
      margin: [0.05, 0.12, 0.05, 0.12],
      border: { type: 'solid', pt: 0.75, color: C.accent5 },
    },
  );
  t(
    s,
    [
      { text: 'Disparan un reintento: ', options: { bold: true } },
      { text: 'una guarda que falla, un error de SQL o más de 1000 filas.' },
    ],
    { x: 0.6, y: 5.1, w: 5.9, h: 0.9, fontSize: 15 },
  );
  const boxes = [
    [1.7, 'El LLM genera el SQL', C.accent2, C.text1],
    [2.85, 'Guardas', C.background2, C.text2],
    [4.0, 'Ejecución en la base', C.background2, C.text2],
    [5.15, 'Arma la respuesta', C.accent1, C.background1],
  ];
  boxes.forEach(([y, text, fill, color]) => {
    card(s, 7.0, y, 3.5, 0.75, fill);
    t(s, text, {
      x: 7.0,
      y,
      w: 3.5,
      h: 0.75,
      fontSize: 15,
      bold: true,
      color,
      align: 'center',
      valign: 'middle',
    });
  });
  arrow(s, 8.75, 2.45, 8.75, 2.85);
  arrow(s, 8.75, 3.6, 8.75, 4.0);
  arrow(s, 8.75, 4.75, 8.75, 5.15);
  t(s, 'ok', { x: 8.85, y: 4.78, w: 0.5, h: 0.3, fontSize: 11, color: C.accent4 });
  seg(s, 10.5, 4.375, 11.0, 4.375, C.accent3, 2, false);
  seg(s, 10.5, 3.225, 11.0, 3.225, C.accent3, 2, false);
  seg(s, 11.0, 4.375, 11.0, 2.075, C.accent3, 2, false);
  arrow(s, 11.0, 2.075, 10.5, 2.075, C.accent3, 2);
  t(s, 'Si falla, el SQL y el error vuelven al LLM. Máx. 3 intentos.', {
    x: 11.15,
    y: 2.4,
    w: 1.58,
    h: 1.9,
    fontSize: 13,
    color: C.accent3,
    bold: true,
  });
  t(s, 'Si no lo logra, responde que no pudo, en vez de inventar.', {
    x: 7.0,
    y: 6.1,
    w: 5.73,
    h: 0.5,
    fontSize: 15,
    bold: true,
    color: C.text2,
  });
  s.addNotes(
    'Las guardas son baratas y deterministas: comparan lo que dice la pregunta con lo que hace el SQL. Si algo falla, el agente no se rinde ni inventa: le devuelve al LLM el SQL y el error para que lo corrija, con un tope de 3 intentos.',
  );
}

// ---------- 15. Decisión 4 ----------
{
  const s = slide('CONTENT', 'Parte 2');
  title(s, 'Decisión 4: atajos y datos materializados');
  card(s, 0.6, 1.7, 5.92, 4.85);
  t(s, 'Atajos para preguntas frecuentes', {
    x: 0.9,
    y: 1.95,
    w: 5.3,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: C.text2,
  });
  t(
    s,
    'Las preguntas frecuentes tienen un SQL validado de antemano. Si la pregunta coincide, no se le pide el SQL al LLM.',
    { x: 0.9, y: 2.6, w: 5.3, h: 1.6, fontSize: 17 },
  );
  [
    ['Más rápida', 0.9, 1.6],
    ['Más barata', 2.65, 1.6],
    ['Siempre igual', 4.4, 1.8],
  ].forEach(([text, x, w]) => chip(s, x, 4.5, w, 0.55, text, C.accent1, C.background1, 14));
  card(s, 6.81, 1.7, 5.92, 4.85);
  t(s, 'Datos materializados', {
    x: 7.11,
    y: 1.95,
    w: 5.3,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: C.text2,
  });
  const fb = (x, w, text, fill) => {
    card(s, x, 2.65, w, 0.75, fill);
    t(s, text, {
      x,
      y: 2.65,
      w,
      h: 0.75,
      fontSize: 14,
      bold: true,
      color: C.background1,
      align: 'center',
      valign: 'middle',
    });
  };
  fb(7.11, 1.2, 'ERP', C.text2);
  arrow(s, 8.36, 3.025, 8.86, 3.025);
  fb(8.91, 1.8, 'Copias locales', C.accent1);
  arrow(s, 11.21, 3.025, 10.76, 3.025);
  fb(11.26, 1.17, 'Agente', C.accent6);
  t(s, 'Un job programado copia los datos del ERP. El agente consulta solo las copias.', {
    x: 7.11,
    y: 3.6,
    w: 5.32,
    h: 0.8,
    fontSize: 15,
  });
  t(
    s,
    bullets(
      [
        'Performance estable.',
        'El agente nunca toca el ERP en vivo.',
        'Después, el mismo job genera un pronóstico de DSO con ML (XGBoost).',
      ],
      { space: 8 },
    ),
    { x: 7.11, y: 4.45, w: 5.32, h: 1.9, fontSize: 15 },
  );
  s.addNotes(
    'Si el tiempo aprieta, esta slide se puede pasar rápido. Dos ideas: lo que se repite no necesita LLM, y el agente no consulta el sistema productivo en vivo.',
  );
}

// ---------- 16. Calidad ----------
{
  const s = slide('CONTENT', 'Parte 2');
  title(s, 'Cómo se mide la calidad');
  const items = [
    [
      'Antes de publicar',
      'Preguntas golden',
      'Un set de preguntas con respuesta conocida, que se corre contra el pipeline real.',
      false,
    ],
    [
      'Antes de publicar',
      'LLM como juez',
      'Otro LLM evalúa si el SQL responde la pregunta y si el texto es fiel a los datos.',
      false,
    ],
    [
      'En producción',
      'Feedback y registro',
      'El usuario califica cada respuesta como buena o mala, y cada interacción queda registrada.',
      true,
    ],
  ];
  items.forEach(([tag, h, d, prod], i) => {
    const x = COLS3[i];
    card(s, x, 1.7, W3, 4.6);
    chip(
      s,
      x + 0.3,
      2.0,
      2.1,
      0.42,
      tag,
      prod ? C.accent2 : C.accent5,
      prod ? C.text1 : C.text2,
      12,
    );
    circle(s, x + 0.3, 2.75, 0.7, C.accent1, i + 1, 20);
    t(s, h, {
      x: x + 0.3,
      y: 3.65,
      w: W3 - 0.6,
      h: 0.55,
      fontSize: 21,
      bold: true,
      color: C.text2,
    });
    t(s, d, { x: x + 0.3, y: 4.3, w: W3 - 0.6, h: 1.8, fontSize: 16 });
  });
  s.addNotes(
    'Si el tiempo aprieta, esta slide se puede pasar rápido. Con un LLM, los tests clásicos no alcanzan: la misma pregunta puede dar respuestas distintas. Por eso se mide con preguntas golden y un LLM que juzga, y en producción con el feedback de los usuarios.',
  );
}

// ---------- 17. Cómo se construyó ----------
{
  const s = slide('CONTENT', 'Parte 2');
  title(s, 'Cómo se construyó el caso real');
  const items = [
    ['4', 'personas en el equipo', 72],
    ['1 mes', 'hasta la primera versión', 60],
    [
      'A mano + vibe coding',
      'una parte escrita a mano y otra pidiéndole código a una IA, sin una spec formal',
      30,
    ],
  ];
  items.forEach(([stat, label, size], i) => {
    const x = COLS3[i];
    card(s, x, 1.7, W3, 3.3);
    t(s, stat, {
      x: x + 0.3,
      y: 1.95,
      w: W3 - 0.6,
      h: 1.45,
      fontSize: size,
      bold: true,
      color: C.accent1,
      valign: 'bottom',
    });
    t(s, label, { x: x + 0.3, y: 3.55, w: W3 - 0.6, h: 1.3, fontSize: 17 });
  });
  t(s, 'Después, se fue refinando y se sumaron funcionalidades.', {
    x: 0.6,
    y: 5.3,
    w: 12.13,
    h: 0.5,
    fontSize: 18,
  });
  t(s, 'La pregunta de la parte 3: ¿qué cambia si se construye con spec driven?', {
    x: 0.6,
    y: 5.9,
    w: 12.13,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: C.text2,
  });
  s.addNotes(
    'Vibe coding: pedirle código a una IA sin una spec formal, probar y corregir con más prompts. Es el puente hacia la parte 3.',
  );
}

// ---------- 18. Mismo patrón ----------
{
  const s = slide('CONTENT', 'Parte 2');
  title(s, 'Mismo patrón, dos escalas');
  const flow = [
    ['Pregunta', 1.7],
    ['SQL', 1.2],
    ['Guardas', 1.6],
    ['Ejecución', 1.7],
    ['Texto, tabla y gráfico', 3.2],
  ];
  let x = 0.6;
  flow.forEach(([text, w], i) => {
    card(s, x, 1.65, w, 0.65, C.accent1, { rectRadius: 0.325 });
    t(s, text, {
      x,
      y: 1.65,
      w,
      h: 0.65,
      fontSize: 15,
      bold: true,
      color: C.background1,
      align: 'center',
      valign: 'middle',
    });
    x += w;
    if (i < flow.length - 1) {
      arrow(s, x + 0.1, 1.975, x + 0.45, 1.975);
      x += 0.55;
    }
  });
  const rows = [
    ['', 'Caso real', 'Demo UTDT'],
    ['Datos', 'SAP HANA Cloud', 'SQLite'],
    ['LLM', 'SAP Gen AI Hub', 'OpenAI'],
    ['Acceso', 'Roles + JWT por dominio', 'Una clave compartida'],
    ['UI', 'SAPUI5 / Fiori', 'Vue'],
    ['Backend', 'Python (FastAPI) + SAP CAP', 'Node.js (Fastify)'],
  ];
  s.addTable(
    rows.map((r, i) =>
      r.map((v, j) => ({
        text: v,
        options: {
          bold: i === 0 || j === 0,
          color: i === 0 ? C.background1 : j === 0 ? C.text2 : C.text1,
          fill: {
            color:
              i === 0 ? (j === 0 ? C.background1 : C.text2) : i % 2 ? C.background2 : C.background1,
          },
        },
      })),
    ),
    {
      objectName: id('table'),
      x: 0.6,
      y: 2.7,
      w: 8.1,
      colW: [1.9, 3.1, 3.1],
      rowH: 0.5,
      fontSize: 15,
      valign: 'middle',
      margin: [0.05, 0.12, 0.05, 0.12],
      border: { type: 'solid', pt: 0.75, color: C.accent5 },
    },
  );
  card(s, 9.0, 2.7, 3.73, 3.0, C.text2);
  t(s, 'Con la escala cambian la seguridad, los datos y la operación.', {
    x: 9.3,
    y: 2.7,
    w: 3.13,
    h: 3.0,
    fontSize: 21,
    bold: true,
    color: C.background1,
    valign: 'middle',
  });
  s.addNotes(
    'El patrón es el mismo en los dos: pregunta, SQL, guardas, ejecución y respuesta. La demo de la clase es la versión chica; el caso real agrega seguridad por roles, datos corporativos y deploy en la nube.',
  );
}

// ---------- 19. Divider Parte 3 ----------
divider(
  'Parte 3',
  'Cómo se construye',
  'A mano, vibe coding y spec driven',
  3,
  'Parte 3',
  'Parte 3: tres formas de construir software y el proceso spec driven, con ejemplos reales de la demo.',
);

// ---------- 20-21. Tres formas ----------
function compare(part, sub, rows, footer, notes) {
  const s = slide('CONTENT', 'Parte 3');
  title(s, `Tres formas de construir (${part})`);
  subtitle(s, sub);
  const head = [
    ['', C.background1],
    ['A mano', C.accent4],
    ['Vibe coding', C.accent6],
    ['Spec driven', C.accent1],
  ];
  const table = [
    head.map(([text, fill]) => ({
      text,
      options: { bold: true, color: C.background1, fill: { color: fill }, fontSize: 16 },
    })),
  ];
  rows.forEach((r) => {
    table.push(
      r.map((v, j) => ({
        text: v,
        options: {
          bold: j === 0,
          color: j === 0 ? C.text2 : C.text1,
          fill: { color: j === 3 ? C.background2 : C.background1 },
        },
      })),
    );
  });
  s.addTable(table, {
    objectName: id('table'),
    x: 0.6,
    y: 1.8,
    w: 12.13,
    colW: [2.33, 3.2, 3.2, 3.4],
    fontSize: 15,
    valign: 'middle',
    margin: [0.08, 0.12, 0.08, 0.12],
    border: { type: 'solid', pt: 0.75, color: C.accent5 },
  });
  t(s, footer[0], {
    x: 0.6,
    y: 5.45,
    w: 12.13,
    h: 0.5,
    fontSize: 17,
    bold: true,
    color: footer[1],
  });
  s.addNotes(notes);
}
compare(
  '1/2',
  'Cómo arranca y quién hace qué',
  [
    [
      'Punto de partida',
      'Un ticket corto. Los detalles se aclaran mientras se programa.',
      'Un prompt. El agente completa lo que falta.',
      'Una spec refinada: alcance, qué no entra, casos borde y criterios de aceptación.',
    ],
    [
      'Quién escribe el código',
      'El desarrollador',
      'El agente, a partir del prompt',
      'El agente, contra la spec',
    ],
    [
      'Qué hace el desarrollador',
      'Escribe y depura el código',
      'Pide, prueba y corrige con más prompts',
      'Especifica, decide y revisa',
    ],
    [
      'La ambigüedad',
      'Aparece tarde, en el código o en QA',
      'La resuelve el agente, suponiendo',
      'Se resuelve antes, en el refinamiento: el agente pregunta',
    ],
  ],
  ['Sin una spec, el agente completa los huecos inventando.', C.accent3],
  'No es que hacerlo a mano esté mal. Las specs, los tests y la revisión ya existían como buenas prácticas. Spec driven las vuelve obligatorias, porque sin una spec el agente completa los huecos inventando, que es justamente lo que pasa con vibe coding.',
);
compare(
  '2/2',
  'Qué queda y hasta dónde escala',
  [
    [
      'Las decisiones',
      'En la cabeza de alguien, en un chat o en un email',
      'En el historial del chat, y se pierden',
      'Escritas en el issue y versionadas con el código',
    ],
    [
      'Tests y docs',
      'Dependen de la disciplina y del tiempo que quede',
      'Hay solo si se piden',
      'Son criterios de aceptación y parte del gate',
    ],
    [
      'La revisión',
      'Un compañero, cuando puede',
      'Ver si "anda"',
      'Un agente con contexto limpio y después el humano, contra los criterios',
    ],
    [
      'El límite de velocidad',
      'Cuánto código escribe una persona',
      'Es rápido al principio y se frena cuando nadie entiende el código',
      'Cuánto especifica y revisa una persona',
    ],
  ],
  [
    'El riesgo de spec driven: una spec mal escrita se implementa mal, con total confianza.',
    C.accent4,
  ],
  'El riesgo de spec driven es que una spec mal escrita hace que el agente implemente lo equivocado con total confianza. Por eso la spec se revisa antes de escribir código.',
);

// ---------- 22. Ciclo ----------
{
  const s = slide('CONTENT', 'Parte 3');
  title(s, 'Spec driven en la práctica: el ciclo');
  const steps = [
    ['/create-issue', 'Captura el problema', 'Humano: describe'],
    ['/refine-issue', 'Preguntas, alcance y criterios', 'Humano: responde'],
    ['/work-issue', 'Plan → código → tests → PR', 'Humano: aprueba el plan'],
    ['/review-pr', 'Revisión contra los criterios', 'Humano: decide'],
  ];
  steps.forEach(([cmd, d, human], i) => {
    const x = 0.6 + i * 3.16;
    card(s, x, 1.65, 2.65, 2.9);
    circle(s, x + 0.2, 1.85, 0.5, C.accent1, i + 1, 16);
    t(s, cmd, {
      x: x + 0.2,
      y: 2.5,
      w: 2.25,
      h: 0.45,
      fontSize: 16,
      bold: true,
      fontFace: MONO,
      color: C.text2,
    });
    t(s, d, { x: x + 0.2, y: 3.0, w: 2.25, h: 0.8, fontSize: 15 });
    chip(s, x + 0.2, 3.9, 2.25, 0.45, human, C.accent2, C.text1, 12);
    if (i < steps.length - 1) arrow(s, x + 2.71, 3.1, x + 3.1, 3.1);
  });
  const info = [
    ['El issue es la spec', 'Un archivo Markdown en el repo: open → refined → closed.'],
    [
      'Reglas escritas',
      'El agente las lee siempre: nunca commitear en main, nunca subir secretos, hacer lo mínimo.',
    ],
    ['Dos modelos', 'Uno más capaz planifica (Opus) y uno más rápido implementa (Sonnet).'],
  ];
  info.forEach(([h, d], i) => {
    const x = COLS3[i];
    card(s, x, 4.85, W3, 1.65, C.background1, { line: { color: C.accent5, width: 1 } });
    t(s, h, { x: x + 0.25, y: 5.0, w: W3 - 0.5, h: 0.4, fontSize: 16, bold: true, color: C.text2 });
    t(s, d, { x: x + 0.25, y: 5.45, w: W3 - 0.5, h: 0.95, fontSize: 14 });
  });
  s.addNotes(
    'Cuatro comandos, y en cada uno el humano tiene un rol. El issue es la spec y vive en el repo, junto al código. Las reglas también están escritas: el agente las lee siempre.',
  );
}

// ---------- 23. Crear ----------
{
  const s = slide('CONTENT', 'Parte 3');
  title(s, '1. Crear el issue');
  t(s, 'Entrada', { x: 0.6, y: 1.65, w: 3, h: 0.35, fontSize: 14, bold: true, color: C.accent4 });
  card(s, 0.6, 2.1, 4.9, 1.4, C.accent1);
  t(s, 'Cuando pido dos listados separados, el bot los junta en una sola tabla.', {
    x: 0.85,
    y: 2.1,
    w: 4.4,
    h: 1.4,
    fontSize: 17,
    color: C.background1,
    valign: 'middle',
  });
  t(s, 'Una descripción corta del problema.', {
    x: 0.6,
    y: 3.6,
    w: 4.9,
    h: 0.4,
    fontSize: 13,
    italic: true,
    color: C.accent4,
  });
  arrow(s, 5.7, 2.8, 6.35, 2.8, C.accent2, 3);
  t(s, 'Salida', { x: 6.5, y: 1.65, w: 3, h: 0.35, fontSize: 14, bold: true, color: C.accent4 });
  card(s, 6.5, 2.1, 6.23, 2.55, C.text2);
  t(
    s,
    lines([
      ['issues/30-listados-separados.md', { bold: true, color: C.accent2 }],
      ['---', { color: C.accent5 }],
      ['id: 30', { color: C.background1 }],
      ['title: Devolver listados separados', { color: C.background1 }],
      ['       cuando el mensaje pide más de uno', { color: C.background1 }],
      ['type: feat', { color: C.background1 }],
      ['status: open', { bold: true, color: C.accent2 }],
      ['---', { color: C.accent5 }],
    ]),
    { x: 6.75, y: 2.25, w: 5.8, h: 2.3, fontSize: 15, fontFace: MONO },
  );
  card(s, 0.6, 5.0, 12.13, 0.95);
  t(
    s,
    [
      { text: 'Captura liviana: ', options: { bold: true, color: C.text2 } },
      {
        text: 'todavía no se diseña nada. Es el único tipo de archivo que se commitea directo en main.',
      },
    ],
    { x: 0.85, y: 5.0, w: 11.6, h: 0.95, fontSize: 17, valign: 'middle' },
  );
  s.addNotes(
    'Ejemplo real: el issue #30, el de la tercera pregunta de la demo. Se crea con una descripción corta y queda en estado open.',
  );
}

// ---------- 24. Refinar ----------
{
  const s = slide('CONTENT', 'Parte 3');
  title(s, '2. Refinar el issue: escribir la spec');
  subtitle(
    s,
    'El agente lee el código y pregunta todo lo que haga falta hasta que el issue se pueda implementar.',
  );
  t(s, 'Lo que tiene la spec', {
    x: 0.6,
    y: 1.85,
    w: 3.6,
    h: 0.4,
    fontSize: 16,
    bold: true,
    color: C.text2,
  });
  const parts = [
    ['Objetivo', false],
    ['Alcance: qué entra y qué no', true],
    ['Comportamiento esperado', false],
    ['Casos borde y errores', false],
    ['Criterios de aceptación', true],
    ['Decisiones diferidas', false],
  ];
  parts.forEach(([text, hl], i) => {
    const y = 2.35 + i * 0.68;
    card(s, 0.6, y, 3.6, 0.55, hl ? C.accent1 : C.background2);
    t(s, text, {
      x: 0.8,
      y,
      w: 3.3,
      h: 0.55,
      fontSize: 15,
      bold: hl,
      color: hl ? C.background1 : C.text2,
      valign: 'middle',
    });
  });
  card(s, 4.6, 1.85, 8.13, 4.65, C.background1, { line: { color: C.accent5, width: 1.25 } });
  t(s, 'Ejemplo: #30', {
    x: 4.9,
    y: 2.0,
    w: 3,
    h: 0.3,
    fontSize: 13,
    bold: true,
    color: C.accent4,
  });
  t(s, 'Responder con varias tablas y gráficos cuando el mensaje pide resultados separados', {
    x: 4.9,
    y: 2.35,
    w: 7.55,
    h: 0.75,
    fontSize: 17,
    bold: true,
    color: C.text2,
  });
  const b = (text) => ({
    text,
    options: { bullet: { indent: 16 }, paraSpaceAfter: 4, breakLine: true },
  });
  const h = (text, color) => ({
    text,
    options: { bold: true, color, paraSpaceAfter: 2, breakLine: true },
  });
  t(
    s,
    [
      h('Entra', C.accent1),
      b('De 1 a 5 consultas, cada una con un título.'),
      b('Cada consulta pasa por las guardas.'),
      {
        text: 'Si una falla, se regenera el set completo.',
        options: { bullet: { indent: 16 }, paraSpaceAfter: 10, breakLine: true },
      },
      h('No entra', C.accent3),
      {
        text: 'Cambios en el frontend y respuestas parciales.',
        options: { bullet: { indent: 16 }, paraSpaceAfter: 10, breakLine: true },
      },
      h('Caso borde', C.accent6),
      {
        text: '"Mostralo como gráfico de torta", después de dos secciones, repite las dos consultas.',
        options: { bullet: { indent: 16 } },
      },
    ],
    { x: 4.9, y: 3.2, w: 7.55, h: 3.15, fontSize: 15 },
  );
  s.addNotes(
    'Lo que no entra importa tanto como lo que entra, porque evita que el agente haga de más. Notar que el título cambió: refinar también es entender mejor el problema.',
  );
}

// ---------- 25. Trabajar ----------
{
  const s = slide('CONTENT', 'Parte 3');
  title(s, '3. Trabajar el issue');
  const steps = [
    [
      'Crea una rama (feat/30-listados-separados). Nunca toca main: un hook de git lo impide.',
      null,
    ],
    ['Presenta un plan y espera la aprobación del humano.', ['Humano', C.accent2, C.text1]],
    ['Implementa el código con sus tests.', null],
    [
      'Corre el quality gate: lint, tests y cobertura mínima del 85%.',
      ['Gate', C.accent1, C.background1],
    ],
    [
      'Self-review: un agente nuevo, sin el contexto del que programó, revisa el diff contra el issue y la seguridad.',
      ['Agente nuevo', C.accent6, C.background1],
    ],
    [
      'Escribe el PR dentro del issue: qué hace, qué encontró y una sección Verification por cada gate.',
      null,
    ],
    ['Mergea a main solo si todo pasó.', null],
  ];
  steps.forEach(([text, tag], i) => {
    const y = 1.6 + i * 0.72;
    card(s, 0.6, y, 12.13, 0.62);
    circle(s, 0.75, y + 0.1, 0.42, C.accent1, i + 1, 14);
    t(s, text, { x: 1.4, y, w: 9.6, h: 0.62, fontSize: 15, valign: 'middle' });
    if (tag) chip(s, 11.2, y + 0.13, 1.38, 0.36, tag[0], tag[1], tag[2], 11);
  });
  s.addNotes(
    'Los dos controles clave: el humano aprueba el plan antes de que se escriba código, y un agente nuevo revisa el diff sin estar anclado en las decisiones del que programó. Si un gate falla, no hay merge.',
  );
}

// ---------- 26. Revisar ----------
{
  const s = slide('CONTENT', 'Parte 3');
  title(s, '4. Revisar el PR');
  const flow = [
    ['Autor', 'conoce sus supuestos', C.background2, C.text2, C.text1],
    ['Diff + issue', 'lo único que pasa', C.background2, C.text2, C.text1],
    ['Revisor', 'contexto limpio', C.accent1, C.background1, C.background1],
    ['Humano', 'decide', C.accent2, C.text1, C.text1],
  ];
  flow.forEach(([h, d, fill, hc, dc], i) => {
    const x = 0.6 + i * 3.18;
    card(s, x, 1.7, 2.59, 1.1, fill);
    t(
      s,
      lines([
        [h, { bold: true, fontSize: 17, color: hc }],
        [d, { fontSize: 13, color: dc }],
      ]),
      { x: x + 0.2, y: 1.7, w: 2.19, h: 1.1, valign: 'middle', align: 'center' },
    );
    if (i < flow.length - 1) arrow(s, x + 2.65, 2.25, x + 3.12, 2.25);
  });
  card(s, 0.6, 3.2, 5.9, 2.7, C.text2);
  t(s, '¿Por qué un agente nuevo?', {
    x: 0.9,
    y: 3.45,
    w: 5.3,
    h: 0.5,
    fontSize: 20,
    bold: true,
    color: C.accent2,
  });
  t(
    s,
    'El que escribió el código tiende a confirmar su propia solución. Uno con el contexto limpio no está anclado.',
    { x: 0.9, y: 4.05, w: 5.3, h: 1.6, fontSize: 18, color: C.background1 },
  );
  t(
    s,
    bullets(
      [
        '/review-pr <n> revisa la rama contra los criterios de aceptación del issue y la Definition of Done.',
        'Es de solo lectura: no commitea ni mergea.',
        'El que decide sigue siendo el humano.',
      ],
      { space: 14 },
    ),
    { x: 6.85, y: 3.3, w: 5.88, h: 3.0, fontSize: 17 },
  );
  s.addNotes(
    'La revisión la hace un agente que solo ve el diff y el issue, no el razonamiento del que programó. Así no hereda sus supuestos. Igual, la decisión final es del humano.',
  );
}

// ---------- 27. #38 ----------
{
  const s = slide('CONTENT', 'Parte 3');
  title(s, 'Caso real: cuando el plan no alcanza (#38)');
  seg(s, 2.0, 2.0, 11.3, 2.0, C.accent5, 3, false);
  [
    [2.0, '23:26 · abierto'],
    [6.67, '23:58 · refinado'],
    [11.3, '01:37 · mergeado'],
  ].forEach(([cx, label]) => {
    circle(s, cx - 0.15, 1.85, 0.3, C.accent1);
    t(s, label, {
      x: cx - 1.2,
      y: 2.2,
      w: 2.4,
      h: 0.35,
      fontSize: 15,
      bold: true,
      color: C.text2,
      align: 'center',
    });
  });
  t(s, '32 min', {
    x: 3.6,
    y: 1.5,
    w: 1.5,
    h: 0.3,
    fontSize: 12,
    color: C.accent4,
    align: 'center',
  });
  t(s, '1 h 39 min', {
    x: 8.2,
    y: 1.5,
    w: 1.6,
    h: 0.3,
    fontSize: 12,
    color: C.accent4,
    align: 'center',
  });
  const cards = [
    ['El problema', 'El evaluador del idioma marcaba como mal respuestas que estaban bien.'],
    ['La spec', 'Pedía un umbral medible: todas las respuestas correctas, 0,5 o más.'],
    [
      'Qué pasó',
      'La solución planificada no alcanzó el umbral. El agente probó 5 variantes y lo reportó con datos.',
    ],
    [
      'La decisión',
      'El humano cambió el enfoque, y el cambio quedó escrito en el issue con el porqué.',
    ],
  ];
  cards.forEach(([h, d], i) => {
    const x = i % 2 ? 6.74 : 0.6;
    const y = i < 2 ? 2.85 : 4.4;
    card(s, x, y, 5.99, 1.4);
    t(s, h, {
      x: x + 0.25,
      y: y + 0.15,
      w: 5.5,
      h: 0.35,
      fontSize: 15,
      bold: true,
      color: C.accent1,
    });
    t(s, d, { x: x + 0.25, y: y + 0.52, w: 5.5, h: 0.8, fontSize: 15 });
  });
  card(s, 0.6, 5.95, 12.13, 0.7, C.text2);
  t(
    s,
    [
      { text: 'Lección: ', options: { bold: true, color: C.accent2 } },
      {
        text: 'con criterios medibles se ve cuándo algo no funciona, en vez de darlo por terminado.',
        options: { color: C.background1 },
      },
    ],
    { x: 0.85, y: 5.95, w: 11.6, h: 0.7, fontSize: 17, valign: 'middle' },
  );
  s.addNotes(
    'El issue #38 corregía el evaluador que mide si la respuesta está en el idioma correcto. La solución planificada no llegó al umbral que pedía la spec, y el agente no la dio por buena: probó 5 variantes, mostró los números y el humano decidió otro enfoque. Todo en poco más de 2 horas.',
  );
}

// ---------- 28. Números ----------
{
  const s = slide('CONTENT', 'Parte 3');
  title(s, 'Los números de la demo');
  const stats = [
    ['38', 'issues cerrados'],
    ['311', 'commits'],
    ['45', 'merges'],
    ['660', 'tests automáticos'],
    ['99%', 'de cobertura de statements'],
    ['2–3 h', 'por issue, de abierto a mergeado'],
  ];
  stats.forEach(([n, label], i) => {
    const x = COLS3[i % 3];
    const y = i < 3 ? 1.65 : 4.15;
    card(s, x, y, W3, 2.25);
    t(s, n, {
      x: x + 0.3,
      y: y + 0.2,
      w: W3 - 0.6,
      h: 1.1,
      fontSize: 54,
      bold: true,
      color: C.accent1,
      valign: 'middle',
    });
    t(s, label, { x: x + 0.3, y: y + 1.35, w: W3 - 0.6, h: 0.75, fontSize: 17 });
  });
  s.addNotes(
    'Datos del historial de git de la demo. Ejemplos de tiempo por issue: el #30 tardó 2 h 30 min de abierto a mergeado, y el #38, 2 h 11 min.',
  );
}

// ---------- 29. Tiempos ----------
{
  const s = slide('CONTENT', 'Parte 3');
  title(s, 'Los tiempos');
  const items = [
    [
      'Caso real',
      C.accent4,
      '1 mes',
      3.25,
      ['4 personas', 'A mano + vibe coding', 'Primera versión, después refinada'],
      false,
    ],
    [
      'Demo, a mano (estimado)',
      C.accent6,
      '≥ 2 semanas',
      1.52,
      ['1 persona', 'A mano', 'Sin la profundidad ni los tests de la versión actual'],
      false,
    ],
    [
      'Demo, spec driven',
      C.accent1,
      '6 días',
      0.65,
      ['1 persona', 'Spec driven con agentes', '38 issues, 660 tests y 99% de cobertura'],
      true,
    ],
  ];
  items.forEach(([tag, color, stat, bar, details, hl], i) => {
    const x = COLS3[i];
    card(s, x, 1.65, W3, 4.15, C.background2, hl ? { line: { color: C.accent1, width: 2.5 } } : {});
    chip(s, x + 0.3, 1.9, 2.9, 0.42, tag, color, C.background1, 12);
    t(s, stat, {
      x: x + 0.3,
      y: 2.45,
      w: W3 - 0.6,
      h: 0.95,
      fontSize: 40,
      bold: true,
      color,
      valign: 'middle',
    });
    s.addShape(S.RECTANGLE, {
      objectName: id('bar'),
      x: x + 0.3,
      y: 3.55,
      w: bar,
      h: 0.28,
      fill: { color },
      line: { type: 'none' },
    });
    t(s, lines(details.map((d, j) => [d, { bold: j === 0, paraSpaceAfter: 6 }])), {
      x: x + 0.3,
      y: 4.05,
      w: W3 - 0.6,
      h: 1.6,
      fontSize: 15,
    });
  });
  t(
    s,
    'El caso real y la demo no se comparan 1 a 1: el caso real suma SAP, seguridad por roles y deploy en la nube. Las barras son proporcionales a los días calendario.',
    { x: 0.6, y: 6.0, w: 12.13, h: 0.65, fontSize: 14, italic: true, color: C.accent4 },
  );
  s.addNotes(
    'Las 2 semanas son una estimación propia, no una medición: decirlo así. La demo con spec driven tardó 6 días calendario (del 19 al 24 de octubre de 2026) y tiene 660 tests. El caso real no es comparable 1 a 1, porque es un sistema más grande.',
  );
}

// ---------- 30. Lo que nos llevamos ----------
{
  const s = slide('DARK', 'Cierre');
  title(s, 'Lo que nos llevamos');
  const items = [
    'El valor no está solo en el LLM, sino en los datos bien descritos, las guardas y la seguridad que lo rodean.',
    'No hay que confiar en el modelo: lo que importa se verifica en código.',
    'Con spec driven, el trabajo humano pasa de escribir código a especificar, decidir y revisar.',
  ];
  items.forEach((text, i) => {
    const y = 1.8 + i * 1.55;
    circle(s, 0.6, y + 0.22, 0.8, C.accent2, i + 1, 26, C.text1);
    t(s, text, {
      x: 1.75,
      y,
      w: 10.98,
      h: 1.25,
      fontSize: 22,
      color: C.background1,
      valign: 'middle',
    });
  });
  s.addNotes('Cerrar con las tres ideas. Si queda tiempo, abrir a preguntas.');
}

// ---------- 31. Preguntas ----------
{
  const s = slide('TITLE', 'Cierre');
  s.addText('¿Preguntas?', { placeholder: 'title' });
  s.addText('Gracias', { placeholder: 'body' });
  circle(s, 8.7, 1.9, 3.6, C.accent1, '?', 150);
  s.addNotes(
    'Preguntas. La slide de respaldo cubre lo que falta para llevar el caso real a producción.',
  );
}

// ---------- 32. Respaldo ----------
{
  const s = slide('CONTENT', 'Respaldo');
  title(s, 'Respaldo: lo que todavía falta en el caso real');
  const items = [
    ['Sin CI/CD', 'Cada deploy es manual.'],
    ['Deploy con pasos manuales', 'Hay pasos que no están en los descriptores de deploy.'],
    [
      'La UI llama directo al agente',
      'Sin pasar por el middleware: no hay un punto central para registrar o limitar el tráfico.',
    ],
  ];
  items.forEach(([h, d], i) => {
    const x = COLS3[i];
    card(s, x, 1.7, W3, 3.6);
    circle(s, x + 0.3, 2.0, 0.7, C.accent3, '!', 22);
    t(s, h, { x: x + 0.3, y: 2.95, w: W3 - 0.6, h: 0.9, fontSize: 20, bold: true, color: C.text2 });
    t(s, d, { x: x + 0.3, y: 3.9, w: W3 - 0.6, h: 1.3, fontSize: 16 });
  });
  s.addNotes('Sirve si preguntan por los trade-offs de llevarlo a producción.');
}

(async () => {
  await pres.writeFile({ fileName: OUT });
  await applyTheme(OUT, THEME);
  console.log('written', OUT);
})();
