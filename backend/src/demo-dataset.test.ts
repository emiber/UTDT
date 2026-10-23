import type { DatabaseSync } from 'node:sqlite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { openDatabase } from './db.ts';
import { demoDataset } from './demo-dataset.ts';
import { seedDatabase } from './seed.ts';

const DEMO_TABLES = ['customers', 'orders', 'products'];

let db: DatabaseSync;

beforeAll(() => {
  db = openDatabase(':memory:');
  seedDatabase(db, demoDataset);
});

afterAll(() => db.close());

function all<T>(sql: string, ...params: string[]): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

function scalar(sql: string): number {
  return Object.values(db.prepare(sql).get() as Record<string, number>)[0];
}

describe('demo dataset: metadata consistency', () => {
  it('describes each demo table in meta_tables, and no meta_* table', () => {
    const described = all<{ table_name: string }>(
      'SELECT table_name FROM meta_tables ORDER BY table_name',
    );
    expect(described.map((t) => t.table_name)).toEqual(DEMO_TABLES);
  });

  it.each(DEMO_TABLES)(
    'lists the real columns of %s, in order, with their declared types',
    (table) => {
      const real = all<{ name: string; type: string }>(
        'SELECT name, type FROM pragma_table_info(?) ORDER BY cid',
        table,
      );
      const described = all<{ column_name: string; data_type: string }>(
        'SELECT column_name, data_type FROM meta_columns WHERE table_name = ? ORDER BY rowid',
        table,
      );
      expect(described.map((c) => [c.column_name, c.data_type])).toEqual(
        real.map((c) => [c.name, c.type]),
      );
    },
  );

  it('has exactly one relationship per declared foreign key', () => {
    const foreignKeys = DEMO_TABLES.flatMap((table) =>
      all<{ from: string; table: string; to: string }>(
        'SELECT "from", "table", "to" FROM pragma_foreign_key_list(?)',
        table,
      ).map((fk) => [table, fk.from, fk.table, fk.to].join('.')),
    );
    const relationships = all<Record<string, string>>(
      'SELECT from_table, from_column, to_table, to_column FROM meta_relationships',
    ).map((r) => [r.from_table, r.from_column, r.to_table, r.to_column].join('.'));

    expect(relationships.sort()).toEqual(foreignKeys.sort());
  });

  it('has no empty description', () => {
    const empty = scalar(`
      SELECT (SELECT count(*) FROM meta_tables WHERE trim(description) = '')
           + (SELECT count(*) FROM meta_columns WHERE trim(description) = '')
           + (SELECT count(*) FROM meta_relationships WHERE trim(description) = '')
    `);
    expect(empty).toBe(0);
  });
});

