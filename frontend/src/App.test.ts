import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryHistory } from 'vue-router';
import App from './App.vue';
import { createAppRouter } from './router.ts';

// The auth state is shared, so an App left mounted would react to the next test.
enableAutoUnmount(afterEach);

const STORAGE_KEY = 'utdt.accessKey';

function stubFetch(impl: (url: string) => Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>((input) => impl(String(input)));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** A healthy backend with an empty catalog. */
async function healthyBackend(url: string): Promise<Response> {
  return url === '/api/catalog'
    ? Response.json({ tables: [], relationships: [] })
    : Response.json({ status: 'ok', sqliteVersion: '3.50.0' });
}

/** Mounts the app with its routes, on `path`, as the browser would open it. */
async function mountApp(path = '/chat') {
  const router = createAppRouter(createMemoryHistory());
  await router.push(path);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [router] } });
  return { wrapper, router };
}

/** A healthy backend that also has an empty usage report. */
async function usageBackend(url: string): Promise<Response> {
  if (!url.startsWith('/api/usage')) return healthyBackend(url);
  return Response.json({
    models: [],
    unpricedModels: [],
    totals: {
      calls: 0,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: null,
      avgMs: null,
      maxMs: null,
      failedCalls: 0,
      sqlRetries: 0,
    },
    series: [],
    breakdown: [],
    topTurns: [],
  });
}

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App without a stored key', () => {
  it('shows the key screen and calls no API', async () => {
    const fetchMock = stubFetch(() => new Promise<Response>(() => {}));

    const { wrapper } = await mountApp();

    expect(wrapper.find('form.access-key').exists()).toBe(true);
    expect(wrapper.find('.status').exists()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('switches to the main screen once a key is entered, sending it', async () => {
    const fetchMock = stubFetch(healthyBackend);
    const { wrapper } = await mountApp();

    await wrapper.find('input').setValue('entered-key');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('form.access-key').exists()).toBe(false);
    expect(wrapper.find('.status--ok').exists()).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/health', '/api/catalog']);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer entered-key');
    }
  });
});

describe('App without a stored key, on /usage', () => {
  it('asks for the key, then shows the usage report', async () => {
    stubFetch(usageBackend);
    const { wrapper } = await mountApp('/usage');
    expect(wrapper.find('form.access-key').exists()).toBe(true);

    await wrapper.find('input').setValue('entered-key');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.usage').exists()).toBe(true);
  });
});

describe('App with a stored key', () => {
  beforeEach(() => {
    sessionStorage.setItem(STORAGE_KEY, 'stored-key');
  });

  it('opens straight on the main screen', async () => {
    stubFetch(() => new Promise<Response>(() => {}));

    const { wrapper } = await mountApp();

    expect(wrapper.find('form.access-key').exists()).toBe(false);
    expect(wrapper.find('.status').text()).toBe('Checking backend…');
  });

  it('shows the backend status and SQLite version', async () => {
    stubFetch(healthyBackend);

    const { wrapper } = await mountApp();
    await flushPromises();

    expect(wrapper.find('.status--ok').text()).toBe('Backend ok · SQLite 3.50.0');
  });

  it('shows the error and keeps the key when the backend fails', async () => {
    stubFetch(async () => new Response(null, { status: 503 }));

    const { wrapper } = await mountApp();
    await flushPromises();

    expect(wrapper.find('.status--error').text()).toBe('Backend unreachable: HTTP 503');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('stored-key');
  });

  it('requests the catalog on mount, in a closed "Available data" section', async () => {
    const fetchMock = stubFetch(healthyBackend);

    const { wrapper } = await mountApp();
    await flushPromises();

    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/catalog');
    const details = wrapper.find('details');
    expect(details.find('summary').text()).toBe('Available data');
    expect(details.attributes('open')).toBeUndefined();
    expect(details.text()).toContain('No tables are described yet.');
  });

  it('shows a header with the status and "Available data", and the chat below it', async () => {
    const fetchMock = stubFetch(healthyBackend);

    const { wrapper } = await mountApp();
    await flushPromises();

    expect(wrapper.findAll('.app > *').map((el) => el.classes()[0])).toEqual([
      'app__header',
      'chat',
    ]);
    expect(wrapper.find('.app__header .status').exists()).toBe(true);
    expect(wrapper.find('.app__header details.catalog').exists()).toBe(true);
    expect(wrapper.find('.chat input').exists()).toBe(true);
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain('/api/chat');
  });

  it('navigates between the chat and the usage report, keeping the chat', async () => {
    const fetchMock = stubFetch(usageBackend);
    const { wrapper, router } = await mountApp();
    await flushPromises();
    await wrapper.find('.chat input').setValue('A draft question');
    const link = (name: string) => wrapper.find(`.app__nav a[href="/${name}"]`);
    expect(link('chat').attributes('aria-current')).toBe('page');

    await link('usage').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/usage');
    expect(wrapper.find('.usage').exists()).toBe(true);
    expect(wrapper.find('.chat').exists()).toBe(false);
    expect(link('usage').attributes('aria-current')).toBe('page');
    expect(link('chat').attributes('aria-current')).toBeUndefined();
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/usage'))).toBe(true);

    await link('chat').trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/chat');
    expect(wrapper.find('.usage').exists()).toBe(false);
    // Kept alive, not remounted: what was typed is still there.
    expect(wrapper.find<HTMLInputElement>('.chat input').element.value).toBe('A draft question');
  });

  it.each([['/'], ['/nowhere'], ['/chat/extra']])('sends %s to the chat', async (path) => {
    stubFetch(healthyBackend);

    const { wrapper, router } = await mountApp(path);

    expect(router.currentRoute.value.path).toBe('/chat');
    expect(wrapper.find('.chat').exists()).toBe(true);
  });

  it('opens the usage report straight from /usage', async () => {
    stubFetch(usageBackend);

    const { wrapper } = await mountApp('/usage');
    await flushPromises();

    expect(wrapper.find('.usage').exists()).toBe(true);
    expect(wrapper.find('.chat').exists()).toBe(false);
  });

  it('goes back to the key screen, with no chat error, when a question gets a 401', async () => {
    stubFetch(async (url) =>
      url === '/api/chat' ? new Response(null, { status: 401 }) : healthyBackend(url),
    );
    const { wrapper } = await mountApp();
    await flushPromises();

    await wrapper.find('.chat input').setValue('Names?');
    await wrapper.find('.chat form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.chat').exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').text()).toBe('Access key rejected. Enter it again.');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('goes back to the key screen with a message when the key is rejected', async () => {
    stubFetch(async () => new Response(null, { status: 401 }));

    const { wrapper } = await mountApp();
    await flushPromises();

    expect(wrapper.find('form.access-key').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').text()).toBe('Access key rejected. Enter it again.');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
