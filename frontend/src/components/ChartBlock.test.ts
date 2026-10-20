import { mount } from '@vue/test-utils';
import { registry } from 'chart.js';
import { describe, expect, it, vi } from 'vitest';
import type { ChartBlock as ChartBlockData } from '../api.ts';
import ChartBlock from './ChartBlock.vue';

// jsdom has no canvas: each vue-chartjs chart becomes a stub that keeps its props.
vi.mock('vue-chartjs', async () => {
  const { defineComponent, h } = await import('vue');
  const stub = (name: string) =>
    defineComponent({
      name,
      props: { data: { type: Object, required: true }, options: { type: Object, required: true } },
      setup: () => () => h('canvas', { 'data-chart': name }),
    });
  return { Bar: stub('Bar'), Line: stub('Line'), Pie: stub('Pie'), Doughnut: stub('Doughnut') };
});

const block = (chartType: ChartBlockData['chartType']): ChartBlockData => ({
  type: 'chart',
  chartType,
  title: 'Sales by month',
  labels: ['2024-01', '2024-02'],
  datasets: [{ label: 'total', data: [1200.5, null] }],
});

describe('ChartBlock', () => {
  it.each([
    ['bar', 'Bar'],
    ['line', 'Line'],
    ['pie', 'Pie'],
    ['doughnut', 'Doughnut'],
  ] as const)('draws a %s chart with its labels, datasets and title', (chartType, name) => {
    const wrapper = mount(ChartBlock, { props: { block: block(chartType) } });

    const chart = wrapper.findComponent({ name });
    expect(chart.exists()).toBe(true);
    expect(chart.props('data')).toEqual({
      labels: ['2024-01', '2024-02'],
      datasets: [{ label: 'total', data: [1200.5, null] }],
    });
    expect(chart.props('options')).toMatchObject({
      plugins: { title: { display: true, text: 'Sales by month' } },
    });
    expect(chart.attributes('aria-label')).toBe('Sales by month');
  });

  it("registers Chart.js's Colors plugin, which gives the default palette", () => {
    mount(ChartBlock, { props: { block: block('bar') } });

    expect(registry.plugins.get('colors')).toBeDefined();
  });

  it('keeps pie and doughnut charts narrower', () => {
    const pie = mount(ChartBlock, { props: { block: block('pie') } });
    const bar = mount(ChartBlock, { props: { block: block('bar') } });

    expect(pie.classes()).toContain('chart--round');
    expect(bar.classes()).not.toContain('chart--round');
  });
});
