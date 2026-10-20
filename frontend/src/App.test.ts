import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';

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

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App without a stored key', () => {
  it('shows the key screen and calls no API', () => {
    const fetchMock = stubFetch(() => new Promise<Response>(() => {}));

    const wrapper = mount(App);

    expect(wrapper.find('form.access-key').exists()).toBe(true);
    expect(wrapper.find('.status').exists()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('switches to the main screen once a key is entered, sending it', async () => {
    const fetchMock = stubFetch(healthyBackend);
    const wrapper = mount(App);

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

describe('App with a stored key', () => {
  beforeEach(() => {
    sessionStorage.setItem(STORAGE_KEY, 'stored-key');
  });

  it('opens straight on the main screen', () => {
    stubFetch(() => new Promise<Response>(() => {}));

    const wrapper = mount(App);

    expect(wrapper.find('form.access-key').exists()).toBe(false);
    expect(wrapper.find('.status').text()).toBe('Checking backend…');
  });

  it('shows the backend status and SQLite version', async () => {
    stubFetch(healthyBackend);

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find('.status--ok').text()).toBe('Backend ok · SQLite 3.50.0');
  });

  it('shows the error and keeps the key when the backend fails', async () => {
    stubFetch(async () => new Response(null, { status: 503 }));

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find('.status--error').text()).toBe('Backend unreachable: HTTP 503');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBe('stored-key');
  });

  it('requests the catalog on mount, in a closed "Available data" section', async () => {
    const fetchMock = stubFetch(healthyBackend);

    const wrapper = mount(App);
    await flushPromises();

    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/catalog');
    const details = wrapper.find('details');
    expect(details.find('summary').text()).toBe('Available data');
    expect(details.attributes('open')).toBeUndefined();
    expect(details.text()).toContain('No tables are described yet.');
  });

  it('goes back to the key screen with a message when the key is rejected', async () => {
    stubFetch(async () => new Response(null, { status: 401 }));

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find('form.access-key').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').text()).toBe('Access key rejected. Enter it again.');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
