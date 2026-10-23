import type { DatabaseSync } from 'node:sqlite';
import type { ChartSpec } from './chart.ts';
import { CLASSIFICATIONS, type Classification } from './classify.ts';
import type { HistoryTurn } from './conversations.ts';
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
// its classification is compared with the expected one, and the Decisions API scores the
// answer to a data question, and the language of a text reply to any other message. Values
// are kept as they come: no verdict, no thresholds.

export interface GoldenCase {
  id: string;
  question: string;
  /** The label the message should get; `data_question` when the case doesn't say. */
  classification: Classification;
  /** Earlier turns, written by hand, oldest first; empty for a new conversation. */
  history: HistoryTurn[];
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
    const {
      id,
      question,
      classification = 'data_question',
      history = [],
    } = (item ?? {}) as Record<string, unknown>;
    if (typeof id !== 'string' || !id.trim()) throw new Error(`Case ${index + 1} has no id.`);
    if (typeof question !== 'string' || !question.trim()) {
      throw new Error(`Case "${id}" has no question.`);
    }
    if (ids.has(id)) throw new Error(`Case id "${id}" is repeated.`);
    ids.add(id);
    if (!CLASSIFICATIONS.includes(classification as Classification)) {
      throw new Error(
        `Case "${id}" has an unknown classification: ${JSON.stringify(classification)}.`,
      );
    }
    return {
      id,
      question,
      classification: classification as Classification,
      history: parseHistory(id, history),
    };
  });
}

/** A case's history, in the shape the pipeline takes. Throws an Error naming the bad turn. */
function parseHistory(id: string, history: unknown): HistoryTurn[] {
  if (!Array.isArray(history)) throw new Error(`Case "${id}" has a history that is not an array.`);
  return history.map((item, index) => {
    const fields = (item ?? {}) as Record<string, unknown>;
    const where = `Case "${id}", history turn ${index + 1},`;
    const { question } = fields;
    if (typeof question !== 'string' || !question.trim()) {
      throw new Error(`${where} has no question.`);
    }
    const turn: HistoryTurn = { question };
    for (const field of ['sql', 'narrative'] as const) {
      const value = fields[field];
      if (value === undefined) continue;
      if (typeof value !== 'string') throw new Error(`${where} has a ${field} that is not text.`);
      turn[field] = value;
    }
    return turn;
  });
}

export const CRITERIA = ['sql', 'narrative', 'chart', 'language'] as const;
export type Criterion = (typeof CRITERIA)[number];

/** Both scores have 3 levels; the Decisions API scores them from 0 to 2. */
export const SCORE_MAX = 2;

export const CRITERION_LABELS: Record<Criterion, string> = {
  sql: 'The SQL answers the question',
  narrative: 'The narrative is faithful to the data',
  chart: 'The chart fits',
  language: 'The answer is in the language of the message',
};

const SEPARATE_RESULTS =
  'A question that asks for separate results needs a query for each, not different lists mixed in one table.';

// The rubric. The answer under judgment goes in the input, never in these instructions.
const QUESTIONS: Record<Criterion, DecisionQuestion> = {
  sql: {
    type: 'score',
    name: 'sql',
    instructions: `Do the SQL queries answer the question, given the schema the bot knew and the rows they returned? ${SEPARATE_RESULTS}`,
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
    instructions: 'Is the narrative faithful to the result rows?',
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
  // The bugs of #22 and #23: earlier turns in another language pulled the answer into theirs.
  // It's asked on its own, about an input without the history (see evaluateCase).
  language: {
    type: 'predicate',
    name: 'language',
    instructions:
      "Everything the bot wrote is in the language of the question (the latest message), even when the earlier turns are in another language: its narratives or reply, the column names of its results, and the titles of its results and charts. Values from the result rows and proper names don't count.",
  },
};

/**
 * The SQL question for a case with earlier turns, whose message may be a follow-up. Without
 * it the judge scored a correct repeat of the earlier query for "I don't see the chart" as
 * not answering it. Only with earlier turns: for single questions this wording lowered the
 * scores of correct answers from 2 to about 1.9.
 */
const FOLLOW_UP_SQL: DecisionQuestion = {
  ...QUESTIONS.sql,
  instructions: `Do the SQL queries answer the question, given the schema the bot knew, the earlier turns if any, and the rows they returned? After earlier turns, the question may be a follow-up: one that asks to show, chart, reformat or redo an earlier answer is answered by queries that get that data again, and one that changes the request (another period, filter or grouping) must reflect the change. ${SEPARATE_RESULTS}`,
};

export type CriterionResult =
  /** The Decisions API's answer, as it came. */
  | { status: 'judged'; answer: DecisionAnswer }
  | { status: 'refused' }
  | { status: 'not_applicable' };

/**
 * The criteria asked about an answer of its kind: all of them for a data answer, only the
 * language for a text reply. A criterion that isn't there isn't counted anywhere.
 */
export type Criteria = Partial<Record<Criterion, CriterionResult>>;

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
  /** The label the golden case expects. */
  expectedClassification: Classification;
  /**
   * The label the pipeline answered with, after its low-confidence fallback; null when the
   * classifier failed (or the pipeline threw before saying).
   */
  classification: Classification | null;
  /**
   * `not_judged`: the case expects a label other than `data_question`, so the judge isn't
   * asked about the SQL, narrative or chart; a text reply is still judged on its language.
   */
  status: 'answered' | 'unanswered' | 'not_judged' | 'error';
  /** Every query's SQL, one after the other. */
  sql: string | null;
  /** One per query, for an answered question; null otherwise. */
  queries: EvaluatedQuery[] | null;
  /** Every text of the answer, one after the other. */
  narrative: string | null;
  /**
   * For a judged answer: a data answer to a data question, or a text reply to any other
   * message (only its language); null otherwise.
   */
  criteria: Criteria | null;
  /** Why the pipeline gave no answer. */
  reason: string | null;
  error: string | null;
  /** The case's earlier turns, as the pipeline and the judge got them. */
  history: HistoryTurn[];
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
 * Runs one golden message through the pipeline, after the case's history (a new
 * conversation when it has none), keeps the label it got, and judges the answer when it's of
 * the expected kind: a data answer to a data question, a text reply to any other message.
 * Never throws: a pipeline or judge failure is recorded as the case's error.
 */
