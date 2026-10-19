import { buildApp } from './app.ts';
import { APP_DB_PATH, openDatabase } from './db.ts';

const app = buildApp({ db: openDatabase(APP_DB_PATH), logger: true });

await app.listen({ host: '127.0.0.1', port: 3000 });
