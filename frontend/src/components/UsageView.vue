<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  ApiError,
  getUsage,
  GRANULARITIES,
  LLM_STEPS,
  type Block,
  type Granularity,
  type LlmStep,
  type UsageReport,
} from '../api.ts';
import ResponseBlocks from './ResponseBlocks.vue';

/** A local day as YYYY-MM-DD, `days` before today. */
function localDay(days = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The last 7 days, by day, every model and step.
const filters = reactive({
  from: localDay(6),
  to: localDay(),
  granularity: 'day' as Granularity,
  model: '',
  step: '' as LlmStep | '',
});
const report = ref<UsageReport | null>(null);
const error = ref<string | null>(null);
// Only the latest request may show: a slow earlier one must not overwrite it.
let latest = 0;

async function load() {
  const request = ++latest;
  error.value = null;
  if (!filters.from || !filters.to || filters.from > filters.to) {
    report.value = null;
    error.value = 'Pick a period: the start date must not be after the end date.';
    return;
  }
  try {
    const result = await getUsage({
      from: filters.from,
      to: filters.to,
      granularity: filters.granularity,
      model: filters.model || undefined,
      step: filters.step || undefined,
    });
    if (request === latest) report.value = result;
  } catch (e) {
    if (request !== latest) return;
    report.value = null;
    error.value =
      e instanceof ApiError && e.status === 400
        ? 'The period was not accepted: shorten it or pick a coarser granularity.'
        : `Could not load the usage report: ${(e as Error).message}`;
  }
}
watch(filters, load, { immediate: true });

const number = (n: number) => n.toLocaleString('en-US');
const usd = (cost: number | null) => {
  if (cost === null) return '—';
  // A tiny priced cost must not read as zero.
  if (cost > 0 && cost < 0.0001) return '<$0.0001';
  return `$${cost.toFixed(cost < 0.01 ? 4 : 2)}`;
};
const time = (ms: number | null) =>
  ms === null ? '—' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
/** Table cells keep costs as numbers, so they line up right; 6 decimals is under a cent. */
const costCell = (cost: number | null) => (cost === null ? null : Math.round(cost * 1e6) / 1e6);

const cards = computed(() => {
  const t = report.value?.totals;
  if (!t) return [];
  return [
    ['Calls', number(t.calls)],
    ['Turns', number(t.turns)],
    ['Input tokens', number(t.inputTokens)],
    ['Output tokens', number(t.outputTokens)],
    ['Est. cost', usd(t.costUsd)],
    ['Avg time per call', time(t.avgMs)],
    ['Max time per call', time(t.maxMs)],
    ['Failed calls', number(t.failedCalls)],
    ['SQL retries', number(t.sqlRetries)],
  ];
});

const steps = computed(() => (filters.step ? [filters.step] : [...LLM_STEPS]));

const chart = computed<Block[]>(() => {
  const series = report.value?.series ?? [];
  return [
    {
      type: 'chart',
      chartType: 'bar',
      title: `Tokens per ${filters.granularity}, by step`,
      labels: series.map((b) => b.bucket),
      datasets: steps.value.map((step) => ({
        label: step,
        data: series.map((b) => b.tokensByStep[step]),
      })),
    },
  ];
});

const COST = 'Est. cost (USD)';

const seriesTable = computed<Block[]>(() => [
  {
    type: 'table',
    columns: ['Period', 'Calls', 'Turns', 'Input tokens', 'Output tokens', COST],
    rows: (report.value?.series ?? []).map((b) => [
      b.bucket,
      b.calls,
      b.turns,
      b.inputTokens,
      b.outputTokens,
      costCell(b.costUsd),
    ]),
  },
]);

const breakdownTable = computed<Block[]>(() => [
  {
    type: 'table',
    columns: [
      'Step',
      'Model',
      'Calls',
      'Input tokens',
      'Output tokens',
      COST,
      'Avg ms',
      'Max ms',
      'Failed',
    ],
    rows: (report.value?.breakdown ?? []).map((r) => [
      r.step,
      r.model,
      r.calls,
      r.inputTokens,
      r.outputTokens,
      costCell(r.costUsd),
      r.avgMs,
      r.maxMs,
      r.failedCalls,
    ]),
  },
]);

const turnsTable = computed<Block[]>(() => [
  {
    type: 'table',
    columns: [
      'Turn',
      'When',
      'Question',
      'Calls',
      'Input tokens',
      'Output tokens',
      COST,
      'Time (ms)',
    ],
    rows: (report.value?.topTurns ?? []).map((t) => [
      t.turnId,
      new Date(t.createdAt).toLocaleString('en-US'),
      t.question,
      t.calls,
      t.inputTokens,
      t.outputTokens,
      costCell(t.costUsd),
      t.durationMs,
    ]),
  },
]);
</script>

<template>
  <div class="usage">
    <div class="usage__content">
      <h2 class="usage__title">LLM usage</h2>
      <form class="usage__filters" @submit.prevent>
        <label>
          From
          <input v-model="filters.from" type="date" name="from" />
        </label>
        <label>
          To
          <input v-model="filters.to" type="date" name="to" />
        </label>
        <label>
          By
          <select v-model="filters.granularity" name="granularity">
            <option v-for="g in GRANULARITIES" :key="g" :value="g">{{ g }}</option>
          </select>
        </label>
        <label>
          Model
          <select v-model="filters.model" name="model">
            <option value="">All models</option>
            <option v-for="m in report?.models ?? []" :key="m" :value="m">{{ m }}</option>
          </select>
        </label>
        <label>
          Step
          <select v-model="filters.step" name="step">
            <option value="">All steps</option>
            <option v-for="s in LLM_STEPS" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
      </form>

      <p v-if="error" class="usage__error" role="alert">{{ error }}</p>
      <p v-else-if="!report" class="usage__muted" role="status">Loading the usage report…</p>
      <template v-else>
        <p v-if="report.unpricedModels.length" class="usage__notice">
          No price for {{ report.unpricedModels.join(', ') }}: their calls add no cost. Add them to
          <code>OPENAI_PRICES</code> in <code>.env</code> to estimate it.
        </p>
        <ul class="usage__cards">
          <li v-for="[label, value] in cards" :key="label" class="usage__card">
            <span class="usage__card-label">{{ label }}</span>
            <strong class="usage__card-value">{{ value }}</strong>
          </li>
        </ul>
        <p v-if="report.totals.calls === 0" class="usage__muted">No LLM calls in this period.</p>
        <template v-else>
          <section class="usage__section">
            <ResponseBlocks :blocks="chart" />
          </section>
          <section class="usage__section">
            <h3>Per {{ filters.granularity }}</h3>
            <ResponseBlocks :blocks="seriesTable" />
          </section>
          <section class="usage__section">
            <h3>By step and model</h3>
            <ResponseBlocks :blocks="breakdownTable" />
          </section>
          <section class="usage__section">
            <h3>Turns with the most tokens</h3>
            <ResponseBlocks :blocks="turnsTable" />
          </section>
        </template>
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

// Fills the space under the header and scrolls on its own, like the chat thread.
.usage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;

  &__content {
    max-width: $content-width + 8rem;
    margin: 0 auto;
    padding: $space-lg 1.5rem;
  }

  &__title {
    margin: 0 0 $space-md;
    font-size: 1.4rem;
  }

  &__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: $space-md;
    padding: 0.75rem $space-md;
    border: 1px solid $color-border;
    border-radius: $radius-md;
    background: $color-surface;
    box-shadow: $shadow-sm;

    label {
      display: flex;
      flex-direction: column;
      gap: $space-xs;
      font-size: 0.8rem;
      font-weight: 600;
      color: $color-muted;
    }

    input,
    select {
      padding: 0.35rem 0.5rem;
      border: 1px solid $color-border;
      border-radius: $radius-sm;
      background: $color-surface;
      font: inherit;
      font-size: 0.9rem;
      font-weight: 400;
      color: $color-text;
    }
  }

  &__cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
    gap: 0.75rem;
    margin: 0 0 $space-lg;
    padding: 0;
    list-style: none;
  }

  &__card {
    display: flex;
    flex-direction: column;
    gap: $space-xs;
    padding: 0.75rem $space-md;
    border: 1px solid $color-border;
    border-radius: $radius-md;
    background: $color-surface;
    box-shadow: $shadow-sm;
  }

  &__card-label {
    font-size: 0.8rem;
    color: $color-muted;
  }

  &__card-value {
    font-size: 1.25rem;
  }

  &__section {
    margin-bottom: $space-lg;
    padding: $space-md;
    border: 1px solid $color-border;
    border-radius: $radius-md;
    background: $color-surface;
    box-shadow: $shadow-sm;

    h3 {
      margin: 0 0 0.75rem;
      font-size: 1rem;
    }
  }

  &__notice {
    margin: 0 0 $space-md;
    padding: 0.6rem $space-md;
    border-radius: $radius-sm;
    background: $color-primary-soft;
    font-size: 0.9rem;
  }

  &__muted {
    color: $color-muted;
  }

  &__error {
    padding: 0.6rem $space-md;
    border-radius: $radius-sm;
    background: $color-error-soft;
    color: $color-error;
  }
}
</style>
