import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { auth, loadStoredKey, rejectKey } from '../auth.ts';
import AccessKeyForm from './AccessKeyForm.vue';

beforeEach(() => {
  sessionStorage.clear();
  loadStoredKey();
});

describe('AccessKeyForm', () => {
  it('asks for the key in a masked field, with no error on first entry', () => {
    const wrapper = mount(AccessKeyForm);

    expect(wrapper.find('input').attributes('type')).toBe('password');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('saves the trimmed key on submit', async () => {
    const wrapper = mount(AccessKeyForm);

    await wrapper.find('input').setValue('  my-key  ');
    await wrapper.find('form').trigger('submit');

    expect(auth.key).toBe('my-key');
    expect(sessionStorage.getItem('utdt.accessKey')).toBe('my-key');
  });

  it.each([[''], ['   ']])('does not save a blank key (%j)', async (value) => {
    const wrapper = mount(AccessKeyForm);

    await wrapper.find('input').setValue(value);
    await wrapper.find('form').trigger('submit');

    expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    expect(auth.key).toBeNull();
    expect(sessionStorage.getItem('utdt.accessKey')).toBeNull();
  });

  it('enables the button once there is a key', async () => {
    const wrapper = mount(AccessKeyForm);

    await wrapper.find('input').setValue('k');

    expect(wrapper.find('button').attributes('disabled')).toBeUndefined();
  });

  it('says the key was rejected when the backend refused it', () => {
    rejectKey();

    const wrapper = mount(AccessKeyForm);

    expect(wrapper.find('[role="alert"]').text()).toBe('Access key rejected. Enter it again.');
  });
});
