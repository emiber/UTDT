import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ResponseBlocks from './ResponseBlocks.vue';

describe('ResponseBlocks', () => {
  it('renders text as markdown and tables with headers and rows, in order', () => {
    const wrapper = mount(ResponseBlocks, {
      props: {
        blocks: [
          { type: 'text', markdown: 'Ink sold **5** units.\n\n- a\n- b' },
          {
            type: 'table',
            columns: ['name', 'qty'],
            rows: [
              ['ink', 5],
              ['pen', null],
            ],
          },
        ],
      },
    });

    const [text, table] = wrapper.findAll('.blocks > div');
    expect(text.classes()).toContain('blocks__text');
    expect(text.find('strong').text()).toBe('5');
    expect(text.findAll('li').map((li) => li.text())).toEqual(['a', 'b']);
    expect(table.findAll('th').map((th) => th.text())).toEqual(['name', 'qty']);
    expect(table.findAll('tbody tr').map((tr) => tr.findAll('td').map((td) => td.text()))).toEqual([
      ['ink', '5'],
      ['pen', ''],
    ]);
  });

  it('keeps repeated and numeric column names, placing cells by position', () => {
    const wrapper = mount(ResponseBlocks, {
      props: { blocks: [{ type: 'table', columns: ['id', 'id', '2023'], rows: [[1, 2, 3]] }] },
    });

    expect(wrapper.findAll('th').map((th) => th.text())).toEqual(['id', 'id', '2023']);
    expect(wrapper.findAll('td').map((td) => td.text())).toEqual(['1', '2', '3']);
  });

  it('shows raw HTML in the markdown as text, never as markup', () => {
    const wrapper = mount(ResponseBlocks, {
      props: {
        blocks: [
          {
            type: 'text',
            markdown: 'Hi <img src=x onerror=alert(1)> [x](javascript:alert(1))',
          },
        ],
      },
    });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>');
    expect(wrapper.find('a').attributes('href')).toBe('');
  });

  it('renders a markdown image as a plain link, so no remote URL loads', () => {
    const wrapper = mount(ResponseBlocks, {
      props: { blocks: [{ type: 'text', markdown: '![x](https://evil.example/p.png?d=1)' }] },
    });

    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.find('a').attributes('href')).toBe('https://evil.example/p.png?d=1');
  });

  it('opens links in a new tab, so the in-memory thread stays', () => {
    const wrapper = mount(ResponseBlocks, {
      props: {
        blocks: [{ type: 'text', markdown: 'See [docs](https://a.example) or `<a href=x>`' }],
      },
    });

    const links = wrapper.findAll('a');
    expect(links).toHaveLength(1);
    expect(links[0].attributes()).toMatchObject({
      href: 'https://a.example',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(wrapper.find('code').text()).toBe('<a href=x>');
  });

  it('shows no table for a text-only answer', () => {
    const wrapper = mount(ResponseBlocks, {
      props: { blocks: [{ type: 'text', markdown: 'No results.' }] },
    });

    expect(wrapper.find('table').exists()).toBe(false);
  });
});
