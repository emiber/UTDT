import { describe, expect, it } from 'vitest';
import { costUsd, readPrices } from './prices.ts';

describe('readPrices', () => {
  it('reads model=input/output entries, in USD per million tokens', () => {
    const prices = readPrices({ OPENAI_PRICES: 'model-a=0.25/2, model-b = 1.25 / 10' });

    expect([...prices]).toEqual([
      ['model-a', { input: 0.25, output: 2 }],
      ['model-b', { input: 1.25, output: 10 }],
    ]);
  });

  it.each([[{}], [{ OPENAI_PRICES: '' }], [{ OPENAI_PRICES: '   ' }]])(
    'has no prices when the variable is unset or blank (%j)',
    (env) => {
      expect(readPrices(env).size).toBe(0);
    },
  );

  it.each([['model-a=0.25'], ['model-a=x/2'], ['=1/2'], ['model-a=1/2,'], ['model-a=-1/2']])(
    'throws naming the variable on a malformed value (%s)',
    (value) => {
      expect(() => readPrices({ OPENAI_PRICES: value })).toThrow('OPENAI_PRICES has a malformed');
    },
  );

  it('throws when a model is listed twice', () => {
    expect(() => readPrices({ OPENAI_PRICES: 'model-a=1/2,model-a=3/4' })).toThrow(
      'OPENAI_PRICES lists model-a twice.',
    );
  });
});

describe('costUsd', () => {
  const prices = readPrices({ OPENAI_PRICES: 'model-a=1/10' });

  it('prices input and output tokens separately', () => {
    expect(costUsd(prices, 'model-a', 2_000_000, 100_000)).toBe(3);
  });

  it('is null for a model without a price', () => {
    expect(costUsd(prices, 'model-b', 1000, 1000)).toBeNull();
  });
});
