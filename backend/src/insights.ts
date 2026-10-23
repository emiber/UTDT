import { CHART_TYPES, type ChartSpec } from './chart.ts';
import type { HistoryTurn } from './conversations.ts';
import type { QueryResult } from './generate-sql.ts';
import { LlmError, requestStructured, type LlmClient, type OnLlmCall } from './llm.ts';
import { renderPrompt } from './prompts.ts';

/** Rows the LLM sees of each result: enough for most aggregations, few tokens. The table shows them all. */
export const SAMPLE_ROWS = 50;

/** What the LLM says about one result. */
export interface InsightSection {
  /** A short markdown narrative, in the language of the question. */
  narrative: string;
  /** How to chart this result, or null when a chart adds nothing. Not yet checked. */
  chart: ChartSpec | null;
}

export interface Insights {
  /** One per result, in the same order. */
  sections: InsightSection[];
  /** 3 follow-up questions for the whole answer, in the language of the question. */
  suggestions: string[];
}

// No field for data: the LLM only writes text and names columns, so it can't re-type (or
// invent) numbers. The backend builds the table and the chart from the real rows.
const CHART_SCHEMA = {
  description: 'How to chart this result, or null when a chart adds nothing to the table.',
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
};

/** One section per result: the schema fixes how many. */
function insightsSchema(sectionCount: number) {
  return {
    type: 'object',
    properties: {
      // Written first, so the rest follows it: without it, earlier turns in another language
      // pull the narrative into theirs. The value itself isn't used.
      language: {
        type: 'string',
        description:
          'The language of the question, not of the earlier turns (e.g. "English"). The narratives, the suggestions and the chart titles are written in it.',
      },
      sections: {
        type: 'array',
        minItems: sectionCount,
        maxItems: sectionCount,
        description: 'One section per result, in the same order.',
        items: {
          type: 'object',
          properties: {
            narrative: {
              type: 'string',
              description: 'A short markdown narrative of this result, with no heading.',
            },
            chart: CHART_SCHEMA,
          },
          required: ['narrative', 'chart'],
          additionalProperties: false,
        },
      },
      suggestions: {
        type: 'array',
        items: { type: 'string' },
        minItems: 3,
        maxItems: 3,
        description: 'Three follow-up questions this data can answer.',
      },
    },
    required: ['language', 'sections', 'suggestions'],
    additionalProperties: false,
  };
}

export interface InsightsInput {
  question: string;
  /** The results to explain: one, or several when the message asked for separate ones. */
  results: QueryResult[];
  llm: LlmClient;
  /** Earlier turns of the conversation, oldest first. */
  history?: HistoryTurn[];
  /** Gets the Responses API call, failed or not. */
  onLlmCall?: OnLlmCall;
}

/**
 * Asks the LLM to explain the results of a question's queries, a section for each. For every
 * result it sees the title, the SQL, the columns, the first SAMPLE_ROWS rows and the total
 * row count. Throws an LlmError when OpenAI fails or the sections don't match the results.
 */
export async function buildInsights({
  question,
  results,
  llm,
  history = [],
  onLlmCall,
}: InsightsInput): Promise<Insights> {
  const output = await requestStructured<{ sections?: unknown; suggestions?: unknown }>(
    llm,
    {
      name: 'insights',
      schema: insightsSchema(results.length),
      instructions: renderPrompt('insights-system', {}),
      input: renderPrompt('insights-user', {
        history,
        question,
        results: results.map(({ title, sql, columns, rows }) => ({
          title,
          sql,
          columns: JSON.stringify(columns),
          rowCount: rows.length,
          sample: rows.slice(0, SAMPLE_ROWS).map((row) => JSON.stringify(row)),
        })),
      }),
    },
    onLlmCall,
  );
  const { sections, suggestions } = output;
  if (
    !Array.isArray(sections) ||
    sections.length !== results.length ||
    !sections.every(hasNarrative) ||
    !isStringList(suggestions)
  ) {
    throw new LlmError('The model returned no valid insights.');
  }
  // buildChart checks each spec against its result; a bad one only drops that chart.
  return {
    sections: sections.map(({ narrative, chart }) => ({ narrative, chart: chart ?? null })),
    suggestions,
  };
}

function hasNarrative(value: unknown): value is { narrative: string; chart?: ChartSpec | null } {
  return typeof (value as { narrative?: unknown } | null)?.narrative === 'string';
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