describe('demo dataset: content', () => {
  it('has exactly the three meta_* tables plus customers, products and orders', () => {
    const tables = all<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual([
      'customers',
      'meta_columns',
      'meta_relationships',
      'meta_tables',
      'orders',
      'products',
    ]);
  });

  it.each([
    [
      'customers',
      [
        ['customer_id', 'INTEGER', 1],
        ['name', 'TEXT', 0],
        ['country', 'TEXT', 0],
        ['segment', 'TEXT', 0],
      ],
    ],
    [
      'products',
      [
        ['product_id', 'INTEGER', 1],
        ['name', 'TEXT', 0],
        ['category', 'TEXT', 0],
        ['unit_price', 'REAL', 0],
        ['unit_cost', 'REAL', 0],
      ],
    ],
    [
      'orders',
      [
        ['order_id', 'INTEGER', 1],
        ['customer_id', 'INTEGER', 0],
        ['product_id', 'INTEGER', 0],
        ['order_date', 'TEXT', 0],
        ['quantity', 'INTEGER', 0],
        ['amount', 'REAL', 0],
      ],
    ],
  ])('defines %s with its columns, types and primary key', (table, expected) => {
    const columns = all<{ name: string; type: string; pk: number }>(
      'SELECT name, type, pk FROM pragma_table_info(?) ORDER BY cid',
      table,
    );
    expect(columns.map((c) => [c.name, c.type, c.pk])).toEqual(expected);
  });

  it('links orders to customers and products with foreign keys', () => {
    const foreignKeys = all<{ from: string; table: string; to: string }>(
      'SELECT "from", "table", "to" FROM pragma_foreign_key_list(?) ORDER BY "from"',
      'orders',
    );
    expect(foreignKeys.map((fk) => [fk.from, fk.table, fk.to])).toEqual([
      ['customer_id', 'customers', 'customer_id'],
      ['product_id', 'products', 'product_id'],
    ]);
  });

  it('has tens of customers and products, and hundreds of orders', () => {
    expect(scalar('SELECT count(*) FROM customers')).toBeGreaterThanOrEqual(10);
    expect(scalar('SELECT count(*) FROM customers')).toBeLessThanOrEqual(99);
    expect(scalar('SELECT count(*) FROM products')).toBeGreaterThanOrEqual(10);
    expect(scalar('SELECT count(*) FROM products')).toBeLessThanOrEqual(99);
    expect(scalar('SELECT count(*) FROM orders')).toBeGreaterThanOrEqual(100);
    expect(scalar('SELECT count(*) FROM orders')).toBeLessThanOrEqual(999);
  });

  it('has 4–5 countries, 3–4 categories and only the two segments', () => {
    const countries = scalar('SELECT count(DISTINCT country) FROM customers');
    const categories = scalar('SELECT count(DISTINCT category) FROM products');
    const segments = all<{ segment: string }>(
      'SELECT DISTINCT segment FROM customers ORDER BY segment',
    );

    expect(countries).toBeGreaterThanOrEqual(4);
    expect(countries).toBeLessThanOrEqual(5);
    expect(categories).toBeGreaterThanOrEqual(3);
    expect(categories).toBeLessThanOrEqual(4);
    expect(segments.map((s) => s.segment)).toEqual(['Business', 'Consumer']);
  });

  it('has no orphan orders', () => {
    expect(all('SELECT * FROM pragma_foreign_key_check')).toEqual([]);
  });

  it('has valid ISO dates in 2024–2025, with orders in each of the 24 months', () => {
    const invalid = scalar(`
      SELECT count(*) FROM orders
      WHERE date(order_date) IS NOT order_date
         OR substr(order_date, 1, 4) NOT IN ('2024', '2025')
    `);
    const months = scalar("SELECT count(DISTINCT strftime('%Y-%m', order_date)) FROM orders");

    expect(invalid).toBe(0);
    expect(months).toBe(24);
  });

  it('has more orders in 2025 than in 2024, so year-over-year questions differ', () => {
    const by2024 = scalar("SELECT count(*) FROM orders WHERE order_date LIKE '2024-%'");
    const by2025 = scalar("SELECT count(*) FROM orders WHERE order_date LIKE '2025-%'");
    expect(by2025).toBeGreaterThan(by2024);
  });

  it('sets each amount to quantity times unit price, rounded to 2 decimals', () => {
    const wrong = scalar(`
      SELECT count(*) FROM orders o JOIN products p USING (product_id)
      WHERE abs(o.amount - round(o.quantity * p.unit_price, 2)) > 1e-9
    `);
    expect(wrong).toBe(0);
  });

  it('sets each unit cost above 0 and below the unit price, with at most 2 decimals', () => {
    const wrong = scalar(`
      SELECT count(*) FROM products
      WHERE unit_cost <= 0 OR unit_cost >= unit_price OR unit_cost <> round(unit_cost, 2)
    `);
    expect(wrong).toBe(0);
  });

  it('gives the category with the most sales, Electronics, the lowest margin percentage', () => {
    const categories = all<{ category: string; sales: number; margin: number }>(`
      SELECT p.category,
             sum(o.amount) AS sales,
             sum(o.amount - o.quantity * p.unit_cost) / sum(o.amount) AS margin
      FROM orders o JOIN products p USING (product_id)
      GROUP BY p.category
    `);
    const bestSelling = [...categories].sort((a, b) => b.sales - a.sales)[0].category;
    const lowestMargin = [...categories].sort((a, b) => a.margin - b.margin)[0].category;

    // So "sells the most" and "leaves the most" have different answers.
    expect(bestSelling).toBe('Electronics');
    expect(lowestMargin).toBe('Electronics');
  });

  it('indexes orders by customer_id and by product_id', () => {
    const indexes = all<{ name: string }>(
      "SELECT name FROM pragma_index_list('orders') WHERE origin = 'c' ORDER BY name",
    );
    const indexedColumns = indexes.map((index) =>
      all<{ name: string }>('SELECT name FROM pragma_index_info(?)', index.name).map((c) => c.name),
    );
    expect(indexedColumns).toEqual([['customer_id'], ['product_id']]);
  });
});
