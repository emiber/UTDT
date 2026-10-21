import { CHART_TYPES, type ChartSpec } from './chart.ts';
import type { HistoryTurn } from './conversations.ts';
import { LlmError, requestStructured, type LlmClient } from './llm.ts';
import { renderPrompt } from './prompts.ts';

/** Rows the LLM sees: enough for most aggregations, few tokens. The table shows them all. */
export const SAMPLE_ROWS = 50;

export interface Insights {
  /** A short markdown narrative, in the language of the question. */
  narrative: string;
  /** 3 follow-up questions, in the language of the question. */
  suggestions: string[];
  /** How to chart the result, or null when a chart adds nothing. Not yet checked. */
  chart: ChartSpec | null;
}

// No field for data: the LLM only writes text and names columns, so it can't re-type (or
// invent) numbers. The backend builds the table and the chart from the real rows.
const INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    // Written first, so the rest follows it: without it, earlier turns in another language
    // pull the narrative into theirs. The value itself isn't used.
    language: {
      type: 'string',
      description:
        'The language of the question, not of the earlier turns (e.g. "English"). The narrative, the suggestions and the chart title are written in it.',
    },
    narrative: { type: 'string', description: 'A short markdown narrative of the result.' },
    suggestions: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
      description: 'Three follow-up questions this data can answer.',
    },
    chart: {
      description: 'How to chart the result, or null when a chart adds nothing to the table.',
      anyOf: [
        {
          type: 'object',
          properties: {
            type: { type: 'string', enum: CHART_TYPES },
            x: { type: 'string', description: 'The result column for the labels.' },
            series: {
              type: 'array',
              items: { type: 'string' },
              description: 'Result columns with the numbers to plot.',
            },
            title: { type: 'string', description: 'Chart title, in the language of the question.' },
          },
          required: ['type', 'x', 'series', 'title'],
          additionalProperties: false,
        },
        { type: 'null' },
      ],
    },
  },
  required: ['language', 'narrative', 'suggestions', 'chart'],
  additionalProperties: false,
};

export interface InsightsInput {
  question: string;
  sql: string;
  columns: string[];
  rows: unknown[][];
  llm: LlmClient;
  /** Earlier turns of the conversation, oldest first. */
  history?: HistoryTurn[];
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
  history = [],
}: InsightsInput): Promise<Insights> {
  const output = await requestStructured<Partial<Insights>>(llm, {
    name: 'insights',
    schema: INSIGHTS_SCHEMA,
    instructions: renderPrompt('insights-system', {}),
    input: renderPrompt('insights-user', {
      history,
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
  // buildChart checks the spec against the result; a bad one only drops the chart.
  return { narrative, suggestions, chart: output.chart ?? null };
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
