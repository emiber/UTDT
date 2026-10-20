import { buildApp } from './app.ts';
import { readAccessKey } from './auth.ts';
import { APP_DB_PATH, DATA_DB_PATH, openDatabase, openReadOnlyDatabase } from './db.ts';

// Fails before listening when APP_ACCESS_KEY is missing or data/data.db hasn't been seeded.
const accessKey = readAccessKey();
const dataDb = openReadOnlyDatabase(DATA_DB_PATH);
const app = buildApp({ db: openDatabase(APP_DB_PATH), dataDb, accessKey, logger: true });

await app.listen({ host: '127.0.0.1', port: 3000 });
