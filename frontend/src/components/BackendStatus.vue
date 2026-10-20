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

.status {
  color: $color-muted;

  &--ok {
    color: $color-ok;
  }

  &--error {
    color: $color-error;
  }
}
</style>
