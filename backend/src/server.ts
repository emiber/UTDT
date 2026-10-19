import { buildApp } from './app.ts';
import { readAccessKey } from './auth.ts';
import { APP_DB_PATH, openDatabase } from './db.ts';

// Fails before opening anything or listening when APP_ACCESS_KEY is missing.
const accessKey = readAccessKey();
const app = buildApp({ db: openDatabase(APP_DB_PATH), accessKey, logger: true });

await app.listen({ host: '127.0.0.1', port: 3000 });
