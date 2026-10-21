import path from 'node:path';
import { DATA_DB_PATH } from './db.ts';
import { runEvalCommand } from './eval-command.ts';

// `npm run eval`: the golden questions in backend/eval/, the report next to the databases.
process.exitCode = await runEvalCommand({
  env: process.env,
  goldenPath: path.resolve(import.meta.dirname, '../eval/golden.json'),
  dataDbPath: DATA_DB_PATH,
  reportDir: path.join(path.dirname(DATA_DB_PATH), 'eval'),
  print: (line) => console.log(line),
});
