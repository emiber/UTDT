<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getHealth, type Health } from '../api.ts';

const health = ref<Health | null>(null);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    health.value = await getHealth();
  } catch (e) {
    error.value = (e as Error).message;
  }
});
</script>

<template>
  <p v-if="health" class="status status--ok">
    Backend {{ health.status }} · SQLite {{ health.sqliteVersion }}
  </p>
  <p v-else-if="error" class="status status--error">Backend unreachable: {{ error }}</p>
  <p v-else class="status">Checking backend…</p>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

// A small pill with a colored dot.
.status {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0;
  padding: 0.3rem 0.75rem;
  border-radius: $radius-pill;
  background: $color-surface-alt;
  border: 1px solid $color-border;
  color: $color-muted;
  font-size: 0.78rem;
  white-space: nowrap;

  &::before {
    content: '';
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
    background: currentcolor;
  }

  &--ok {
    color: $color-ok;
    background: $color-ok-soft;
    border-color: transparent;
  }

  &--error {
    color: $color-error;
    background: $color-error-soft;
    border-color: transparent;
  }
}
</style>
