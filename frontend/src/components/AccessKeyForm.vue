<script setup lang="ts">
import { computed, ref } from 'vue';
import { auth, saveKey } from '../auth.ts';

const key = ref('');
const isBlank = computed(() => key.value.trim() === '');

function submit() {
  saveKey(key.value);
}
</script>

<template>
  <form class="access-key" @submit.prevent="submit">
    <p v-if="auth.rejected" class="access-key__error" role="alert">
      Access key rejected. Enter it again.
    </p>
    <label for="access-key">Access key</label>
    <input id="access-key" v-model="key" type="password" autocomplete="current-password" />
    <button type="submit" :disabled="isBlank">Enter</button>
  </form>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.access-key {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 20rem;

  &__error {
    margin: 0;
    color: $color-error;
  }
}
</style>
