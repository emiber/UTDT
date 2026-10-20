<script setup lang="ts">
import { micromark } from 'micromark';
import type { Block } from '../api.ts';
import ChartBlock from './ChartBlock.vue';

defineProps<{ blocks: Block[] }>();

// micromark escapes raw HTML and drops dangerous link protocols (`javascript:`) by default,
// so the LLM's markdown, which may echo user or dataset text, can't inject markup. Images
// are turned off too: `![x](url)` renders as a plain link, so no remote URL loads by itself.
const OPTIONS = { extensions: [{ disable: { null: ['labelStartImage'] } }] };
// Links open in a new tab: the thread lives only in memory, so leaving the page loses it.
// Safe as a text replace: a literal "<a href=" in the content is already escaped.
const toHtml = (markdown: string) =>
  micromark(markdown, OPTIONS).replaceAll(
    '<a href=',
    '<a target="_blank" rel="noopener noreferrer" href=',
  );
</script>

<template>
  <div class="blocks">
    <template v-for="(block, i) in blocks" :key="i">
      <!-- eslint-disable-next-line vue/no-v-html -- micromark output: raw HTML is escaped. -->
      <div v-if="block.type === 'text'" class="blocks__text" v-html="toHtml(block.markdown)" />
      <div v-else-if="block.type === 'table'" class="blocks__table">
        <table>
          <thead>
            <tr>
              <!-- Columns may repeat, so cells go by position, never by name. -->
              <th v-for="(column, c) in block.columns" :key="c">{{ column }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, r) in block.rows" :key="r">
              <td v-for="(value, c) in row" :key="c" :class="{ num: typeof value === 'number' }">
                {{ value }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <ChartBlock v-else-if="block.type === 'chart'" :block="block" />
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.blocks {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;

  &__text {
    line-height: 1.65;

    :deep(p),
    :deep(ul),
    :deep(ol) {
      margin: 0.35rem 0;
    }

    :deep(ul),
    :deep(ol) {
      padding-left: 1.25rem;
    }

    :deep(strong) {
      color: $color-primary-dark;
      font-weight: 650;
    }

    :deep(a) {
      color: $color-primary;
    }
  }

  // A rounded table as wide as its content; wide results scroll sideways, long ones down.
  &__table {
    align-self: flex-start;
    max-width: 100%;
    max-height: 33rem;
    overflow: auto;
    border: 1px solid $color-border;
    border-radius: $radius-md;

    table {
      min-width: 16rem;
      border-collapse: collapse;
      font-size: 0.875rem;
    }

    th,
    td {
      padding: 0.5rem 1.25rem 0.5rem 0.85rem;
      text-align: left;
      white-space: nowrap;
    }

    th {
      position: sticky;
      top: 0;
      background: $color-surface-alt;
      border-bottom: 1px solid $color-border;
      color: $color-muted;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    td {
      border-bottom: 1px solid $color-surface-alt;
    }

    tbody tr:last-child td {
      border-bottom: 0;
    }

    tbody tr:hover td {
      background: $color-primary-soft;
    }

    .num {
      text-align: right;
      font-variant-numeric: tabular-nums;
    }
  }
}
</style>
