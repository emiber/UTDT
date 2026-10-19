import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { getHealth } from './api.ts';

vi.mock('./api.ts', () => ({ getHealth: vi.fn() }));

describe('App', () => {
  afterEach(() => {
    vi.mocked(getHealth).mockReset();
  });

  it('shows a checking message while the health request is pending', () => {
    vi.mocked(getHealth).mockReturnValue(new Promise(() => {}));

    const wrapper = mount(App);

    expect(wrapper.find('.status').text()).toBe('Checking backend…');
  });

  it('shows the backend status and SQLite version', async () => {
    vi.mocked(getHealth).mockResolvedValue({ status: 'ok', sqliteVersion: '3.50.0' });

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find('.status--ok').text()).toBe('Backend ok · SQLite 3.50.0');
  });

  it('shows the error when the backend is unreachable', async () => {
    vi.mocked(getHealth).mockRejectedValue(new Error('Health check failed: HTTP 503'));

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find('.status--error').text()).toBe(
      'Backend unreachable: Health check failed: HTTP 503',
    );
  });
});
