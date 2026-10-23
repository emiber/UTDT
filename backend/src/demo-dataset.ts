import type { SQLInputValue } from 'node:sqlite';
import type { Dataset } from './seed.ts';

// The demo dataset that `npm run seed` loads: a small, fictitious sales dataset whose only
// purpose is to exercise the pipeline. It's the one place that knows these tables. To use
// other data, replace this file.

const schema = `
  CREATE TABLE customers (
    customer_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    segment TEXT NOT NULL
  );
  CREATE TABLE products (
    product_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    unit_price REAL NOT NULL,
    unit_cost REAL NOT NULL
  );
  CREATE TABLE orders (
    order_id INTEGER PRIMARY KEY,
    customer_id INTEGER NOT NULL REFERENCES customers (customer_id),
    product_id INTEGER NOT NULL REFERENCES products (product_id),
    order_date TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    amount REAL NOT NULL
  );
  CREATE INDEX idx_orders_customer_id ON orders (customer_id);
  CREATE INDEX idx_orders_product_id ON orders (product_id);
`;

// [customer_id, name, country, segment]
const customers: [number, string, string, string][] = [
  [1, 'Acme Corp', 'United States', 'Business'],
  [2, 'Emma Johnson', 'United States', 'Consumer'],
  [3, 'Globex Inc', 'United States', 'Business'],
  [4, 'Liam Smith', 'United States', 'Consumer'],
  [5, 'Brandt GmbH', 'Germany', 'Business'],
  [6, 'Lena Fischer', 'Germany', 'Consumer'],
  [7, 'Nordwerk AG', 'Germany', 'Business'],
  [8, 'Jonas Weber', 'Germany', 'Consumer'],
  [9, 'Sol Comercio Ltda', 'Brazil', 'Business'],
  [10, 'Ana Souza', 'Brazil', 'Consumer'],
  [11, 'Rio Digital SA', 'Brazil', 'Business'],
  [12, 'Pedro Lima', 'Brazil', 'Consumer'],
  [13, 'Sakura Trading KK', 'Japan', 'Business'],
  [14, 'Yuki Tanaka', 'Japan', 'Consumer'],
  [15, 'Kaito Sato', 'Japan', 'Consumer'],
  [16, 'Hoshi Systems KK', 'Japan', 'Business'],
  [17, 'Pampa Logistica SRL', 'Argentina', 'Business'],
  [18, 'Sofia Fernandez', 'Argentina', 'Consumer'],
  [19, 'Mateo Gonzalez', 'Argentina', 'Consumer'],
  [20, 'Austral Tech SA', 'Argentina', 'Business'],
];

// [product_id, name, category, unit_price in USD, unit_cost in USD]. The margin differs by
// category: Electronics, the one that sells the most, leaves the least (15–25% of the price),
// so "sells the most" and "leaves the most" give different answers.
const products: [number, string, string, number, number][] = [
  [1, 'Laptop 14 inch', 'Electronics', 1199, 1019.15],
  [2, '27 inch Monitor', 'Electronics', 329, 256.62],
  [3, 'Smartphone', 'Electronics', 799, 655.18],
  [4, 'Noise-Cancelling Headphones', 'Electronics', 249, 186.75],
  [5, 'Wireless Mouse', 'Accessories', 24.99, 11.25],
  [6, 'Mechanical Keyboard', 'Accessories', 89.5, 42.96],
  [7, 'USB-C Dock', 'Accessories', 149.99, 63],
  [8, 'Office Chair', 'Furniture', 279, 167.4],
  [9, 'Standing Desk', 'Furniture', 549, 351.36],
  [10, 'Bookshelf', 'Furniture', 129, 72.24],
  [11, 'Desk Lamp', 'Furniture', 39.9, 23.14],
  [12, 'Notebook Pack', 'Office Supplies', 12.5, 5],
  [13, 'Gel Pens (12 pack)', 'Office Supplies', 9.99, 3.8],
  [14, 'Printer Paper (500 sheets)', 'Office Supplies', 7.49, 3.37],
  [15, 'Whiteboard', 'Office Supplies', 64, 22.4],
];

/**
 * Orders for every month of 2024 and 2025, from a fixed formula (no randomness), so every
 * seed loads the same rows. Busier towards the end of each year, and more orders in 2025,
 * so year-over-year questions have something to compare.
 */
