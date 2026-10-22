import '@fontsource-variable/inter';
import { createApp } from 'vue';
import App from './App.vue';
import { createAppRouter } from './router.ts';
import './styles/main.scss';

createApp(App).use(createAppRouter()).mount('#app');
