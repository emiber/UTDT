import type { DatabaseSync } from 'node:sqlite';
import type { ChartSpec } from './chart.ts';
import {
  LlmError,
  requestDecision,
  type DecisionAnswer,
  type DecisionClient,
  type DecisionQuestion,
  type LlmClient,
} from './llm.ts';
import { answerQuestion, type PipelineError, type PipelineLogger } from './pipeline.ts';
import { renderPrompt } from './prompts.ts';

// Offline evaluation (LLM-as-a-judge): each golden question runs through the real pipeline,
// and the Decisions API scores the answer. Values are kept as they come: no verdict, no
// thresholds.

export interface GoldenCase {
  id: string;
  question: string;
}

/** Parses the golden file. Throws an Error saying what's wrong with it. */
export function parseGolden(text: string): GoldenCase[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The golden file is not valid JSON.');
  }
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('The golden file must be a non-empty JSON array of cases.');
  }
  const ids = new Set<string>();
  return data.map((item, index) => {
    const { id, question } = (item ?? {}) as Partial<GoldenCase>;
    if (typeof id !== 'string' || !id.trim()) throw new Error(`Case ${index + 1} has no id.`);
    if (typeof question !== 'string' || !question.trim()) {
      throw new Error(`Case "${id}" has no question.`);
    }
    if (ids.has(id)) throw new Error(`Case id "${id}" is repeated.`);
    ids.add(id);
    return { id, question };
  });
}

export const CRITERIA = ['sql', 'narrative', 'chart'] as const;
export type Criterion = (typeof CRITERIA)[number];

/** Both scores have 3 levels; the Decisions API scores them from 0 to 2. */
export const SCORE_MAX = 2;

export const CRITERION_LABELS: Record<Criterion, string> = {
  sql: 'The SQL answers the question',
  narrative: 'The narrative is faithful to the data',
  chart: 'The chart fits',
};

// The rubric. The answer under judgment goes in the input, never in these instructions.
const QUESTIONS: Record<Criterion, DecisionQuestion> = {
  sql: {
    type: 'score',
    name: 'sql',
    instructions:
      'Do the SQL queries answer the question, given the schema the bot knew and the rows they returned? A question that asks for separate results needs a query for each, not different lists mixed in one table.',
    levels: [
      { label: 'does not answer', description: 'It answers another question or misses the point.' },
      {
        label: 'partially answers',
        description: 'Right idea, but a wrong filter, period or grouping, or a missing part.',
      },
      { label: 'fully answers', description: 'It computes exactly what the question asks.' },
    ],
  },
  narrative: {
    type: 'score',
    name: 'narrative',
    instructions: 'Is the narrative faithful to the rows of every result?',
    levels: [
      {
        label: 'contradicts or invents figures',
        description: 'It states numbers or facts the rows contradict or do not contain.',
      },
      {
        label: 'minor inaccuracies',
        description: 'Mostly right, with a small slip in a figure or a claim.',
      },
      { label: 'fully faithful', description: 'Every figure and claim matches the rows.' },
    ],
  },
  chart: {
    type: 'predicate',
    name: 'chart',
    instructions:
      'The proposed charts (type, x column, series, title) are a suitable way to show their results.',
  },
};

export type CriterionResult =
  /** The Decisions API's answer, as it came. */
  | { status: 'judged'; answer: DecisionAnswer }
  | { status: 'refused' }
  | { status: 'not_applicable' };

/** One query of an answer, as the report keeps it. */
export interface EvaluatedQuery {
  title: string;
  sql: string;
  rowCount: number;
  chart: ChartSpec | null;
}

export interface CaseResult {
  id: string;
  question: string;
  status: 'answered' | 'unanswered' | 'error';
  /** Every query's SQL, one after the other. */
  sql: string | null;
  /** One per query, for an answered question; null otherwise. */
  queries: EvaluatedQuery[] | null;
  /** Every text of the answer, one after the other. */
  narrative: string | null;
  /** Per criterion, for an answered question; null otherwise. */
  criteria: Record<Criterion, CriterionResult> | null;
  /** Why the pipeline gave no answer. */
  reason: string | null;
  error: string | null;
}

export interface EvalDeps {
  /** Read-only connection to `data.db`. */
  dataDb: DatabaseSync;
  llm: LlmClient;
  /** The Decisions API client the pipeline classifies with. */
  decisions: DecisionClient;
  judge: DecisionClient;
  /** The schema context the bot sees, so the judge sees the same. */
  schemaContext: string;
}

const QUIET: PipelineLogger = { info: () => {}, warn: () => {} };

/**
 * Runs one golden question through the pipeline, as a new conversation, and judges the
 * answer. Never throws: a pipeline or judge failure is recorded as the case's error.
 */
