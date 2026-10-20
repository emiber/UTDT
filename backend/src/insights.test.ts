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
    expect(await buildInsights(input([['ink', 5]]))).toEqual({ ...INSIGHTS, chart: null });
  });

  it('asks for a narrative, 3 suggestions and a chart spec, with no field for data', async () => {
    const llm = fakeLlm(jsonResponse(INSIGHTS));

    await buildInsights(input([['ink', 5]], llm));

    const format = llm.requests[0].text?.format;
    expect(format).toMatchObject({ type: 'json_schema', name: 'insights', strict: true });
    const schema = (format as unknown as { schema: { properties: Record<string, unknown> } })
      .schema;
    expect(Object.keys(schema.properties)).toEqual(['narrative', 'suggestions', 'chart']);
    expect(schema.properties.suggestions).toMatchObject({ minItems: 3, maxItems: 3 });
    // The chart spec only names columns: there's no field for values.
    const chart = schema.properties.chart as { anyOf: { properties?: object }[] };
    expect(Object.keys(chart.anyOf[0].properties ?? {})).toEqual(['type', 'x', 'series', 'title']);
  });

  it('asks for a nullable chart spec with the four chart types', async () => {
    const llm = fakeLlm(jsonResponse(INSIGHTS));

    await buildInsights(input([['ink', 5]], llm));

    const { schema } = llm.requests[0].text?.format as unknown as {
      schema: { properties: { chart: { anyOf: Record<string, unknown>[] } }; required: string[] };
    };
    expect(schema.required).toContain('chart');
    const [spec, none] = schema.properties.chart.anyOf;
    expect(none).toEqual({ type: 'null' });
    expect(spec).toMatchObject({
      type: 'object',
      required: ['type', 'x', 'series', 'title'],
      properties: { type: { enum: ['bar', 'line', 'pie', 'doughnut'] } },
    });
    const instructions = String(llm.requests[0].instructions);
    expect(instructions).toContain('set chart to null');
    expect(instructions).toContain('one or two rows');
    expect(instructions).toContain("Don't mention the chart in the narrative");
  });

  it('returns the chart spec, or null when there is none', async () => {
    const chart = { type: 'bar', x: 'name', series: ['qty'], title: 'Units' };

    const withChart = await buildInsights(
      input([['ink', 5]], fakeLlm(jsonResponse({ ...INSIGHTS, chart }))),
    );
    const without = await buildInsights(
      input([['ink', 5]], fakeLlm(jsonResponse({ ...INSIGHTS, chart: null }))),
    );

    expect(withChart.chart).toEqual(chart);
    expect(without.chart).toBeNull();
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
      'Write everything in the language of the question',
    );
  });

  it('sends the conversation history before the question', async () => {
    const llm = fakeLlm(jsonResponse(INSIGHTS));
    const history = [{ question: 'Units in 2024?', sql: 'SELECT 2024', narrative: 'Ink led.' }];

    await buildInsights({ ...input([['ink', 5]], llm), history });

    const expected = [
      'Turn 1:',
      'Question: Units in 2024?',
      'SQL: SELECT 2024',
      'Answer: Ink led.',
      '',
      'Question:',
      '¿Qué artículo vendió más?',
    ].join('\n');
    expect(String(llm.requests[0].input)).toContain(expected);
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
