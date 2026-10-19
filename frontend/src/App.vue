<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { getHealth, type Health } from './api.ts';

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
  <main class="app">
    <h1>Text-to-SQL chatbot</h1>
    <p v-if="health" class="status status--ok">
      Backend {{ health.status }} · SQLite {{ health.sqliteVersion }}
    </p>
    <p v-else-if="error" class="status status--error">Backend unreachable: {{ error }}</p>
    <p v-else class="status">Checking backend…</p>
  </main>
</template>

<style scoped lang="scss">
@use './styles/tokens' as *;

.app {
  max-width: 48rem;
  margin: 0 auto;
  padding: $space-lg;
}

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
