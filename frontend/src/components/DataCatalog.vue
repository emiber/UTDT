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
  <!-- A native <details>: the header button opens a panel with its own scroll. -->
  <details class="catalog">
    <summary class="catalog__toggle">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <ellipse cx="12" cy="5.5" rx="7.5" ry="3" />
        <path d="M4.5 5.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
        <path d="M4.5 11.5v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
      </svg>
      Available data
    </summary>
    <div class="catalog__panel">
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
          <p class="catalog__description">{{ table.description }}</p>
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
                <td class="catalog__type">{{ column.dataType }}</td>
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
    </div>
  </details>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.catalog {
  position: relative;

  &__toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.85rem;
    border: 1px solid $color-border;
    border-radius: $radius-pill;
    background: $color-surface;
    box-shadow: $shadow-sm;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    list-style: none;
    user-select: none;
    transition:
      border-color 0.15s,
      color 0.15s;

    &::-webkit-details-marker {
      display: none;
    }

    &:hover {
      border-color: $color-primary;
      color: $color-primary;
    }

    svg {
      width: 1rem;
      height: 1rem;
      fill: none;
      stroke: currentcolor;
      stroke-width: 1.8;
    }
  }

  &[open] &__toggle {
    border-color: $color-primary;
    color: $color-primary;
    background: $color-primary-soft;
  }

  // A dropdown under the button, with its own scroll for long catalogs.
  &__panel {
    position: absolute;
    top: calc(100% + 0.5rem);
    right: 0;
    width: min(38rem, 92vw);
    max-height: 70vh;
    overflow-y: auto;
    padding: 0.5rem 1.25rem 1rem;
    background: $color-surface;
    border: 1px solid $color-border;
    border-radius: $radius-md;
    box-shadow: $shadow-lg;
    font-size: 0.875rem;
  }

  &__table {
    padding: 0.75rem 0;
    border-bottom: 1px solid $color-border;

    h3 {
      margin: 0.25rem 0;
      font-size: 0.95rem;
    }

    h4 {
      margin: 0.75rem 0 0.25rem;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: $color-muted;
    }
  }

  &__description {
    margin: 0 0 0.5rem;
    color: $color-muted;
  }

  &__indexes,
  &__relationships ul {
    margin: 0;
    padding-left: 1.1rem;
  }

  &__relationships h3 {
    font-size: 0.95rem;
  }

  &__type {
    color: $color-primary;
    font-family: $font-mono;
    font-size: 0.8rem;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.35rem 0.75rem 0.35rem 0;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid $color-surface-alt;
  }

  th {
    font-size: 0.75rem;
    font-weight: 600;
    color: $color-muted;
  }

  &__muted {
    color: $color-muted;
  }

  &__error {
    color: $color-error;
  }
}
</style>
