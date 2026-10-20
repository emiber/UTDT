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
    <!-- "off": the key lives only in this tab's sessionStorage, not in a password manager. -->
    <input
      id="access-key"
      v-model="key"
      type="password"
      autocomplete="off"
      placeholder="Paste your access key"
    />
    <button type="submit" :disabled="isBlank">Enter</button>
  </form>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.access-key {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  text-align: left;

  label {
    font-size: 0.8rem;
    font-weight: 600;
    color: $color-muted;
  }

  input {
    padding: 0.7rem 0.9rem;
    border: 1px solid $color-border;
    border-radius: $radius-sm;
    background: $color-surface-alt;
    outline: none;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;

    &:focus {
      border-color: $color-primary;
      box-shadow: 0 0 0 3px rgb(79 70 229 / 15%);
      background: $color-surface;
    }
  }

  button {
    margin-top: 0.4rem;
    padding: 0.7rem 1rem;
    border: 0;
    border-radius: $radius-sm;
    background: $gradient-primary;
    color: #fff;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 6px 18px rgb(79 70 229 / 28%);
    transition: opacity 0.15s;

    &:disabled {
      opacity: 0.45;
      cursor: default;
      box-shadow: none;
    }
  }

  &__error {
    margin: 0;
    padding: 0.5rem 0.75rem;
    border-radius: $radius-sm;
    background: $color-error-soft;
    color: $color-error;
    font-size: 0.875rem;
  }
}
</style>
