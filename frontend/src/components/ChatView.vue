<script setup lang="ts">
import { computed, nextTick, reactive, ref, useTemplateRef } from 'vue';
import { ApiError, postChat, type Block } from '../api.ts';
import ResponseBlocks from './ResponseBlocks.vue';

/** Shown in place of the answer when the backend no longer knows the conversation. */
const GONE_MESSAGE =
  'This conversation is no longer available. Your next question will start a new one.';
/** Shown when the answer took longer than CHAT_TIMEOUT_MS. */
const TIMEOUT_MESSAGE = 'Could not get an answer: the request took too long.';

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
const input = useTemplateRef('input');
const scroller = useTemplateRef('scroller');
const turnEls = useTemplateRef('turns');
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
  const index = thread.value.length - 1;
  // Down to the new question and its waiting indicator.
  await nextTick();
  scrollTo(scroller.value?.scrollHeight ?? 0);
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
    } else if ((error as Error).name === 'TimeoutError') {
      turn.error = TIMEOUT_MESSAGE;
    } else {
      turn.error = `Could not get an answer: ${(error as Error).message}`;
    }
    turn.status = 'error';
  }
  await nextTick();
  // A long answer (a big table) starts where the question is, not at its bottom.
  const turnEl = turnEls.value?.[index];
  if (turnEl) scrollTo(turnEl.offsetTop - 16);
  // The input was disabled while waiting, which dropped the focus: give it back.
  input.value?.focus({ preventScroll: true });
}

function scrollTo(top: number) {
  if (scroller.value) scroller.value.scrollTop = top;
}

function send() {
  if (!canSend.value) return;
  const text = draft.value;
  draft.value = '';
  void ask(text);
}
</script>

<template>
  <main class="chat">
    <div ref="scroller" class="chat__scroll">
      <div v-if="!thread.length" class="chat__empty">
        <h2>What do you want to know?</h2>
        <p>
          Ask a question about the data in any language: you get a short answer, the table behind it
          and, when it helps, a chart. Open <strong>Available data</strong> to see what the bot
          knows about.
        </p>
      </div>
      <ol class="chat__thread">
        <li v-for="(turn, i) in thread" ref="turns" :key="i" class="chat__turn">
          <div class="chat__ask">
            <p class="chat__question">{{ turn.question }}</p>
          </div>
          <div class="chat__reply">
            <span class="chat__avatar" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M12 2.5l2.4 6.6 6.6 2.4-6.6 2.4-2.4 6.6-2.4-6.6-6.6-2.4 6.6-2.4z" />
              </svg>
            </span>
            <div class="chat__answer">
              <p v-if="turn.status === 'pending'" class="chat__pending" role="status">
                <span class="chat__dots" aria-hidden="true"><i /><i /><i /></span>Thinking…
              </p>
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
            </div>
          </div>
        </li>
      </ol>
    </div>
    <div class="chat__composer">
      <form class="chat__form" @submit.prevent="send">
        <label for="chat-question" class="chat__label">Ask a question about the data</label>
        <input
          id="chat-question"
          ref="input"
          v-model="draft"
          type="text"
          placeholder="Ask a question about your data…"
          autocomplete="off"
          :disabled="busy"
        />
        <button type="submit" :disabled="!canSend" aria-label="Send">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 19V5M5.5 11.5L12 5l6.5 6.5" />
          </svg>
        </button>
      </form>
    </div>
  </main>
</template>

<style scoped lang="scss">
@use '../styles/tokens' as *;

