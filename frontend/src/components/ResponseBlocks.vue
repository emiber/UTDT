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
              <td v-for="(value, c) in row" :key="c">{{ value }}</td>
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
  &__text :deep(p) {
    margin: 0.5rem 0;
  }

  &__table {
    overflow-x: auto;

    table {
      border-collapse: collapse;
    }

    th,
    td {
      padding: 0.25rem 0.75rem;
      border-bottom: 1px solid $color-border;
      text-align: left;
    }
  }
}
</style>
