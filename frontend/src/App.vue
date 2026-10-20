<script setup lang="ts">
import { auth, loadStoredKey } from './auth.ts';
import AccessKeyForm from './components/AccessKeyForm.vue';
import BackendStatus from './components/BackendStatus.vue';

// Two screens, switched by auth state: the key screen until there's a key, then the app.
loadStoredKey();
</script>

<template>
  <main class="app">
    <h1>Text-to-SQL chatbot</h1>
    <BackendStatus v-if="auth.key" />
    <AccessKeyForm v-else />
  </main>
</template>

<style scoped lang="scss">
@use './styles/tokens' as *;

.app {
  max-width: 48rem;
  margin: 0 auto;
  padding: $space-lg;
}
</style>