export async function evaluateCase(golden: GoldenCase, deps: EvalDeps): Promise<CaseResult> {
  const base: CaseResult = {
    ...golden,
    status: 'error',
    sql: null,
    queries: null,
    narrative: null,
    criteria: null,
    reason: null,
    error: null,
  };

  let result: Awaited<ReturnType<typeof answerQuestion>>;
  try {
    const { dataDb, llm, decisions } = deps;
    result = await answerQuestion({
      question: golden.question,
      dataDb,
      llm,
      decisions,
      log: QUIET,
    });
  } catch (error) {
    const { sql, cause } = error as PipelineError;
    return { ...base, sql, error: (cause as Error).message };
  }
  if (!result.ok) {
    return {
      ...base,
      status: 'unanswered',
      sql: result.sql,
      reason: `${result.kind}: ${result.message}`,
    };
  }
  // Golden questions are all data questions: a text reply means the classifier missed.
  if (result.kind === 'reply') {
    return { ...base, status: 'unanswered', reason: `classified as ${result.classification}` };
  }

  const answered: CaseResult = {
    ...base,
    sql: result.sql,
    queries: result.results.map(({ title, sql, rows, chart }) => ({
      title,
      sql,
      rowCount: rows.length,
      chart,
    })),
    narrative: result.narrative,
  };
  // No chart spec in any result: the chart criterion doesn't apply and the judge isn't asked.
  const asked: Criterion[] = result.results.some((r) => r.chart)
    ? [...CRITERIA]
    : ['sql', 'narrative'];
  const input = renderPrompt('judge-input', {
    question: golden.question,
    schemaContext: deps.schemaContext,
    queries: result.results.map(({ title, sql, columns, rows, chart }) => ({
      title,
      sql,
      rowCount: rows.length,
      columns: JSON.stringify(columns),
      rows: rows.map((row) => JSON.stringify(row)),
      chart: chart && JSON.stringify(chart),
    })),
    narrative: result.narrative,
  });
  try {
    const answers = await requestDecision(
      deps.judge,
      input,
      asked.map((criterion) => QUESTIONS[criterion]),
    );
    const criteria: Record<Criterion, CriterionResult> = {
      sql: { status: 'not_applicable' },
      narrative: { status: 'not_applicable' },
      chart: { status: 'not_applicable' },
    };
    asked.forEach((criterion, index) => {
      const answer = answers[index];
      if (answer?.type === 'refusal') {
        criteria[criterion] = { status: 'refused' };
        return;
      }
      // The Decisions API is a beta: an answer of another shape is this question's error,
      // never a crash later in the summary.
      const value = answer?.type === QUESTIONS[criterion].type ? valueOf(answer) : NaN;
      if (!Number.isFinite(value)) {
        throw new LlmError(`The judge returned an unexpected answer for ${criterion}.`);
      }
      criteria[criterion] = { status: 'judged', answer };
    });
    return { ...answered, status: 'answered', criteria };
  } catch (error) {
    return { ...answered, error: (error as Error).message };
  }
}

/** A judged answer's value: the score (0 to SCORE_MAX) or the predicate's probability. */
export function valueOf(answer: DecisionAnswer): number {
  if (answer.type === 'score') return answer.score;
  if (answer.type === 'predicate') return answer.probability;
  throw new Error(`Unexpected ${answer.type} answer.`);
}

export interface CriterionSummary {
  /** Average over judged values only; null when nothing was judged. */
  average: number | null;
  judged: number;
  refused: number;
  notApplicable: number;
}

export interface Summary {
  questions: number;
  answered: number;
  unanswered: number;
  errors: number;
  criteria: Record<Criterion, CriterionSummary>;
}

/** Averages and counts. Not applicable, refused, unanswered and errors stay out of averages. */
export function summarize(results: CaseResult[]): Summary {
  const count = (status: CaseResult['status']) => results.filter((r) => r.status === status).length;
  const criteria = Object.fromEntries(
    CRITERIA.map((criterion) => {
      const outcomes = results.flatMap((r) => (r.criteria ? [r.criteria[criterion]] : []));
      const values = outcomes.flatMap((o) => (o.status === 'judged' ? [valueOf(o.answer)] : []));
      return [
        criterion,
        {
          average: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
          judged: values.length,
          refused: outcomes.filter((o) => o.status === 'refused').length,
          notApplicable: outcomes.filter((o) => o.status === 'not_applicable').length,
        },
      ];
    }),
  ) as Record<Criterion, CriterionSummary>;
  return {
    questions: results.length,
    answered: count('answered'),
    unanswered: count('unanswered'),
    errors: count('error'),
    criteria,
  };
}

/** One console line per question. */
export function formatCase(result: CaseResult): string {
  if (result.status === 'unanswered') return `${result.id}: no answer (${result.reason})`;
  if (result.status === 'error') return `${result.id}: error (${result.error})`;
  const parts = CRITERIA.map((criterion) => {
    const outcome = (result.criteria as Record<Criterion, CriterionResult>)[criterion];
    if (outcome.status === 'not_applicable') return `${criterion} n/a`;
    if (outcome.status === 'refused') return `${criterion} refused`;
    return `${criterion} ${formatValue(criterion, valueOf(outcome.answer))}`;
  });
  return `${result.id}: ${parts.join(' | ')}`;
}

/** The summary lines: averages and counts, with no verdict. */
export function formatSummary(summary: Summary): string[] {
  const lines = [
    `Summary: ${summary.questions} questions, ${summary.answered} answered, ${summary.unanswered} without an answer, ${summary.errors} errors`,
  ];
  for (const criterion of CRITERIA) {
    const { average, judged, refused, notApplicable } = summary.criteria[criterion];
    const value = average === null ? 'nothing judged' : formatValue(criterion, average);
    const scale = criterion === 'chart' ? ' average probability' : '';
    lines.push(
      `  ${CRITERION_LABELS[criterion]}: ${value}${average === null ? '' : scale} (${judged} judged, ${refused} refused, ${notApplicable} not applicable)`,
    );
  }
  return lines;
}

function formatValue(criterion: Criterion, value: number): string {
  return criterion === 'chart' ? value.toFixed(2) : `${value.toFixed(2)}/${SCORE_MAX}`;
}
