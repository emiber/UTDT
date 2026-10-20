<script setup lang="ts">
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Colors,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';
import { computed } from 'vue';
import { Bar, Doughnut, Line, Pie } from 'vue-chartjs';
import type { ChartBlock } from '../api.ts';

// Only what the four chart types need. Colors applies Chart.js's default palette, since the
// backend sends no colors.
ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Colors,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
);
// Same type as the rest of the UI.
ChartJS.defaults.font.family = "'Inter Variable', system-ui, sans-serif";
ChartJS.defaults.color = '#6b7385';

const COMPONENTS = { bar: Bar, line: Line, pie: Pie, doughnut: Doughnut };

const props = defineProps<{ block: ChartBlock }>();

// The block is drawn as it comes: the backend already checked it against the rows.
const data = computed(() => ({ labels: props.block.labels, datasets: props.block.datasets }));
const options = computed(() => ({
  responsive: true,
  plugins: {
    title: {
      display: true,
      text: props.block.title,
      color: '#1e2433',
      font: { size: 14, weight: 600 as const },
    },
  },
}));
const round = computed(
  () => props.block.chartType === 'pie' || props.block.chartType === 'doughnut',
);
</script>

<template>
  <div class="chart" :class="{ 'chart--round': round }">
    <component
      :is="COMPONENTS[block.chartType]"
      :data="data"
      :options="options"
      :aria-label="block.title"
    />
  </div>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.chart {
  max-width: 42rem;
  padding: 0.75rem 1rem 1rem;
  border: 1px solid $color-border;
  border-radius: $radius-md;
  background: $color-surface-alt;

  &--round {
    max-width: 26rem;
  }
}
</style>
