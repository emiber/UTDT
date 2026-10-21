import { buildApp } from './app.ts';
import { readAccessKey } from './auth.ts';
import { APP_DB_PATH, DATA_DB_PATH, openDatabase, openReadOnlyDatabase } from './db.ts';
import { createDecisionClient, createLlmClient } from './llm.ts';

// Fails before listening when APP_ACCESS_KEY, OPENAI_API_KEY, OPENAI_MODEL or
// OPENAI_DECISIONS_MODEL is missing, or data/data.db hasn't been seeded.
const accessKey = readAccessKey();
const llm = createLlmClient();
const decisions = createDecisionClient();
const dataDb = openReadOnlyDatabase(DATA_DB_PATH);
const app = buildApp({
  db: openDatabase(APP_DB_PATH),
  dataDb,
  llm,
  decisions,
  accessKey,
  logger: true,
});

await app.listen({ host: '127.0.0.1', port: 3000 });
