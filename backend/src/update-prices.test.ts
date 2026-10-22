import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  parsePricingPage,
  PRICING_URL,
  runPricesCommand,
  setEnvLine,
  updatePrices,
} from './update-prices.ts';

// The shape of OpenAI's pricing.md: a wide short/long context table and a plain one under
// "Standard pricing data", then other tiers with other prices.
const PAGE = `# Pricing

Flagship models

### Standard pricing data

| Model | Short context input | Short context output | Short context cached input | Long context input | Long context output |
| --- | --- | --- | --- | --- | --- |
| gpt-6-luna | $0.10 | $0.50 | $0.01 | $0.20 | $0.75 |
| gpt-5.4 (<272K context length) | $2.50 | $15.00 | $0.25 | $5.00 | $22.50 |

| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-5.4-mini | $0.75 | $4.50 | $0.075 |
| gpt-5.4-pro | $30.00 | $180.00 | - |
| gpt-no-output | $1.00 | - | - |

### Batch pricing data

| Model | Input | Output | Cached input |
| --- | --- | --- | --- |
| gpt-5.4-mini | $0.375 | $2.25 | $0.0375 |
| gpt-batch-only | $1.00 | $2.00 | - |
`;

describe('parsePricingPage', () => {
  it('reads the Standard short context prices of every table in the section', () => {
    expect([...parsePricingPage(PAGE)]).toEqual([
      ['gpt-6-luna', { input: 0.1, output: 0.5 }],
      ['gpt-5.4', { input: 2.5, output: 15 }],
      ['gpt-5.4-mini', { input: 0.75, output: 4.5 }],
      ['gpt-5.4-pro', { input: 30, output: 180 }],
    ]);
  });

  it('reads Windows line endings', () => {
    expect(parsePricingPage(PAGE.replace(/\n/g, '\r\n')).get('gpt-5.4-mini')).toEqual({
      input: 0.75,
      output: 4.5,
    });
  });

  it('keeps the first price of a model listed twice', () => {
    const page = PAGE.replace('| gpt-no-output |', '| gpt-6-luna |');

    expect(parsePricingPage(page).get('gpt-6-luna')).toEqual({ input: 0.1, output: 0.5 });
  });

  it('throws without the Standard section', () => {
    expect(() => parsePricingPage('# Pricing\n\n### Batch pricing data\n')).toThrow(
      'The pricing page has no "### Standard pricing data" section.',
    );
  });

  it('throws when a table has no input or output column', () => {
    const page = PAGE.replace('| Model | Input | Output |', '| Model | Price | Output |');

    expect(() => parsePricingPage(page)).toThrow('A pricing table has no input or output column');
  });

  it('throws when the section has no prices', () => {
    expect(() => parsePricingPage('### Standard pricing data\n\nComing soon.\n')).toThrow(
      'section has no prices',
    );
  });
});

describe('updatePrices', () => {
  const page = parsePricingPage(PAGE);

  it('prices the chat and Decisions models, the Decisions one with no output price', () => {
    const update = updatePrices(
      { OPENAI_MODEL: 'gpt-5.4-mini', OPENAI_DECISIONS_MODEL: 'gpt-6-luna' },
      page,
    );

    expect([...update.prices]).toEqual([
      ['gpt-5.4-mini', { input: 0.75, output: 4.5 }],
      ['gpt-6-luna', { input: 0.1, output: 0 }],
    ]);
    expect(update.missing).toEqual([]);
  });

  it('updates the models already listed, and keeps the price of one the page lacks', () => {
    const update = updatePrices(
      { OPENAI_MODEL: 'gpt-5.4-mini', OPENAI_PRICES: 'gpt-5.4=1/2,gpt-old=3/4,gpt-5.4-mini=9/9' },
      page,
    );

    expect([...update.prices]).toEqual([
      ['gpt-5.4-mini', { input: 0.75, output: 4.5 }],
      ['gpt-5.4', { input: 2.5, output: 15 }],
      ['gpt-old', { input: 3, output: 4 }],
    ]);
    expect(update.missing).toEqual(['gpt-old']);
  });

  it('leaves out a model the page lacks and that had no price', () => {
    const update = updatePrices({ OPENAI_MODEL: ' gpt-new ', OPENAI_DECISIONS_MODEL: '' }, page);

    expect(update.prices.size).toBe(0);
    expect(update.missing).toEqual(['gpt-new']);
  });

  it('throws when the current OPENAI_PRICES is malformed', () => {
    expect(() => updatePrices({ OPENAI_PRICES: 'gpt-5.4' }, page)).toThrow(
      'OPENAI_PRICES has a malformed entry',
    );
  });
});

