import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { formatPrices, readPrices, type ModelPrice } from './prices.ts';

// `npm run prices`: refreshes OPENAI_PRICES in the root .env from OpenAI's pricing page, so
// the usage report's cost follows OpenAI's current prices without copying them by hand.

/** OpenAI's pricing page, in the Markdown version OpenAI publishes alongside the HTML one. */
export const PRICING_URL = 'https://developers.openai.com/api/docs/pricing.md';

const SECTION = '### Standard pricing data';
const INPUT = /^(short context )?input$/i;
const OUTPUT = /^(short context )?output$/i;
const DOLLARS = /^\$(\d+(?:\.\d+)?)$/;

/**
 * The page's Standard prices, short context (up to 272K input tokens): the tables under
 * its first "Standard pricing data" heading, the main text models. A model listed twice
 * keeps its first price; one with no input or output price is left out. Throws if the
 * section or its columns aren't there, so a new page layout stops the update.
 */
export function parsePricingPage(markdown: string): Map<string, ModelPrice> {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === SECTION);
  if (start === -1) throw new Error(`The pricing page has no "${SECTION}" section.`);

  const prices = new Map<string, ModelPrice>();
  let columns: { input: number; output: number } | undefined;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('#')) break;
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());
    if (cells[0] === 'Model') {
      columns = {
        input: cells.findIndex((c) => INPUT.test(c)),
        output: cells.findIndex((c) => OUTPUT.test(c)),
      };
      if (columns.input === -1 || columns.output === -1) {
        throw new Error(`A pricing table has no input or output column: ${line}`);
      }
      continue;
    }
    if (!columns) continue;
    // "gpt-5.4 (<272K context length)" is the model gpt-5.4.
    const model = cells[0].replace(/\s*\(.*\)$/, '');
    const input = DOLLARS.exec(cells[columns.input] ?? '');
    const output = DOLLARS.exec(cells[columns.output] ?? '');
    if (!input || !output || prices.has(model)) continue;
    prices.set(model, { input: Number(input[1]), output: Number(output[1]) });
  }
  if (!prices.size) throw new Error(`The pricing page's "${SECTION}" section has no prices.`);
  return prices;
}

export interface PriceUpdate {
  prices: Map<string, ModelPrice>;
  /** Models the page doesn't list: each keeps its current price, if it had one. */
  missing: string[];
}

/**
 * The new OPENAI_PRICES: a price for OPENAI_MODEL, OPENAI_DECISIONS_MODEL and every model
 * already listed, from the page. The Decisions model has no output price: the Decisions API
 * charges input tokens only, at the model's Standard input price today. If OPENAI_MODEL is
 * the same model, it keeps its output price: prices go by model id, and the chat's output
 * tokens do cost. Throws if the current OPENAI_PRICES is malformed.
 */
export function updatePrices(
  env: Record<string, string | undefined>,
  page: Map<string, ModelPrice>,
): PriceUpdate {
  const current = readPrices(env);
  const chatModel = env.OPENAI_MODEL?.trim();
  const decisionsModel = env.OPENAI_DECISIONS_MODEL?.trim();
  const inputOnly = decisionsModel !== chatModel ? decisionsModel : undefined;
  const models = new Set(
    [chatModel, decisionsModel, ...current.keys()].filter((model): model is string => !!model),
  );
  const prices = new Map<string, ModelPrice>();
  const missing: string[] = [];
  for (const model of models) {
    const price = page.get(model);
    if (price) {
      prices.set(model, model === inputOnly ? { input: price.input, output: 0 } : price);
      continue;
    }
    missing.push(model);
    const kept = current.get(model);
    if (kept) prices.set(model, kept);
  }
  return { prices, missing };
}

/** How long the pricing page may take to download. */
const TIMEOUT_MS = 30_000;

/** The .env text with `name=value`: replaces the variable's line, or appends one. */
export function setEnvLine(text: string, name: string, value: string): string {
  const line = new RegExp(`^${name}=.*$`, 'm');
  if (line.test(text)) return text.replace(line, () => `${name}=${value}`);
  return `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}${name}=${value}\n`;
}

export interface PricesCommandOptions {
  /** The root .env: the models come from it and OPENAI_PRICES goes back into it. */
  envPath: string;
  print: (line: string) => void;
  /** The global fetch by default; tests pass a fake. */
  fetch?: typeof fetch;
}

/**
 * `npm run prices`. Reads the models from the .env, downloads the pricing page and
 * rewrites the OPENAI_PRICES line, leaving the rest of the file as it was. Returns 1,
 * saying why, if the .env can't be read or written, the page or the current prices can't
 * be read, or there is no model to price; otherwise 0, warning about models the page lacks.
 */
export async function runPricesCommand(options: PricesCommandOptions): Promise<number> {
  const { envPath, print, fetch: download = fetch } = options;
  let update: PriceUpdate;
  let value: string;
  try {
    const text = readFileSync(envPath, 'utf8');
    const env = parseEnv(text) as Record<string, string>;
    if (!env.OPENAI_MODEL && !env.OPENAI_DECISIONS_MODEL && !env.OPENAI_PRICES) {
      throw new Error(`${envPath} has no OPENAI_MODEL, OPENAI_DECISIONS_MODEL or OPENAI_PRICES.`);
    }
    const response = await download(PRICING_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`${PRICING_URL} answered ${response.status}.`);
    update = updatePrices(env, parsePricingPage(await response.text()));
    value = formatPrices(update.prices);
    writeFileSync(envPath, setEnvLine(text, 'OPENAI_PRICES', value));
  } catch (error) {
    // fetch says only "fetch failed"; the reason (DNS, offline, ...) is in its cause.
    const { message, cause } = error as Error;
    const reason = cause instanceof Error ? ` (${cause.message})` : '';
    print(`The prices could not be updated: ${message}${reason}`);
    return 1;
  }

  print(`OPENAI_PRICES=${value}`);
  for (const model of update.missing) {
    const kept = update.prices.has(model) ? 'it keeps its current price' : 'it has no price';
    print(`${model} has no Standard price on ${PRICING_URL}: ${kept}. Add it by hand if needed.`);
  }
  print(`Updated ${envPath}. Restart the backend to use the new prices.`);
  return 0;
}
