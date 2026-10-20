<script setup lang="ts">
import { micromark } from 'micromark';
import type { Block } from '../api.ts';

defineProps<{ blocks: Block[] }>();

// micromark escapes raw HTML and drops dangerous link protocols by default, so the LLM's
// markdown (which may echo user text) can't inject markup.
const toHtml = (markdown: string) => micromark(markdown);
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
