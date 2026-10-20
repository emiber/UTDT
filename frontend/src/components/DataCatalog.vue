<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getCatalog, type Catalog } from '../api.ts';

// Fetched on mount even while the section is closed: it's the first protected call, so a
// wrong key is caught right after it's entered.
const catalog = ref<Catalog | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    catalog.value = await getCatalog();
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<template>
  <details class="catalog">
    <summary>Available data</summary>
    <p v-if="error" class="catalog__error">Could not load the data catalog: {{ error }}</p>
    <p v-else-if="!catalog" class="catalog__muted">Loading the data catalog…</p>
    <p v-else-if="catalog.tables.length === 0" class="catalog__muted">
      No tables are described yet.
    </p>
    <template v-else>
      <section v-for="table in catalog.tables" :key="table.name" class="catalog__table">
        <h3>
          <code>{{ table.name }}</code>
        </h3>
        <p>{{ table.description }}</p>
        <table v-if="table.columns.length">
          <thead>
            <tr>
              <th>Column</th>
              <th>Type</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="column in table.columns" :key="column.name">
              <td>
                <code>{{ column.name }}</code>
              </td>
              <td>{{ column.dataType }}</td>
              <td>{{ column.description }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="catalog__muted">No columns described.</p>
        <h4>Indexes</h4>
        <ul v-if="table.indexes.length" class="catalog__indexes">
          <li v-for="index in table.indexes" :key="index.name">
            <code>{{ index.name }}</code> ({{ index.columns.join(', ') }})
            <span v-if="index.unique">· unique</span>
          </li>
        </ul>
        <p v-else class="catalog__muted">No indexes.</p>
      </section>
      <section v-if="catalog.relationships.length" class="catalog__relationships">
        <h3>Relationships</h3>
        <ul>
          <li
            v-for="r in catalog.relationships"
            :key="`${r.fromTable}.${r.fromColumn}>${r.toTable}.${r.toColumn}`"
          >
            <code>{{ r.fromTable }}.{{ r.fromColumn }} → {{ r.toTable }}.{{ r.toColumn }}</code>
            — {{ r.description }}
          </li>
        </ul>
      </section>
    </template>
  </details>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.catalog {
  margin-top: 1rem;

  summary {
    cursor: pointer;
    font-weight: 600;
  }

  table {
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.25rem 0.75rem 0.25rem 0;
    text-align: left;
    vertical-align: top;
  }

  &__muted {
    color: $color-muted;
  }

  &__error {
    color: $color-error;
  }
}
</style>
