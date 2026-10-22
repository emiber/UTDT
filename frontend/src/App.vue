<script setup lang="ts">
import { ref } from 'vue';
import { auth, loadStoredKey } from './auth.ts';
import AccessKeyForm from './components/AccessKeyForm.vue';
import BackendStatus from './components/BackendStatus.vue';
import BrandMark from './components/BrandMark.vue';
import ChatView from './components/ChatView.vue';
import DataCatalog from './components/DataCatalog.vue';
import UsageView from './components/UsageView.vue';

// Two screens, switched by auth state: the key screen until there's a key, then the app.
loadStoredKey();

// Inside the app, the chat or the usage report. The chat stays mounted while hidden: its
// thread lives only in memory, and remounting it would lose the conversation.
const view = ref<'chat' | 'usage'>('chat');
</script>

<template>
  <div v-if="auth.key" class="app">
    <header class="app__header">
      <div class="app__bar">
        <div class="brand">
          <BrandMark />
          <div>
            <h1 class="brand__title">Text-to-SQL chatbot</h1>
            <p class="brand__tagline">Ask your data anything, in plain language</p>
          </div>
        </div>
        <div class="app__tools">
          <BackendStatus />
          <button
            type="button"
            class="app__view"
            :aria-pressed="view === 'usage'"
            @click="view = view === 'chat' ? 'usage' : 'chat'"
          >
            {{ view === 'chat' ? 'Usage' : 'Back to chat' }}
          </button>
          <DataCatalog />
        </div>
      </div>
    </header>
    <ChatView v-show="view === 'chat'" />
    <UsageView v-if="view === 'usage'" />
  </div>
  <main v-else class="login">
    <div class="login__card">
      <BrandMark size="large" />
      <h1 class="login__title">Text-to-SQL chatbot</h1>
      <p class="login__text">
        Enter the access key to start: the <code>APP_ACCESS_KEY</code> value from your
        <code>.env</code>.
      </p>
      <AccessKeyForm />
    </div>
  </main>
</template>

<style scoped lang="scss">
@use './styles/tokens' as *;

// Full height: the header and the chat's input stay put, only the thread scrolls.
.app {
  display: flex;
  flex-direction: column;
  height: 100%;

  &__header {
    position: relative;
    z-index: 2;
    background: rgb(255 255 255 / 85%);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid $color-border;
  }

  &__bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $space-md;
    max-width: $content-width + 8rem;
    margin: 0 auto;
    padding: 0.75rem 1.5rem;
  }

  &__tools {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  // Same look as the Available data button.
  &__view {
    padding: 0.4rem 0.85rem;
    border: 1px solid $color-border;
    border-radius: $radius-pill;
    background: $color-surface;
    box-shadow: $shadow-sm;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    color: $color-text;
    cursor: pointer;

    &:hover,
    &[aria-pressed='true'] {
      border-color: $color-primary;
      color: $color-primary;
    }
  }
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;

  &__title {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  &__tagline {
    margin: 0;
    font-size: 0.8rem;
    color: $color-muted;
  }
}

.login {
  display: grid;
  place-items: center;
  min-height: 100%;
  padding: $space-lg;
  background:
    radial-gradient(circle at 20% 15%, rgb(79 70 229 / 14%), transparent 45%),
    radial-gradient(circle at 85% 80%, rgb(124 58 237 / 12%), transparent 45%), $color-bg;

  &__card {
    width: min(26rem, 100%);
    padding: 2.25rem 2rem 2rem;
    background: $color-surface;
    border: 1px solid $color-border;
    border-radius: $radius-lg;
    box-shadow: $shadow-lg;
    text-align: center;
  }

  &__title {
    margin: 1rem 0 0.25rem;
    font-size: 1.4rem;
    font-weight: 700;
    letter-spacing: -0.02em;
  }

  &__text {
    margin: 0 0 1.5rem;
    color: $color-muted;
    font-size: 0.9rem;
  }
}
</style>