export async function evaluateCase(golden: GoldenCase, deps: EvalDeps): Promise<CaseResult> {
  const base: CaseResult = {
    id: golden.id,
    question: golden.question,
    expectedClassification: golden.classification,
    classification: null,
    status: 'error',
    sql: null,
    queries: null,
    narrative: null,
    criteria: null,
    reason: null,
    error: null,
    history: golden.history,
  };

  let result: Awaited<ReturnType<typeof answerQuestion>>;
  try {
    const { dataDb, llm, decisions } = deps;
    result = await answerQuestion({
      question: golden.question,
      dataDb,
      llm,
      decisions,
      history: golden.history,
      log: QUIET,
    });
  } catch (error) {
    const { sql, cause } = error as PipelineError;
    return { ...base, sql, error: (cause as Error).message };
  }
  // Only an answer of the expected kind is judged; any other case just keeps its label.
  const expectsData = golden.classification === 'data_question';
  const labeled: CaseResult = { ...base, classification: result.classification };
  if (!result.ok) {
    return {
      ...labeled,
      status: expectsData ? 'unanswered' : 'not_judged',
      sql: result.sql,
      reason: `${result.kind}: ${result.message}`,
    };
  }
  if (result.kind === 'reply') {
    const reply: CaseResult = {
      ...labeled,
      status: expectsData ? 'unanswered' : 'not_judged',
      narrative: result.narrative,
      // For a data question, a text reply means the classifier missed.
      reason: expectsData ? `classified as ${result.classification}` : null,
    };
    if (expectsData) return reply;
    // A text reply has nothing else to judge: only its language, without the history (see
    // the language request below).
    const input = renderPrompt('judge-reply-input', {
      question: golden.question,
      reply: result.narrative,
    });
    try {
      return { ...reply, criteria: await judgeCriteria(deps.judge, input, ['language'], golden) };
    } catch (error) {
      return { ...reply, status: 'error', error: (error as Error).message };
    }
  }

  const answered: CaseResult = {
    ...labeled,
    sql: result.sql,
    queries: result.results.map(({ title, sql, rows, chart }) => ({
      title,
      sql,
      rowCount: rows.length,
      chart,
    })),
    narrative: result.narrative,
  };
  if (!expectsData) return { ...answered, status: 'not_judged' };
  // No chart spec in any result: the chart criterion doesn't apply and the judge isn't asked.
  const asked: Criterion[] = result.results.some((r) => r.chart)
    ? ['sql', 'narrative', 'chart']
    : ['sql', 'narrative'];
  const answer = {
    question: golden.question,
    schemaContext: deps.schemaContext,
    // Each result's own text, without the heading the backend adds to it.
    queries: result.results.map(({ title, sql, columns, rows, chart, narrative }) => ({
      title,
      sql,
      rowCount: rows.length,
      columns: JSON.stringify(columns),
      rows: rows.map((row) => JSON.stringify(row)),
      chart: chart && JSON.stringify(chart),
      narrative,
    })),
  };
  try {
    const judged = {
      ...(await judgeCriteria(
        deps.judge,
        renderPrompt('judge-input', { ...answer, history: golden.history }),
        asked,
        golden,
      )),
      // The language goes in its own request, without the history: with it, the judge took
      // the English examples of the history's header ("show it as a chart") for a Spanish
      // message asking that, and scored correct answers as in the wrong language.
      ...(await judgeCriteria(
        deps.judge,
        renderPrompt('judge-input', { ...answer, history: [] }),
        ['language'],
        golden,
      )),
    };
    // A criterion the judge wasn't asked (the chart) is not applicable to a data answer.
    const criteria: Criteria = Object.fromEntries(
      CRITERIA.map((criterion) => [criterion, judged[criterion] ?? { status: 'not_applicable' }]),
    );
    return { ...answered, status: 'answered', criteria };
  } catch (error) {
    return { ...answered, error: (error as Error).message };
  }
}