.chat {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;

  // The only part that scrolls; `position: relative` makes it the offsetParent of turns.
  &__scroll {
    position: relative;
    flex: 1;
    overflow-y: auto;
    padding: 1.75rem 1.5rem 1rem;
  }

  &__thread {
    max-width: $content-width;
    margin: 0 auto;
    padding: 0;
    list-style: none;
  }

  &__empty {
    max-width: 34rem;
    margin: 12vh auto 0;
    text-align: center;

    h2 {
      margin: 0 0 0.5rem;
      font-size: 1.6rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      background: $gradient-primary;
      background-clip: text;
      color: transparent;
    }

    p {
      margin: 0;
      color: $color-muted;
    }
  }

  &__turn {
    margin-bottom: 1.75rem;
  }

  // The question: a bubble on the right, in the brand color.
  &__ask {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 0.75rem;
  }

  &__question {
    max-width: 75%;
    margin: 0;
    padding: 0.65rem 1rem;
    border-radius: $radius-lg $radius-lg $radius-sm $radius-lg;
    background: $gradient-primary;
    color: #fff;
    font-weight: 500;
    box-shadow: 0 6px 18px rgb(79 70 229 / 25%);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  // The answer: a white card on the left, next to the assistant's avatar.
  &__reply {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  &__avatar {
    display: grid;
    place-items: center;
    flex: none;
    width: 2rem;
    height: 2rem;
    margin-top: 0.15rem;
    border-radius: 50%;
    background: $color-primary-soft;

    svg {
      width: 1.1rem;
      height: 1.1rem;
      fill: $color-primary;
    }
  }

  &__answer {
    flex: 1;
    min-width: 0;
    padding: 0.9rem 1.15rem;
    border: 1px solid $color-border;
    border-radius: $radius-sm $radius-lg $radius-lg $radius-lg;
    background: $color-surface;
    box-shadow: $shadow-md;
  }

  &__pending {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    margin: 0;
    color: $color-muted;
  }

  &__dots {
    display: inline-flex;
    gap: 0.25rem;

    i {
      width: 0.4rem;
      height: 0.4rem;
      border-radius: 50%;
      background: $color-primary;
      animation: bounce 1.2s infinite ease-in-out;

      &:nth-child(2) {
        animation-delay: 0.15s;
      }

      &:nth-child(3) {
        animation-delay: 0.3s;
      }
    }
  }

  &__error {
    margin: 0;
    padding: 0.5rem 0.75rem;
    border-radius: $radius-sm;
    background: $color-error-soft;
    color: $color-error;
  }

  &__suggestions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1rem;
    padding-top: 0.85rem;
    border-top: 1px dashed $color-border;

    button {
      padding: 0.4rem 0.8rem;
      border: 1px solid transparent;
      border-radius: $radius-pill;
      background: $color-primary-soft;
      color: $color-primary-dark;
      font-size: 0.85rem;
      text-align: left;
      cursor: pointer;
      transition:
        background 0.15s,
        border-color 0.15s;

      &:hover:not(:disabled) {
        border-color: $color-primary;
        background: #fff;
      }

      &:disabled {
        opacity: 0.55;
        cursor: default;
      }
    }
  }

  // The input, always at the bottom.
  &__composer {
    padding: 0.75rem 1.5rem 1.25rem;
    background: linear-gradient(to bottom, rgb(243 244 248 / 0%), $color-bg 35%);
  }

  &__form {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    max-width: $content-width;
    margin: 0 auto;
    padding: 0.4rem 0.4rem 0.4rem 1.1rem;
    border: 1px solid $color-border;
    border-radius: $radius-pill;
    background: $color-surface;
    box-shadow: $shadow-lg;
    transition: border-color 0.15s;

    &:focus-within {
      border-color: $color-primary;
    }

    input {
      flex: 1;
      min-width: 0;
      padding: 0.55rem 0;
      border: 0;
      outline: none;
      background: transparent;
      font-size: 0.95rem;

      &::placeholder {
        color: $color-muted;
      }
    }

    button {
      display: grid;
      place-items: center;
      flex: none;
      width: 2.5rem;
      height: 2.5rem;
      border: 0;
      border-radius: 50%;
      background: $gradient-primary;
      cursor: pointer;
      transition:
        opacity 0.15s,
        transform 0.15s;

      &:hover:not(:disabled) {
        transform: translateY(-1px);
      }

      &:disabled {
        opacity: 0.35;
        cursor: default;
      }

      svg {
        width: 1.2rem;
        height: 1.2rem;
        fill: none;
        stroke: #fff;
        stroke-width: 2.2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    }
  }

  // Visually hidden, still read by screen readers.
  &__label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}

@keyframes bounce {
  0%,
  80%,
  100% {
    opacity: 0.35;
    transform: translateY(0);
  }

  40% {
    opacity: 1;
    transform: translateY(-0.25rem);
  }
}
</style>
