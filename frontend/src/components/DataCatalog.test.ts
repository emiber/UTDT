import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalog } from '../api.ts';
import { loadStoredKey, saveKey } from '../auth.ts';
import DataCatalog from './DataCatalog.vue';

enableAutoUnmount(afterEach);

const CATALOG: Catalog = {
  tables: [
    {
      name: 'authors',
      description: 'One row per author.',
      columns: [{ name: 'author_id', dataType: 'INTEGER', description: 'Author id.' }],
      indexes: [],
    },
    {
      name: 'books',
      description: 'One row per book.',
      columns: [],
      indexes: [
        { name: 'idx_books_author_title', unique: false, columns: ['author_id', 'title'] },
        { name: 'sqlite_autoindex_books_1', unique: true, columns: ['isbn'] },
      ],
    },
  ],
  relationships: [
    {
      fromTable: 'books',
      fromColumn: 'author_id',
      toTable: 'authors',
      toColumn: 'author_id',
      description: 'Who wrote the book.',
    },
  ],
};

function stubFetch(impl: () => Promise<Response>) {
  const fetchMock = vi.fn<typeof fetch>(impl);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function mountLoaded(response: Response | Error) {
  stubFetch(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const wrapper = mount(DataCatalog);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  sessionStorage.clear();
  loadStoredKey();
  saveKey('the-key');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DataCatalog', () => {
  it('requests the catalog on mount, inside a closed "Available data" section', () => {
    const fetchMock = stubFetch(() => new Promise<Response>(() => {}));

    const wrapper = mount(DataCatalog);

    const details = wrapper.find('details');
    expect(details.attributes('open')).toBeUndefined();
    expect(details.find('summary').text()).toBe('Available data');
    expect(details.text()).toContain('Loading the data catalog…');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/catalog');
  });

  it('shows the HTTP status when the backend fails', async () => {
    const wrapper = await mountLoaded(new Response(null, { status: 500 }));

    expect(wrapper.find('.catalog__error').text()).toBe(
      'Could not load the data catalog: HTTP 500',
    );
  });

  it('shows the error message when the network fails', async () => {
    const wrapper = await mountLoaded(new TypeError('Failed to fetch'));

    expect(wrapper.find('.catalog__error').text()).toBe(
      'Could not load the data catalog: Failed to fetch',
    );
  });

  it('says so when no table is described', async () => {
    const wrapper = await mountLoaded(Response.json({ tables: [], relationships: [] }));

    expect(wrapper.find('details').text()).toContain('No tables are described yet.');
    expect(wrapper.find('.catalog__table').exists()).toBe(false);
  });

  it('shows each table with its columns and indexes, and the relationships', async () => {
    const wrapper = await mountLoaded(Response.json(CATALOG));

    const [authors, books] = wrapper.findAll('.catalog__table');
    expect(authors.find('h3').text()).toBe('authors');
    expect(authors.text()).toContain('One row per author.');
    expect(authors.findAll('tbody td').map((td) => td.text())).toEqual([
      'author_id',
      'INTEGER',
      'Author id.',
    ]);
    expect(authors.text()).toContain('No indexes.');

    expect(books.find('h3').text()).toBe('books');
    expect(books.find('table').exists()).toBe(false);
    expect(books.text()).toContain('No columns described.');
    expect(books.findAll('.catalog__indexes li').map((li) => li.text())).toEqual([
      'idx_books_author_title (author_id, title)',
      'sqlite_autoindex_books_1 (isbn) · unique',
    ]);

    expect(wrapper.find('.catalog__relationships li').text()).toBe(
      'books.author_id → authors.author_id — Who wrote the book.',
    );
  });

  it('shows no relationships section when there are none', async () => {
    const wrapper = await mountLoaded(Response.json({ ...CATALOG, relationships: [] }));

    expect(wrapper.find('.catalog__relationships').exists()).toBe(false);
  });
});