/** Asks the judge these criteria about the input. Throws on a failure or an odd answer. */
async function judgeCriteria(
  judge: DecisionClient,
  input: string,
  asked: Criterion[],
  golden: GoldenCase,
): Promise<Criteria> {
  const answers = await requestDecision(
    judge,
    input,
    asked.map((criterion) =>
      criterion === 'sql' && golden.history.length ? FOLLOW_UP_SQL : QUESTIONS[criterion],
    ),
  );
  const criteria: Criteria = {};
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
  return criteria;
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

export type ClassificationOutcome = 'correct' | 'incorrect' | 'without_label';

/** How a case's label compares with the expected one; null for an error, left out of the count. */
export function classificationOutcome(result: CaseResult): ClassificationOutcome | null {
  if (result.status === 'error') return null;
  if (result.classification === null) return 'without_label';
  return result.classification === result.expectedClassification ? 'correct' : 'incorrect';
}

export interface Summary {
  questions: number;
  answered: number;
  unanswered: number;
  notJudged: number;
  errors: number;
  criteria: Record<Criterion, CriterionSummary>;
  /** Errors are left out: they have no outcome. */
  classification: { correct: number; incorrect: number; withoutLabel: number };
}

/** Averages and counts. Not applicable, refused, unanswered and errors stay out of averages. */
export function summarize(results: CaseResult[]): Summary {
  const count = (status: CaseResult['status']) => results.filter((r) => r.status === status).length;
  const labels = results.map(classificationOutcome);
  const tally = (outcome: ClassificationOutcome) => labels.filter((o) => o === outcome).length;
  const criteria = Object.fromEntries(
    CRITERIA.map((criterion) => {
      const outcomes = results.flatMap((r) => r.criteria?.[criterion] ?? []);
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
    notJudged: count('not_judged'),
    errors: count('error'),
    criteria,
    classification: {
      correct: tally('correct'),
      incorrect: tally('incorrect'),
      withoutLabel: tally('without_label'),
    },
  };
}

/** One console line per question: the classification, then the answer's scores, if judged. */
export function formatCase(result: CaseResult): string {
  if (result.status === 'error') return `${result.id}: error (${result.error})`;
  const parts = [formatClassification(result)];
  if (result.status === 'unanswered') parts.push(`no answer (${result.reason})`);
  for (const criterion of CRITERIA) {
    const outcome = result.criteria?.[criterion];
    if (!outcome) continue;
    if (outcome.status === 'not_applicable') parts.push(`${criterion} n/a`);
    else if (outcome.status === 'refused') parts.push(`${criterion} refused`);
    else parts.push(`${criterion} ${formatValue(criterion, valueOf(outcome.answer))}`);
  }
  return `${result.id}: ${parts.join(' | ')}`;
}

function formatClassification(result: CaseResult): string {
  const outcome = classificationOutcome(result);
  if (outcome === 'correct') return 'classification ok';
  if (outcome === 'without_label') return 'classification without a label';
  return `classification expected ${result.expectedClassification}, got ${result.classification}`;
}

/**
 * The summary lines: averages and counts, with no verdict. The cases that expect a label
 * other than `data_question` (`not_judged`) show as "with another label": their text
 * replies are judged on their language.
 */
export function formatSummary(summary: Summary): string[] {
  const lines = [
    `Summary: ${summary.questions} questions, ${summary.answered} answered, ${summary.unanswered} without an answer, ${summary.notJudged} with another label, ${summary.errors} errors`,
  ];
  for (const criterion of CRITERIA) {
    const { average, judged, refused, notApplicable } = summary.criteria[criterion];
    const value = average === null ? 'nothing judged' : formatValue(criterion, average);
    const scale = QUESTIONS[criterion].type === 'predicate' ? ' average probability' : '';
    lines.push(
      `  ${CRITERION_LABELS[criterion]}: ${value}${average === null ? '' : scale} (${judged} judged, ${refused} refused, ${notApplicable} not applicable)`,
    );
  }
  const { correct, incorrect, withoutLabel } = summary.classification;
  lines.push(
    `  Classification: ${correct}/${correct + incorrect} correct (${withoutLabel} without a label)`,
  );
  return lines;
}

/** A probability as is, a score over its scale. */
function formatValue(criterion: Criterion, value: number): string {
  return QUESTIONS[criterion].type === 'predicate'
    ? value.toFixed(2)
    : `${value.toFixed(2)}/${SCORE_MAX}`;
}