function generateOrders(): SQLInputValue[][] {
  const rows: SQLInputValue[][] = [];
  let orderId = 1;
  for (let m = 0; m < 24; m++) {
    const year = 2024 + Math.floor(m / 12);
    const month = (m % 12) + 1;
    const orderCount = 8 + (month % 4) + (month >= 11 ? 4 : 0) + (year === 2025 ? 3 : 0);
    for (let i = 0; i < orderCount; i++) {
      const customerId = ((i * 7 + m * 3) % customers.length) + 1;
      // Strides coprime with 20 and 15, so each month spreads over many customers and products.
      const productId = ((i * 4 + m * 2) % products.length) + 1;
      const day = ((i * 11 + m * 5) % 28) + 1;
      const quantity = ((i * 3 + m) % 5) + 1;
      const unitPrice = products[productId - 1][3];
      const amount = Math.round(quantity * unitPrice * 100) / 100;
      rows.push([orderId++, customerId, productId, isoDate(year, month, day), quantity, amount]);
    }
  }
  return rows;
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const demoDataset: Dataset = {
  schema,
  data: [
    { table: 'customers', columns: ['customer_id', 'name', 'country', 'segment'], rows: customers },
    {
      table: 'products',
      columns: ['product_id', 'name', 'category', 'unit_price', 'unit_cost'],
      rows: products,
    },
    {
      table: 'orders',
      columns: ['order_id', 'customer_id', 'product_id', 'order_date', 'quantity', 'amount'],
      rows: generateOrders(),
    },
  ],
  metadata: {
    tables: [
      {
        tableName: 'customers',
        description: 'One row per customer: the people and companies that place orders.',
      },
      {
        tableName: 'products',
        description:
          'One row per product in the catalog, with its category, unit price and unit cost.',
      },
      {
        tableName: 'orders',
        description:
          'One row per order, from January 2024 to December 2025. Each order is for a single product.',
      },
    ],
    columns: [
      {
        tableName: 'customers',
        columnName: 'customer_id',
        dataType: 'INTEGER',
        description: 'Unique customer identifier.',
      },
      {
        tableName: 'customers',
        columnName: 'name',
        dataType: 'TEXT',
        description: 'Customer name: a person or a company.',
      },
      {
        tableName: 'customers',
        columnName: 'country',
        dataType: 'TEXT',
        description: "Country where the customer is based, in English (e.g. 'Germany').",
      },
      {
        tableName: 'customers',
        columnName: 'segment',
        dataType: 'TEXT',
        description: "Customer segment: 'Consumer' for individuals, 'Business' for companies.",
      },
      {
        tableName: 'products',
        columnName: 'product_id',
        dataType: 'INTEGER',
        description: 'Unique product identifier.',
      },
      {
        tableName: 'products',
        columnName: 'name',
        dataType: 'TEXT',
        description: 'Product name.',
      },
      {
        tableName: 'products',
        columnName: 'category',
        dataType: 'TEXT',
        description: "Product category (e.g. 'Electronics', 'Furniture').",
      },
      {
        tableName: 'products',
        columnName: 'unit_price',
        dataType: 'REAL',
        description:
          'Price of one unit, in USD. It does not change over time. Do not sum it: use orders.amount for revenue.',
      },
      {
        tableName: 'products',
        columnName: 'unit_cost',
        dataType: 'REAL',
        description:
          "Cost of one unit, in USD. It does not change over time. An order's margin is amount - quantity * unit_cost, and its margin percentage is that margin over amount.",
      },
      {
        tableName: 'orders',
        columnName: 'order_id',
        dataType: 'INTEGER',
        description: 'Unique order identifier.',
      },
      {
        tableName: 'orders',
        columnName: 'customer_id',
        dataType: 'INTEGER',
        description: 'The customer who placed the order.',
      },
      {
        tableName: 'orders',
        columnName: 'product_id',
        dataType: 'INTEGER',
        description: 'The product ordered.',
      },
      {
        tableName: 'orders',
        columnName: 'order_date',
        dataType: 'TEXT',
        description:
          "Date the order was placed, as an ISO date (YYYY-MM-DD). Group by month with strftime('%Y-%m', order_date).",
      },
      {
        tableName: 'orders',
        columnName: 'quantity',
        dataType: 'INTEGER',
        description: 'Number of units ordered. Sum it to get units sold.',
      },
      {
        tableName: 'orders',
        columnName: 'amount',
        dataType: 'REAL',
        description: 'Order total in USD: quantity times the unit price. Sum it to get revenue.',
      },
    ],
    relationships: [
      {
        fromTable: 'orders',
        fromColumn: 'customer_id',
        toTable: 'customers',
        toColumn: 'customer_id',
        description: 'The customer who placed the order.',
      },
      {
        fromTable: 'orders',
        fromColumn: 'product_id',
        toTable: 'products',
        toColumn: 'product_id',
        description: 'The product that was ordered.',
      },
    ],
  },
};
