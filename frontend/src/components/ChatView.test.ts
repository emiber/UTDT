import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadStoredKey, saveKey } from '../auth.ts';
import ChatView from './ChatView.vue';

enableAutoUnmount(afterEach);

type Reply = Response | Error | Promise<Response>;

function stubChat(...replies: Reply[]) {
  const fetchMock = vi.fn<typeof fetch>(async () => {
    const reply = replies.shift();
    if (!reply) throw new Error('Unexpected request');
    if (reply instanceof Error) throw reply;
    return reply;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const sentBody = (fetchMock: ReturnType<typeof stubChat>, call: number) =>
  JSON.parse(String(fetchMock.mock.calls[call][1]?.body)) as Record<string, unknown>;

function answer(overrides: Record<string, unknown> = {}) {
  return Response.json({
    conversationId: 'c1',
    turnId: 1,
    blocks: [{ type: 'text', markdown: 'Ink sold **5** units.' }],
    suggestions: ['Next?', 'More?', 'Why?'],
    ...overrides,
  });
}

async function ask(wrapper: VueWrapper, text: string) {
  await wrapper.find('input').setValue(text);
  await wrapper.find('form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  loadStoredKey();
  saveKey('the-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ChatView', () => {
  it('sends the first question without a conversationId and the next ones with it', async () => {
    const fetchMock = stubChat(answer(), answer({ turnId: 2 }));
    const wrapper = mount(ChatView);

    await ask(wrapper, '  Units per item?  ');
    await ask(wrapper, 'And per month?');

    expect(sentBody(fetchMock, 0)).toEqual({ question: 'Units per item?' });
    expect(sentBody(fetchMock, 1)).toEqual({ question: 'And per month?', conversationId: 'c1' });
    expect(new Headers(fetchMock.mock.calls[0][1]?.headers).get('Authorization')).toBe(
      'Bearer the-key',
    );
  });

  it('shows each question with its rendered blocks and suggestions', async () => {
    stubChat(
      answer({
        blocks: [
          { type: 'text', markdown: 'Ink sold **5** units.' },
          { type: 'table', columns: ['name', 'qty'], rows: [['ink', 5]] },
        ],
      }),
    );
    const wrapper = mount(ChatView);

    await ask(wrapper, 'Units per item?');

    const turn = wrapper.find('.chat__turn');
    expect(turn.find('.chat__question').text()).toBe('Units per item?');
    expect(turn.find('strong').text()).toBe('5');
    expect(turn.findAll('th').map((th) => th.text())).toEqual(['name', 'qty']);
    expect(turn.findAll('.chat__suggestions button').map((b) => b.text())).toEqual([
      'Next?',
      'More?',
      'Why?',
    ]);
    expect(wrapper.find('input').element.value).toBe('');
  });

  it('shows a waiting indicator and disables sending while an answer is pending', async () => {
    let respond: (res: Response) => void = () => {};
    stubChat(answer(), new Promise<Response>((resolve) => (respond = resolve)));
    const wrapper = mount(ChatView);
    await ask(wrapper, 'First?');

    await wrapper.find('input').setValue('Second?');
    await wrapper.find('form').trigger('submit');

    expect(wrapper.find('.chat__pending').text()).toBe('Thinking…');
    expect(wrapper.find('input').attributes('disabled')).toBeDefined();
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    for (const button of wrapper.findAll('.chat__suggestions button')) {
      expect(button.attributes('disabled')).toBeDefined();
    }

    respond(answer({ turnId: 2 }));
    await flushPromises();

    expect(wrapper.find('.chat__pending').exists()).toBe(false);
    expect(wrapper.find('input').attributes('disabled')).toBeUndefined();
  });

  it('gives the focus back to the input once the answer arrives', async () => {
    stubChat(answer());
    const wrapper = mount(ChatView, { attachTo: document.body });

    await ask(wrapper, 'First?');

    expect(document.activeElement).toBe(wrapper.find('input').element);
  });

  it('scrolls down to each new question, then up to the start of its own answer', async () => {
    let respond: (res: Response) => void = () => {};
    stubChat(answer(), new Promise<Response>((resolve) => (respond = resolve)));
    const wrapper = mount(ChatView);
    // jsdom has no layout: fake the sizes and record where the thread scrolls to.
    const scroller = wrapper.find('.chat__scroll').element;
    const tops: number[] = [];
    Object.defineProperty(scroller, 'scrollHeight', { value: 900 });
    Object.defineProperty(scroller, 'scrollTop', { get: () => 0, set: (top) => tops.push(top) });
    // Each turn sits 300 px below the previous one.
    vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return [...scroller.querySelectorAll('.chat__turn')].indexOf(this) * 300;
    });

    await ask(wrapper, 'First?');
    expect(tops).toEqual([900, -16]);

    await ask(wrapper, 'Second?');
    expect(tops).toEqual([900, -16, 900]);
    respond(answer());
    await flushPromises();
    expect(tops).toEqual([900, -16, 900, 284]);
  });

  it('shows a welcome message until the first question', async () => {
    stubChat(answer());
    const wrapper = mount(ChatView);
    expect(wrapper.find('.chat__empty').exists()).toBe(true);

    await ask(wrapper, 'First?');

    expect(wrapper.find('.chat__empty').exists()).toBe(false);
  });

  it.each([[''], ['   ']])('cannot send a blank question (%j)', async (text) => {
    const fetchMock = stubChat();
    const wrapper = mount(ChatView);

    await wrapper.find('input').setValue(text);
    await wrapper.find('form').trigger('submit');

    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a clicked suggestion right away, in the same conversation', async () => {
    const fetchMock = stubChat(answer(), answer({ turnId: 2 }));
    const wrapper = mount(ChatView);
    await ask(wrapper, 'First?');

    await wrapper.find('.chat__suggestions button').trigger('click');
    await flushPromises();

    expect(sentBody(fetchMock, 1)).toEqual({ question: 'Next?', conversationId: 'c1' });
    expect(wrapper.findAll('.chat__question').map((q) => q.text())).toEqual(['First?', 'Next?']);
  });

  it('shows no suggestion buttons when there are none', async () => {
    stubChat(answer({ suggestions: [] }));
    const wrapper = mount(ChatView);

    await ask(wrapper, 'Colors?');

    expect(wrapper.find('.chat__suggestions').exists()).toBe(false);
  });

  it('on a 404 says the conversation is gone, and the next question starts a new one', async () => {
    const fetchMock = stubChat(
      answer(),
      new Response(null, { status: 404 }),
      answer({ conversationId: 'c2' }),
    );
    const wrapper = mount(ChatView);
    await ask(wrapper, 'First?');

    await ask(wrapper, 'Second?');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(wrapper.findAll('.chat__turn')[1].find('[role="alert"]').text()).toBe(
      'This conversation is no longer available. Your next question will start a new one.',
    );
    await ask(wrapper, 'Third?');
    expect(sentBody(fetchMock, 2)).toEqual({ question: 'Third?' });
    expect(wrapper.findAll('.chat__question')).toHaveLength(3);
  });

  it.each([
    ['an error status', new Response(null, { status: 500 }), 'Could not get an answer: HTTP 500'],
    [
      'a network error',
      new TypeError('Failed to fetch'),
      'Could not get an answer: Failed to fetch',
    ],
  ])('shows %s in the thread and keeps the conversation', async (_case, reply, message) => {
    const fetchMock = stubChat(answer(), reply, answer({ turnId: 3 }));
    const wrapper = mount(ChatView);
    await ask(wrapper, 'First?');

    await ask(wrapper, 'Second?');

    expect(wrapper.findAll('.chat__turn')[1].find('[role="alert"]').text()).toBe(message);
    expect(wrapper.find('input').attributes('disabled')).toBeUndefined();
    await ask(wrapper, 'Third?');
    expect(sentBody(fetchMock, 2)).toEqual({ question: 'Third?', conversationId: 'c1' });
  });

  it('keeps the thread only in memory: a new mount starts empty and without a conversation', async () => {
    const fetchMock = stubChat(answer(), answer({ conversationId: 'c2' }));
    const first = mount(ChatView);
    await ask(first, 'First?');
    first.unmount();

    expect(Object.keys(sessionStorage)).toEqual(['utdt.accessKey']);
    expect(localStorage.length).toBe(0);

    const second = mount(ChatView);
    expect(second.findAll('.chat__turn')).toHaveLength(0);
    await ask(second, 'Again?');
    expect(sentBody(fetchMock, 1)).toEqual({ question: 'Again?' });
  });
});
