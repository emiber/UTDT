// Prices for the usage report's estimated cost. They come from the user's .env: they change
// over time, so the code never hardcodes them.

/** USD per million tokens. */
export interface ModelPrice {
  input: number;
  output: number;
}

/** Price per model id, as it appears in `llm_calls.model`. */
export type Prices = ReadonlyMap<string, ModelPrice>;

const ENTRY = /^([^=\s]+)=(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/;

/**
 * Reads OPENAI_PRICES: comma-separated `model=input/output` entries, in USD per million
 * tokens (e.g. `model-a=0.25/2,model-b=1.25/10`). Unset or blank means no prices: the
 * report then shows no cost. Throws, naming the variable, on a malformed or repeated entry.
 */
export function readPrices(env: NodeJS.ProcessEnv = process.env): Prices {
  const prices = new Map<string, ModelPrice>();
  const value = env.OPENAI_PRICES?.trim();
  if (!value) return prices;
  for (const entry of value.split(',').map((e) => e.replace(/\s+/g, ''))) {
    const match = ENTRY.exec(entry);
    if (!match) {
      throw new Error(
        `OPENAI_PRICES has a malformed entry: "${entry}". Use model=input/output, in USD per million tokens, separated by commas (see .env.example).`,
      );
    }
    const [, model, input, output] = match;
    if (prices.has(model)) throw new Error(`OPENAI_PRICES lists ${model} twice.`);
    prices.set(model, { input: Number(input), output: Number(output) });
  }
  return prices;
}

/** The OPENAI_PRICES value for some prices, in the format readPrices reads. */
export function formatPrices(prices: Prices): string {
  return [...prices].map(([model, { input, output }]) => `${model}=${input}/${output}`).join(',');
}

/** The estimated cost of some tokens of a model, or null when the model has no price. */
export function costUsd(
  prices: Prices,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number | null {
  const price = prices.get(model);
  if (!price) return null;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