describe('setEnvLine', () => {
  it('replaces the variable line and leaves the rest alone', () => {
    const text = 'A=1\r\n# OPENAI_PRICES=old\r\nOPENAI_PRICES=x=1/2\r\nB=2\r\n';

    expect(setEnvLine(text, 'OPENAI_PRICES', 'y=3/4')).toBe(
      'A=1\r\n# OPENAI_PRICES=old\r\nOPENAI_PRICES=y=3/4\r\nB=2\r\n',
    );
  });

  it('writes the value as is, even with $ in it', () => {
    expect(setEnvLine('OPENAI_PRICES=\n', 'OPENAI_PRICES', "$&$'")).toBe("OPENAI_PRICES=$&$'\n");
  });

  it.each([
    ['A=1\n', 'A=1\nOPENAI_PRICES=y=3/4\n'],
    ['A=1', 'A=1\nOPENAI_PRICES=y=3/4\n'],
    ['', 'OPENAI_PRICES=y=3/4\n'],
  ])('appends the line when it is missing (%j)', (text, expected) => {
    expect(setEnvLine(text, 'OPENAI_PRICES', 'y=3/4')).toBe(expected);
  });
});

describe('runPricesCommand', () => {
  let tempDir: string;
  let envPath: string;
  let lines: string[];
  let requested: string[];

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'utdt-prices-'));
    envPath = path.join(tempDir, '.env');
    lines = [];
    requested = [];
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  const run = (body = PAGE, status = 200) =>
    runPricesCommand({
      envPath,
      print: (line) => lines.push(line),
      fetch: async (url) => {
        requested.push(String(url));
        return new Response(body, { status });
      },
    });

  it('rewrites OPENAI_PRICES in the .env from the pricing page', async () => {
    writeFileSync(
      envPath,
      'APP_ACCESS_KEY=secret\nOPENAI_MODEL=gpt-5.4-mini\nOPENAI_DECISIONS_MODEL=gpt-6-luna\nOPENAI_PRICES=\n',
    );

    expect(await run()).toBe(0);

    expect(requested).toEqual([PRICING_URL]);
    expect(readFileSync(envPath, 'utf8')).toBe(
      'APP_ACCESS_KEY=secret\nOPENAI_MODEL=gpt-5.4-mini\nOPENAI_DECISIONS_MODEL=gpt-6-luna\nOPENAI_PRICES=gpt-5.4-mini=0.75/4.5,gpt-6-luna=0.1/0\n',
    );
    expect(lines).toEqual([
      'OPENAI_PRICES=gpt-5.4-mini=0.75/4.5,gpt-6-luna=0.1/0',
      `Updated ${envPath}. Restart the backend to use the new prices.`,
    ]);
  });

  it('warns about the models the page lacks', async () => {
    writeFileSync(envPath, 'OPENAI_MODEL=gpt-new\nOPENAI_PRICES=gpt-old=3/4\n');

    expect(await run()).toBe(0);

    expect(readFileSync(envPath, 'utf8')).toBe('OPENAI_MODEL=gpt-new\nOPENAI_PRICES=gpt-old=3/4\n');
    expect(lines).toEqual([
      'OPENAI_PRICES=gpt-old=3/4',
      `gpt-new isn't on ${PRICING_URL}: it has no price. Add it by hand if needed.`,
      `gpt-old isn't on ${PRICING_URL}: it keeps its current price. Add it by hand if needed.`,
      `Updated ${envPath}. Restart the backend to use the new prices.`,
    ]);
  });

  it('fails without a .env', async () => {
    expect(await run()).toBe(1);

    expect(lines).toEqual([expect.stringMatching(/^The prices could not be updated: ENOENT/)]);
    expect(requested).toEqual([]);
  });

  it('fails, without downloading, when the .env names no model', async () => {
    writeFileSync(envPath, 'APP_ACCESS_KEY=secret\n');

    expect(await run()).toBe(1);

    expect(lines).toEqual([
      `The prices could not be updated: ${envPath} has no OPENAI_MODEL, OPENAI_DECISIONS_MODEL or OPENAI_PRICES.`,
    ]);
    expect(requested).toEqual([]);
  });

  it.each([
    ['the page answers with an error', 'Not found', 404, `${PRICING_URL} answered 404.`],
    ['the page has a new layout', '# Pricing\n', 200, 'The pricing page has no'],
  ])('fails, leaving the .env as it was, when %s', async (_, body, status, message) => {
    const text = 'OPENAI_MODEL=gpt-5.4-mini\nOPENAI_PRICES=gpt-5.4-mini=1/2\n';
    writeFileSync(envPath, text);

    expect(await run(body, status)).toBe(1);

    expect(lines).toEqual([expect.stringContaining(message)]);
    expect(readFileSync(envPath, 'utf8')).toBe(text);
  });
});
