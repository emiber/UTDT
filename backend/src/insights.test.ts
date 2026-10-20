import { describe, expect, it } from 'vitest';
import { buildInsights, SAMPLE_ROWS } from './insights.ts';
import { LlmError } from './llm.ts';
import { fakeLlm, jsonResponse } from './testing/fake-llm.ts';

const INSIGHTS = { narrative: 'Ink sold more.', suggestions: ['A?', 'B?', 'C?'] };

const input = (rows: unknown[][], llm = fakeLlm(jsonResponse(INSIGHTS))) => ({
  question: '¿Qué artículo vendió más?',
  sql: 'SELECT name, qty FROM items',
  columns: ['name', 'qty'],
  rows,
  llm,
});

describe('buildInsights', () => {
  it('returns the narrative and suggestions', async () => {
    expect(await buildInsights(input([['ink', 5]]))).toEqual(INSIGHTS);
  });

  it('asks for only a narrative and 3 suggestions, with no field for data', async () => {
    const llm = fakeLlm(jsonResponse(INSIGHTS));

    await buildInsights(input([['ink', 5]], llm));

    const format = llm.requests[0].text?.format;
    expect(format).toMatchObject({ type: 'json_schema', name: 'insights', strict: true });
    const schema = (format as unknown as { schema: { properties: Record<string, unknown> } })
      .schema;
    expect(Object.keys(schema.properties)).toEqual(['narrative', 'suggestions']);
    expect(schema.properties.suggestions).toMatchObject({ minItems: 3, maxItems: 3 });
  });

  it('sends the question, the SQL, the columns, the rows and the total', async () => {
    const llm = fakeLlm(jsonResponse(INSIGHTS));

    await buildInsights(
      input(
        [
          ['ink', 5],
          ['pen', null],
        ],
        llm,
      ),
    );

    const prompt = String(llm.requests[0].input);
    expect(prompt).toContain('¿Qué artículo vendió más?');
    expect(prompt).toContain('SELECT name, qty FROM items');
    expect(prompt).toContain('Columns (JSON): ["name","qty"]');
    expect(prompt).toContain('Total rows: 2');
    expect(prompt).toContain('Rows (JSON, one per line):\n["ink",5]\n["pen",null]');
    expect(String(llm.requests[0].instructions)).toContain(
      'Answer in the language of the question',
    );
  });

  it(`sends only the first ${SAMPLE_ROWS} rows of a bigger result`, async () => {
    const llm = fakeLlm(jsonResponse(INSIGHTS));
    const rows = Array.from({ length: SAMPLE_ROWS + 10 }, (_, i) => [`item ${i}`, i]);

    await buildInsights(input(rows, llm));

    const prompt = String(llm.requests[0].input);
    expect(prompt).toContain(`Total rows: ${SAMPLE_ROWS + 10}`);
    expect(prompt).toContain(`First ${SAMPLE_ROWS} rows`);
    expect(prompt).toContain(`["item ${SAMPLE_ROWS - 1}",${SAMPLE_ROWS - 1}]`);
    expect(prompt).not.toContain(`["item ${SAMPLE_ROWS}",`);
  });

  it('sends no rows section for an empty result', async () => {
    const llm = fakeLlm(jsonResponse(INSIGHTS));

    await buildInsights(input([], llm));

    const prompt = String(llm.requests[0].input);
    expect(prompt).toMatch(/Total rows: 0$/);
  });

  it.each([
    ['no narrative', { suggestions: ['A?', 'B?', 'C?'] }],
    ['suggestions that are not strings', { narrative: 'x', suggestions: [1, 2, 3] }],
  ])('throws an LlmError for %s', async (_case, output) => {
    await expect(buildInsights(input([], fakeLlm(jsonResponse(output))))).rejects.toThrow(LlmError);
  });
});
