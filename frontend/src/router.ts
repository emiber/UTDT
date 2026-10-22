import { createRouter, createWebHistory, type RouterHistory } from 'vue-router';
import ChatView from './components/ChatView.vue';
import UsageView from './components/UsageView.vue';

/**
 * The app's routes: the chat and the usage report. `/` and any unknown path go to the chat.
 * The browser history in the app; tests pass a memory history.
 */
export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes: [
      { path: '/', redirect: '/chat' },
      { path: '/chat', name: 'chat', component: ChatView },
      { path: '/usage', name: 'usage', component: UsageView },
      { path: '/:unknown(.*)*', redirect: '/chat' },
    ],
  });
}
