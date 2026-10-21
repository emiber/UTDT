// Chart blocks: the LLM only names columns (the spec); the backend checks those names
// against the real result and takes every number from its rows, so a chart can't invent
// data.

export const CHART_TYPES = ['bar', 'line', 'pie', 'doughnut'] as const;

/** How the LLM wants the result charted. */
export interface ChartSpec {
  type: (typeof CHART_TYPES)[number];
  /** Column for the labels. */
  x: string;
  /** Columns for the datasets, in order. */
  series: string[];
  title: string;
}

/** Chart.js-ready data; the frontend adds colors and styles. */
export interface ChartBlock {
  type: 'chart';
  chartType: ChartSpec['type'];
  title: string;
  labels: string[];
  datasets: { label: string; data: (number | null)[] }[];
}

export type ChartResult = { ok: true; block: ChartBlock } | { ok: false; reason: string };

/**
 * Builds the chart block for a spec over a query result, or says why the spec doesn't fit
 * it. Rows keep their SQL order: nothing is grouped, sorted or cut.
 */
export function buildChart(spec: ChartSpec, columns: string[], rows: unknown[][]): ChartResult {
  // The spec comes from the LLM: check its shape before trusting the types.
  if (!isChartSpec(spec)) return fail('the chart spec is malformed');
  if (!rows.length) return fail('the result has no rows');
  if (!spec.series.length) return fail('the chart has no series');
  if ((spec.type === 'pie' || spec.type === 'doughnut') && spec.series.length !== 1) {
    return fail(`a ${spec.type} chart takes exactly one series`);
  }

  const xIndex = columnIndex(columns, spec.x);
  if (typeof xIndex === 'string') return fail(xIndex);

  const datasets: ChartBlock['datasets'] = [];
  for (const name of spec.series) {
    if (name === spec.x) return fail(`series "${name}" is the x column`);
    const index = columnIndex(columns, name);
    if (typeof index === 'string') return fail(index);
    const data = rows.map((row) => row[index]);
    if (!data.every((value) => typeof value === 'number' || value === null)) {
      return fail(`series "${name}" has a value that is not a number`);
    }
    datasets.push({ label: name, data: data as (number | null)[] });
  }

  return {
    ok: true,
    block: {
      type: 'chart',
      chartType: spec.type,
      title: spec.title,
      labels: rows.map((row) => String(row[xIndex] ?? '')),
      datasets,
    },
  };
}

function isChartSpec(value: unknown): value is ChartSpec {
  const spec = value as Partial<ChartSpec> | null;
  return (
    typeof spec === 'object' &&
    spec !== null &&
    CHART_TYPES.includes(spec.type as ChartSpec['type']) &&
    typeof spec.x === 'string' &&
    typeof spec.title === 'string' &&
    Array.isArray(spec.series) &&
    spec.series.every((name) => typeof name === 'string')
  );
}

/** The index of the one column with this name, or why there isn't exactly one. */
function columnIndex(columns: string[], name: string): number | string {
  const matches = columns.filter((column) => column === name).length;
  if (matches === 0) return `column "${name}" is not in the result`;
  if (matches > 1) return `column "${name}" appears more than once in the result`;
  return columns.indexOf(name);
}

function fail(reason: string): ChartResult {
  return { ok: false, reason };
}
