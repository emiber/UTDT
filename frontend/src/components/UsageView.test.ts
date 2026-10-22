import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UsageReport } from '../api.ts';
import { loadStoredKey, saveKey } from '../auth.ts';
import UsageView from './UsageView.vue';

// jsdom has no canvas: the charts render as plain stubs.
vi.mock('vue-chartjs', async () => {
  const { defineComponent, h } = await import('vue');
  const stub = defineComponent({ setup: () => () => h('canvas') });
  return { Bar: stub, Line: stub, Pie: stub, Doughnut: stub };
});

enableAutoUnmount(afterEach);

const REPORT: UsageReport = {
  models: ['gpt-a', 'gpt-dec'],
  unpricedModels: ['gpt-dec'],
  totals: {
    calls: 8,
    turns: 3,
    inputTokens: 1850,
    outputTokens: 210,
    costUsd: 0.0038,
    avgMs: 4369,
    maxMs: 30000,
    failedCalls: 1,
    sqlRetries: 1,
  },
  series: [
    {
      bucket: '2026-10-20',
      calls: 6,
      turns: 2,
      inputTokens: 1500,
      outputTokens: 160,
      costUsd: 0.0029,
      tokensByStep: { classify: 100, sql: 860, answer: 700 },
    },
    {
      bucket: '2026-10-21',
      calls: 2,
      turns: 1,
      inputTokens: 350,
      outputTokens: 50,
      costUsd: 0.0008,
      tokensByStep: { classify: 50, sql: 0, answer: 350 },
    },
  ],
  breakdown: [
    {
      step: 'classify',
      model: 'gpt-dec',
      calls: 3,
      inputTokens: 150,
      outputTokens: 0,
      costUsd: null,
      avgMs: 250,
      maxMs: 300,
      failedCalls: 0,
    },
  ],
  topTurns: [
    {
      turnId: 7,
      createdAt: '2026-10-20T02:30:00.000Z',
      question: 'Sales per month?',
      calls: 3,
      inputTokens: 1050,
      outputTokens: 130,
      costUsd: 0.0023,
      durationMs: 2700,
    },
  ],
};

function stubUsage(...replies: (Response | Promise<Response>)[]) {
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const reply = replies.length > 1 ? replies.shift() : replies[0];
    if (!reply) throw new Error('Unexpected request');
    return reply instanceof Promise ? reply : reply.clone();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const params = (fetchMock: ReturnType<typeof stubUsage>, call = 0) =>
  Object.fromEntries(new URL(String(fetchMock.mock.calls[call][0]), 'http://x').searchParams);

beforeEach(() => {
  // 10:00 local time on Wednesday 2026-10-21.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 21, 10, 0));
  sessionStorage.clear();
  loadStoredKey();
  saveKey('the-key');
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('UsageView', () => {
  it('asks for the last 7 days by day, in the browser time zone', async () => {
    const fetchMock = stubUsage(Response.json(REPORT));

    mount(UsageView);
    await flushPromises();

    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^\/api\/usage\?/);
    expect(params(fetchMock)).toEqual({
      from: '2026-10-15',
      to: '2026-10-21',
      granularity: 'day',
      tz: String(-new Date().getTimezoneOffset()),
    });
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer the-key',
    );
  });

  it('shows the totals, the models without a price, the chart and the tables', async () => {
    stubUsage(Response.json(REPORT));

    const wrapper = mount(UsageView);
    await flushPromises();

    const cards = wrapper.findAll('.usage__card').map((c) => c.text());
    expect(cards).toEqual([
      'Calls8',
      'Turns3',
      'Input tokens1,850',
      'Output tokens210',
      'Est. cost$0.0038',
      'Avg time per call4.4 s',
      'Max time per call30.0 s',
      'Failed calls1',
      'SQL retries1',
    ]);
    expect(wrapper.find('.usage__notice').text()).toContain('No price for gpt-dec');
    expect(wrapper.find('.chart canvas').exists()).toBe(true);
    const tables = wrapper.findAll('table');
    expect(tables).toHaveLength(3);
    expect(tables[0].findAll('tbody tr')).toHaveLength(2);
    expect(tables[1].find('tbody tr').text()).toContain('gpt-dec');
    expect(tables[2].find('tbody tr').text()).toContain('Sales per month?');
    expect(wrapper.findAll('select[name="model"] option').map((o) => o.text())).toEqual([
      'All models',
      'gpt-a',
      'gpt-dec',
    ]);
  });

  it('asks again when a filter changes', async () => {
    const fetchMock = stubUsage(Response.json(REPORT));
    const wrapper = mount(UsageView);
    await flushPromises();

    await wrapper.find('select[name="model"]').setValue('gpt-a');
    await flushPromises();
    await wrapper.find('select[name="step"]').setValue('sql');
    await flushPromises();
    await wrapper.find('select[name="granularity"]').setValue('hour');
    await flushPromises();
    await wrapper.find('input[name="from"]').setValue('2026-10-20');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(params(fetchMock, 4)).toMatchObject({
      from: '2026-10-20',
      granularity: 'hour',
      model: 'gpt-a',
      step: 'sql',
    });
  });

  it('asks for nothing while the period ends before it starts', async () => {
    const fetchMock = stubUsage(Response.json(REPORT));
    const wrapper = mount(UsageView);
    await flushPromises();

    await wrapper.find('input[name="to"]').setValue('2026-10-10');
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[role="alert"]').text()).toContain('the start date must not be after');
  });

  it.each([
    [400, 'The period was not accepted'],
    [500, 'Could not load the usage report: HTTP 500'],
  ])('explains a %s', async (status, message) => {
    stubUsage(new Response(null, { status }));

    const wrapper = mount(UsageView);
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toContain(message);
  });

  it('shows a tiny cost as under a hundredth of a cent, not as zero', async () => {
    stubUsage(Response.json({ ...REPORT, totals: { ...REPORT.totals, costUsd: 0.00002 } }));

    const wrapper = mount(UsageView);
    await flushPromises();

    expect(wrapper.findAll('.usage__card')[4].text()).toBe('Est. cost<$0.0001');
  });

  it('says so when the period has no calls', async () => {
    const empty = { ...REPORT, totals: { ...REPORT.totals, calls: 0 }, unpricedModels: [] };
    stubUsage(Response.json(empty));

    const wrapper = mount(UsageView);
    await flushPromises();

    expect(wrapper.text()).toContain('No LLM calls in this period.');
    expect(wrapper.find('table').exists()).toBe(false);
  });

  it('shows the latest report when an earlier request answers late', async () => {
    let answerFirst!: (res: Response) => void;
    const first = new Promise<Response>((resolve) => (answerFirst = resolve));
    const latest = { ...REPORT, models: ['latest-model'] };
    stubUsage(first, Response.json(latest));
    const wrapper = mount(UsageView);

    await wrapper.find('select[name="granularity"]').setValue('week');
    await flushPromises();
    answerFirst(Response.json(REPORT));
    await flushPromises();

    expect(wrapper.findAll('select[name="model"] option').map((o) => o.text())).toContain(
      'latest-model',
    );
  });
});
