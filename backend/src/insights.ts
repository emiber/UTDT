import { LlmError, requestStructured, type LlmClient } from './llm.ts';
import { renderPrompt } from './prompts.ts';

/** Rows the LLM sees: enough for most aggregations, few tokens. The table shows them all. */
export const SAMPLE_ROWS = 50;

export interface Insights {
  /** A short markdown narrative, in the language of the question. */
  narrative: string;
  /** 3 follow-up questions, in the language of the question. */
  suggestions: string[];
}

// Only narrative and suggestions: there's no field for data, so the LLM can't re-type
// (or invent) numbers. The backend builds the table from the real rows.
const INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    narrative: { type: 'string', description: 'A short markdown narrative of the result.' },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
      description: 'Three follow-up questions this data can answer.',
    },
  },
  required: ['narrative', 'suggestions'],
  additionalProperties: false,
};

export interface InsightsInput {
  question: string;
  sql: string;
  columns: string[];
  rows: unknown[][];
  llm: LlmClient;
}

/**
 * Asks the LLM to explain a query result. It sees the question, the SQL, the columns, the
 * first SAMPLE_ROWS rows and the total row count. Throws an LlmError when OpenAI fails.
 */
export async function buildInsights({
  question,
  sql,
  columns,
  rows,
  llm,
}: InsightsInput): Promise<Insights> {
  const output = await requestStructured<Partial<Insights>>(llm, {
    name: 'insights',
    schema: INSIGHTS_SCHEMA,
    instructions: renderPrompt('insights-system', {}),
    input: renderPrompt('insights-user', {
      question,
      sql,
      columns: JSON.stringify(columns),
      rowCount: rows.length,
      sample: rows.slice(0, SAMPLE_ROWS).map((row) => JSON.stringify(row)),
    }),
  });
  const { narrative, suggestions } = output;
  if (typeof narrative !== 'string' || !isStringList(suggestions)) {
    throw new LlmError('The model returned no valid insights.');
  }
  return { narrative, suggestions };
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
