<script setup lang="ts">
// The app's mark: a spark on the brand gradient. Decorative only.
withDefaults(defineProps<{ size?: 'small' | 'large' }>(), { size: 'small' });
</script>

<template>
  <span class="mark" :class="`mark--${size}`" aria-hidden="true">
    <svg viewBox="0 0 24 24">
      <path d="M12 2.5l2.4 6.6 6.6 2.4-6.6 2.4-2.4 6.6-2.4-6.6-6.6-2.4 6.6-2.4z" />
      <circle cx="19" cy="5" r="1.6" />
    </svg>
  </span>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.mark {
  display: inline-grid;
  place-items: center;
  flex: none;
  background: $gradient-primary;
  box-shadow: 0 6px 16px rgb(79 70 229 / 30%);

  svg {
    fill: #fff;
  }

  &--small {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 0.7rem;

    svg {
      width: 1.25rem;
      height: 1.25rem;
    }
  }

  &--large {
    width: 3.5rem;
    height: 3.5rem;
    border-radius: 1rem;

    svg {
      width: 2rem;
      height: 2rem;
    }
  }
}
</style>
