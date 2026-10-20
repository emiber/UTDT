<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { ApiError, postChat, type Block } from '../api.ts';
import ResponseBlocks from './ResponseBlocks.vue';

/** Shown in place of the answer when the backend no longer knows the conversation. */
const GONE_MESSAGE =
  'This conversation is no longer available. Your next question will start a new one.';

interface Turn {
  question: string;
  status: 'pending' | 'answered' | 'error';
  blocks: Block[];
  suggestions: string[];
  error: string | null;
}

// The thread and the conversation id live only in memory: a reload starts a new one.
const thread = ref<Turn[]>([]);
let conversationId: string | null = null;
const draft = ref('');
const busy = computed(() => thread.value.some((turn) => turn.status === 'pending'));
const canSend = computed(() => !busy.value && draft.value.trim() !== '');

// Only called with a non-blank text while nothing is pending: the form checks canSend and
// the suggestion buttons are disabled while busy.
async function ask(text: string) {
  const question = text.trim();
  const turn = reactive<Turn>({
    question,
    status: 'pending',
    blocks: [],
    suggestions: [],
    error: null,
  });
  thread.value.push(turn);
  try {
    const answer = await postChat(conversationId ? { question, conversationId } : { question });
    conversationId = answer.conversationId;
    Object.assign(turn, {
      status: 'answered',
      blocks: answer.blocks,
      suggestions: answer.suggestions,
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      conversationId = null;
      turn.error = GONE_MESSAGE;
    } else {
      turn.error = `Could not get an answer: ${(error as Error).message}`;
    }
    turn.status = 'error';
  }
}

function send() {
  if (!canSend.value) return;
  const text = draft.value;
  draft.value = '';
  void ask(text);
}
</script>

<template>
  <section class="chat">
    <ol class="chat__thread">
      <li v-for="(turn, i) in thread" :key="i" class="chat__turn">
        <p class="chat__question">{{ turn.question }}</p>
        <p v-if="turn.status === 'pending'" class="chat__pending">Thinking…</p>
        <p v-else-if="turn.status === 'error'" class="chat__error" role="alert">
          {{ turn.error }}
        </p>
        <template v-else>
          <ResponseBlocks :blocks="turn.blocks" />
          <div v-if="turn.suggestions.length" class="chat__suggestions">
            <button
              v-for="suggestion in turn.suggestions"
              :key="suggestion"
              type="button"
              :disabled="busy"
              @click="ask(suggestion)"
            >
              {{ suggestion }}
            </button>
          </div>
        </template>
      </li>
    </ol>
    <form class="chat__form" @submit.prevent="send">
      <label for="chat-question" class="chat__label">Ask a question about the data</label>
      <input id="chat-question" v-model="draft" type="text" :disabled="busy" />
      <button type="submit" :disabled="!canSend">Send</button>
    </form>
  </section>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.chat {
  margin-top: 1.5rem;

  &__thread {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  &__turn {
    margin-bottom: 1.5rem;
  }

  &__question {
    display: inline-block;
    margin: 0 0 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    background: $color-surface;
    font-weight: 600;
  }

  &__pending {
    color: $color-muted;
  }

  &__error {
    color: $color-error;
  }

  &__suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  &__form {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;

    input {
      flex: 1;
      min-width: 12rem;
    }
  }

  &__label {
    width: 100%;
  }
}
</style>
