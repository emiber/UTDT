import { describe, expect, it } from 'vitest';
import { buildChart, type ChartSpec } from './chart.ts';

const COLUMNS = ['month', 'sales', 'cost', 'region'];
const ROWS = [
  ['2024-01', 120.5, 80, 'North'],
  ['2024-02', null, 90, 'South'],
  ['2024-02', 200, 95, 'North'],
];

const spec = (overrides: Partial<ChartSpec> = {}): ChartSpec => ({
  type: 'line',
  x: 'month',
  series: ['sales', 'cost'],
  title: 'Sales by month',
  ...overrides,
});

describe('buildChart', () => {
  it('takes labels and one dataset per series from the real rows, in row order', () => {
    expect(buildChart(spec(), COLUMNS, ROWS)).toEqual({
      ok: true,
      block: {
        type: 'chart',
        chartType: 'line',
        title: 'Sales by month',
        // Repeated x values stay separate points: nothing is grouped or sorted.
        labels: ['2024-01', '2024-02', '2024-02'],
        datasets: [
          { label: 'sales', data: [120.5, null, 200] },
          { label: 'cost', data: [80, 90, 95] },
        ],
      },
    });
  });

  it.each([['pie'], ['doughnut']] as const)('accepts a %s with one series', (type) => {
    const result = buildChart(spec({ type, x: 'region', series: ['cost'] }), COLUMNS, ROWS);

    expect(result).toMatchObject({ ok: true, block: { chartType: type } });
  });

  it('builds a chart over a single row', () => {
    const result = buildChart(spec({ type: 'bar' }), COLUMNS, [ROWS[0]]);

    expect(result).toMatchObject({ ok: true, block: { labels: ['2024-01'] } });
  });

  it('turns x values into text, and a null x into an empty label', () => {
    const result = buildChart(
      spec({ x: 'n', series: ['v'] }),
      ['n', 'v'],
      [
        [1, 10],
        [null, 20],
      ],
    );

    expect(result.ok && result.block.labels).toEqual(['1', '']);
  });

  it.each([
    ['an empty result', spec(), COLUMNS, [], 'the result has no rows'],
    ['an unknown x', spec({ x: 'day' }), COLUMNS, ROWS, 'column "day" is not in the result'],
    [
      'an x repeated in the result',
      spec({ x: 'id', series: ['sales'] }),
      ['id', 'id', 'sales'],
      [[1, 2, 3]],
      'column "id" appears more than once in the result',
    ],
    ['no series', spec({ series: [] }), COLUMNS, ROWS, 'the chart has no series'],
    [
      'an unknown series',
      spec({ series: ['profit'] }),
      COLUMNS,
      ROWS,
      'column "profit" is not in the result',
    ],
    [
      'a series that is the x column',
      spec({ series: ['month'] }),
      COLUMNS,
      ROWS,
      'series "month" is the x column',
    ],
    [
      'a text in a series',
      spec({ series: ['region'] }),
      COLUMNS,
      ROWS,
      'series "region" has a value that is not a number',
    ],
    [
      'a numeric-looking text in a series',
      spec({ x: 'm', series: ['v'] }),
      ['m', 'v'],
      [['a', '12']],
      'series "v" has a value that is not a number',
    ],
    [
      'a pie with two series',
      spec({ type: 'pie' }),
      COLUMNS,
      ROWS,
      'a pie chart takes exactly one series',
    ],
    [
      'a doughnut with two series',
      spec({ type: 'doughnut' }),
      COLUMNS,
      ROWS,
      'a doughnut chart takes exactly one series',
    ],
    [
      'an unknown chart type',
      spec({ type: 'scatter' as ChartSpec['type'] }),
      COLUMNS,
      ROWS,
      'the chart spec is malformed',
    ],
    [
      'a spec without series',
      { type: 'bar', x: 'month', title: 'x' } as unknown as ChartSpec,
      COLUMNS,
      ROWS,
      'the chart spec is malformed',
    ],
  ])('rejects %s, saying why', (_case, chartSpec, columns, rows, reason) => {
    expect(buildChart(chartSpec, columns, rows as unknown[][])).toEqual({ ok: false, reason });
  });
});
