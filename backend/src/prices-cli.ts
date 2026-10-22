import path from 'node:path';
import { runPricesCommand } from './update-prices.ts';

// `npm run prices`: refreshes OPENAI_PRICES in the root .env from OpenAI's pricing page.
process.exitCode = await runPricesCommand({
  envPath: path.resolve(import.meta.dirname, '../../.env'),
  print: (line) => console.log(line),
});
