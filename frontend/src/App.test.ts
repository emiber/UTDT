import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';

// The auth state is shared, so an App left mounted would react to the next test.
enableAutoUnmount(afterEach);

const STORAGE_KEY = 'utdt.accessKey';

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
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
    const fetchMock = stubFetch(async () => Response.json({ status: 'ok', sqliteVersion: '3' }));
    const wrapper = mount(App);

    await wrapper.find('input').setValue('entered-key');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('form.access-key').exists()).toBe(false);
    expect(wrapper.find('.status--ok').exists()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer entered-key');
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
    stubFetch(async () => Response.json({ status: 'ok', sqliteVersion: '3.50.0' }));

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

  it('goes back to the key screen with a message when the key is rejected', async () => {
    stubFetch(async () => new Response(null, { status: 401 }));

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find('form.access-key').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').text()).toBe('Access key rejected. Enter it again.');
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});
