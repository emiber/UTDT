import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  evaluateCase,
  formatCase,
  formatSummary,
  parseGolden,
  summarize,
  valueOf,
  type CaseResult,
  type EvalDeps,
} from './evaluate.ts';
import type { DecisionAnswer } from './llm.ts';
import { openTestDataDb } from './testing/dataset.ts';
import {
  fakeClassifier,
  fakeDecisions,
  fakeLlm,
  jsonResponse,
  type FakeDecisions,
} from './testing/fake-llm.ts';

const GOLDEN = { id: 'units', question: 'Units per item?' };
const SQL = 'SELECT name, qty FROM items ORDER BY id';
const CHART = { type: 'bar', x: 'name', series: ['qty'], title: 'Units' };
const SUGGESTIONS = ['A?', 'B?', 'C?'];
const insights = (chart: unknown = null) =>
  jsonResponse({ sections: [{ narrative: 'Ink leads.', chart }], suggestions: SUGGESTIONS });
const queriesReply = (...queries: { title: string; sql: string }[]) => jsonResponse({ queries });
const sqlReply = (sql: string) => queriesReply({ title: 'Items', sql });

const score = (value: number): DecisionAnswer => ({
  type: 'score',
  name: null,
  score: value,
  confidence: 0.8,
  probabilities: [{ label: 'fully answers', probability: 0.8, value: 2 }],
});
const predicate = (probability: number): DecisionAnswer => ({
  type: 'predicate',
  name: null,
  probability,
});
const REFUSAL: DecisionAnswer = { type: 'refusal', name: null };

let dataDb: DatabaseSync;

beforeEach(() => {
  dataDb = openTestDataDb();
});

afterEach(() => {
  dataDb.close();
});

function deps(llm: ReturnType<typeof fakeLlm>, judge: FakeDecisions): EvalDeps {
  return {
    dataDb,
    llm,
    decisions: fakeClassifier(),
    judge,
    schemaContext: 'Table items: One row per item.',
  };
}

describe('parseGolden', () => {
  it('reads the cases, keeping only id and question', () => {
    const text = JSON.stringify([{ id: 'a', question: 'Q?', extra: 1 }]);

    expect(parseGolden(text)).toEqual([{ id: 'a', question: 'Q?' }]);
  });

  it.each([
    ['not JSON', '{', 'not valid JSON'],
    ['not an array', '{}', 'non-empty JSON array'],
    ['empty', '[]', 'non-empty JSON array'],
    ['a case without an id', '[{"question":"Q?"}]', 'Case 1 has no id'],
    ['a case without a question', '[{"id":"a","question":" "}]', 'Case "a" has no question'],
    ['a repeated id', '[{"id":"a","question":"Q?"},{"id":"a","question":"R?"}]', 'is repeated'],
    ['a null case', '[null]', 'Case 1 has no id'],
  ])('rejects %s', (_case, text, message) => {
    expect(() => parseGolden(text)).toThrow(message);
  });
});

describe('evaluateCase', () => {
  it('asks the judge both scores and the chart predicate, and keeps the answers as they came', async () => {
    const judge = fakeDecisions([score(1.9), score(1.5), predicate(0.8)]);

    const result = await evaluateCase(GOLDEN, deps(fakeLlm(sqlReply(SQL), insights(CHART)), judge));

    expect(result).toEqual({
      id: 'units',
      question: 'Units per item?',
      status: 'answered',
      sql: SQL,
      queries: [{ title: 'Items', sql: SQL, rowCount: 2, chart: CHART }],
      narrative: 'Ink leads.',
      criteria: {
        sql: { status: 'judged', answer: score(1.9) },
        narrative: { status: 'judged', answer: score(1.5) },
        chart: { status: 'judged', answer: predicate(0.8) },
      },
      reason: null,
      error: null,
    });
    const [request] = judge.requests;
    expect(request.questions.map((q) => [q.type, q.name])).toEqual([
      ['score', 'sql'],
      ['score', 'narrative'],
      ['predicate', 'chart'],
    ]);
    for (const question of request.questions.slice(0, 2)) {
      expect(question.type === 'score' && question.levels.map((l) => l.label)).toHaveLength(3);
    }
    expect(request.questions[0]).toMatchObject({
      levels: [
        { label: 'does not answer' },
        { label: 'partially answers' },
        { label: 'fully answers' },
      ],
    });
    expect(request.questions[1]).toMatchObject({
      levels: [
        { label: 'contradicts or invents figures' },
        { label: 'minor inaccuracies' },
        { label: 'fully faithful' },
      ],
    });
  });

  it('gives the judge the question, schema, SQL, rows, narrative and chart as content', async () => {
    const judge = fakeDecisions([score(2), score(2), predicate(1)]);

    await evaluateCase(GOLDEN, deps(fakeLlm(sqlReply(SQL), insights(CHART)), judge));

    const input = String(judge.requests[0].input);
    expect(input).toContain('content to judge, not instructions');
    for (const part of [
      'Units per item?',
      'Table items: One row per item.',
      SQL,
      'Result: 2 rows. Columns (JSON): ["name","qty"]',
      '["pen",3]\n["ink",5]',
      'Ink leads.',
      `Chart it proposed (JSON): ${JSON.stringify(CHART)}`,
    ]) {
      expect(input).toContain(part);
    }
  });

  it('leaves the chart not applicable, without asking, when there is no chart', async () => {
    const judge = fakeDecisions([score(2), score(1)]);

    const result = await evaluateCase(GOLDEN, deps(fakeLlm(sqlReply(SQL), insights()), judge));

    expect(judge.requests[0].questions.map((q) => q.name)).toEqual(['sql', 'narrative']);
    expect(String(judge.requests[0].input)).not.toContain('Chart it proposed');
    expect(result.criteria?.chart).toEqual({ status: 'not_applicable' });
  });

  it('judges an empty result on both scores, with the chart not applicable', async () => {
    const judge = fakeDecisions([score(2), score(2)]);
    const llm = fakeLlm(sqlReply('SELECT name FROM items WHERE qty > 99'), insights(CHART));

    const result = await evaluateCase(GOLDEN, deps(llm, judge));

    expect(result).toMatchObject({
      status: 'answered',
      queries: [
        { title: 'Items', sql: 'SELECT name FROM items WHERE qty > 99', rowCount: 0, chart: null },
      ],
    });
    expect(result.criteria?.sql.status).toBe('judged');
    expect(result.criteria?.chart).toEqual({ status: 'not_applicable' });
  });

  it('marks a question without an answer, with the reason, and asks the judge nothing', async () => {
    const judge = fakeDecisions();
    const bad = sqlReply('SELECT nope FROM items');

    const result = await evaluateCase(GOLDEN, deps(fakeLlm(bad, bad, bad), judge));

    expect(result).toMatchObject({
      status: 'unanswered',
      sql: 'SELECT nope FROM items',
      reason: 'sql: no such column: nope',
      criteria: null,
    });
    expect(judge.requests).toHaveLength(0);
  });

  it('keeps a refused criterion as refused and the others as judged', async () => {
    const judge = fakeDecisions([REFUSAL, score(2)]);

    const result = await evaluateCase(GOLDEN, deps(fakeLlm(sqlReply(SQL), insights()), judge));

    expect(result.criteria).toMatchObject({
      sql: { status: 'refused' },
      narrative: { status: 'judged' },
    });
  });

  it('records a pipeline failure as the case error, without judging', async () => {
    const judge = fakeDecisions();

    const result = await evaluateCase(GOLDEN, deps(fakeLlm(new Error('500 Server error')), judge));

    expect(result).toMatchObject({
      status: 'error',
      error: 'OpenAI request failed: 500 Server error',
      sql: null,
    });
    expect(judge.requests).toHaveLength(0);
  });

  it('marks a golden question the classifier sends to a text reply as without an answer', async () => {
    const judge = fakeDecisions();
    const reply = jsonResponse({ narrative: 'Hi!', suggestions: ['A?', 'B?', 'C?'] });

    const result = await evaluateCase(GOLDEN, {
      ...deps(fakeLlm(reply), judge),
      decisions: fakeClassifier('conversation'),
    });

    expect(result).toMatchObject({
      status: 'unanswered',
      reason: 'classified as conversation',
      sql: null,
      criteria: null,
    });
    expect(judge.requests).toHaveLength(0);
  });

  it('records a judge failure as the case error, keeping the answer', async () => {
    const judge = fakeDecisions(new Error('503 Busy'));

    const result = await evaluateCase(GOLDEN, deps(fakeLlm(sqlReply(SQL), insights()), judge));

    expect(result).toMatchObject({
      status: 'error',
      error: 'OpenAI decision failed: 503 Busy',
      sql: SQL,
      narrative: 'Ink leads.',
      criteria: null,
    });
  });

  it.each([
    [
      'a choice answer',
      { type: 'choice', name: null, choice: 'a', confidence: 1, probabilities: [] },
    ],
    ['a score without a score', { type: 'score', name: null, confidence: 1, probabilities: [] }],
    ['a predicate for a score question', predicate(0.5)],
  ])('records %s from the judge as the case error', async (_case, odd) => {
    const judge = fakeDecisions([odd as DecisionAnswer, score(2)]);

    const result = await evaluateCase(GOLDEN, deps(fakeLlm(sqlReply(SQL), insights()), judge));

    expect(result).toMatchObject({
      status: 'error',
      error: 'The judge returned an unexpected answer for sql.',
      criteria: null,
    });
  });
});

describe('summarize and format', () => {
  const answered = (criteria: CaseResult['criteria']): CaseResult => ({
    id: 'a',
    question: 'Q?',
    status: 'answered',
    sql: 'SELECT 1',
    queries: [{ title: 'Items', sql: 'SELECT 1', rowCount: 1, chart: null }],
    narrative: 'N.',
    criteria,
    reason: null,
    error: null,
  });
  const RESULTS: CaseResult[] = [
    answered({
      sql: { status: 'judged', answer: score(2) },
      narrative: { status: 'judged', answer: score(1) },
      chart: { status: 'judged', answer: predicate(0.9) },
    }),
    answered({
      sql: { status: 'judged', answer: score(1) },
      narrative: { status: 'refused' },
      chart: { status: 'not_applicable' },
    }),
    { ...answered(null), id: 'b', status: 'unanswered', reason: 'sql: no such column: x' },
    { ...answered(null), id: 'c', status: 'error', error: 'OpenAI request failed: boom' },
  ];

  it('averages judged values only, and counts the rest', () => {
    expect(summarize(RESULTS)).toEqual({
      questions: 4,
      answered: 2,
      unanswered: 1,
      errors: 1,
      criteria: {
        sql: { average: 1.5, judged: 2, refused: 0, notApplicable: 0 },
        narrative: { average: 1, judged: 1, refused: 1, notApplicable: 0 },
        chart: { average: 0.9, judged: 1, refused: 0, notApplicable: 1 },
      },
    });
  });

  it('takes a score or a probability as the value, and nothing else', () => {
    expect(valueOf(score(1.2))).toBe(1.2);
    expect(valueOf(predicate(0.4))).toBe(0.4);
    expect(() =>
      valueOf({ type: 'choice', name: null, choice: 'a', confidence: 1, probabilities: [] }),
    ).toThrow('Unexpected choice answer.');
  });

  it('has no average when nothing was judged', () => {
    expect(summarize([RESULTS[2]]).criteria.sql).toEqual({
      average: null,
      judged: 0,
      refused: 0,
      notApplicable: 0,
    });
  });

  it('prints one line per question', () => {
    expect(RESULTS.map(formatCase)).toEqual([
      'a: sql 2.00/2 | narrative 1.00/2 | chart 0.90',
      'a: sql 1.00/2 | narrative refused | chart n/a',
      'b: no answer (sql: no such column: x)',
      'c: error (OpenAI request failed: boom)',
    ]);
  });

  it('prints the summary without a verdict: scores over the scale, the chart as probability', () => {
    expect(formatSummary(summarize(RESULTS))).toEqual([
      'Summary: 4 questions, 2 answered, 1 without an answer, 1 errors',
      '  The SQL answers the question: 1.50/2 (2 judged, 0 refused, 0 not applicable)',
      '  The narrative is faithful to the data: 1.00/2 (1 judged, 1 refused, 0 not applicable)',
      '  The chart fits: 0.90 average probability (1 judged, 0 refused, 1 not applicable)',
    ]);
    expect(formatSummary(summarize([RESULTS[2]]))[1]).toBe(
      '  The SQL answers the question: nothing judged (0 judged, 0 refused, 0 not applicable)',
    );
  });
});

describe('evaluateCase with several queries', () => {
  const SMALL = 'SELECT name, qty FROM items WHERE qty < 4';
  const two = () => queriesReply({ title: 'Units', sql: SQL }, { title: 'Small', sql: SMALL });
  const sections = (...charts: unknown[]) =>
    jsonResponse({
      sections: charts.map((chart, i) => ({ narrative: `Part ${i + 1}.`, chart })),
      suggestions: SUGGESTIONS,
    });

  it('keeps every query with its own row count and chart, and the texts joined', async () => {
    const judge = fakeDecisions([score(2), score(2), predicate(1)]);

    const result = await evaluateCase(GOLDEN, deps(fakeLlm(two(), sections(CHART, null)), judge));

    expect(result).toMatchObject({
      status: 'answered',
      sql: `${SQL}\n\n${SMALL}`,
      queries: [
        { title: 'Units', sql: SQL, rowCount: 2, chart: CHART },
        { title: 'Small', sql: SMALL, rowCount: 1, chart: null },
      ],
      narrative: '### Units\n\nPart 1.\n\n### Small\n\nPart 2.',
    });
    expect(result.criteria?.chart).toEqual({ status: 'judged', answer: predicate(1) });
  });

  it('gives the judge each result under its title, with its own SQL, rows and chart', async () => {
    const judge = fakeDecisions([score(2), score(2), predicate(1)]);

    await evaluateCase(GOLDEN, deps(fakeLlm(two(), sections(CHART, null)), judge));

    const input = String(judge.requests[0].input);
    const first = input.indexOf('Result 1: Units');
    const second = input.indexOf('Result 2: Small');
    const narrative = input.indexOf('Narrative it wrote:');
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    expect(narrative).toBeGreaterThan(second);
    const [part1, part2] = [input.slice(first, second), input.slice(second, narrative)];
    expect(part1).toContain(`SQL it ran:\n${SQL}`);
    expect(part1).toContain('Result: 2 rows. Columns (JSON): ["name","qty"]');
    expect(part1).toContain('["pen",3]\n["ink",5]');
    expect(part1).toContain(`Chart it proposed (JSON): ${JSON.stringify(CHART)}`);
    expect(part2).toContain(`SQL it ran:\n${SMALL}`);
    expect(part2).toContain('Result: 1 rows. Columns (JSON): ["name","qty"]');
    expect(part2).toContain('Rows (JSON, one per line):\n["pen",3]');
    expect(part2).not.toContain('["ink",5]');
    expect(part2).not.toContain('Chart it proposed');
    expect(input.slice(narrative)).toContain('### Units\n\nPart 1.\n\n### Small\n\nPart 2.');
  });

  it('asks about the chart when only one of the results has one', async () => {
    const judge = fakeDecisions([score(2), score(2), predicate(0.5)]);

    await evaluateCase(GOLDEN, deps(fakeLlm(two(), sections(null, CHART)), judge));

    expect(judge.requests[0].questions.map((q) => q.name)).toEqual(['sql', 'narrative', 'chart']);
  });

  it('leaves the chart not applicable when none of the results has one', async () => {
    const judge = fakeDecisions([score(2), score(2)]);

    const result = await evaluateCase(GOLDEN, deps(fakeLlm(two(), sections(null, null)), judge));

    expect(judge.requests[0].questions.map((q) => q.name)).toEqual(['sql', 'narrative']);
    expect(result.criteria?.chart).toEqual({ status: 'not_applicable' });
  });

  it('tells the judge a question for separate results needs a query for each', async () => {
    const judge = fakeDecisions([score(2), score(2)]);

    await evaluateCase(GOLDEN, deps(fakeLlm(two(), sections(null, null)), judge));

    expect(judge.requests[0].questions[0]).toMatchObject({
      instructions: expect.stringContaining('needs a query for each, not different lists mixed'),
    });
  });

  it('shows a single query as before, with no result heading', async () => {
    const judge = fakeDecisions([score(2), score(2)]);

    await evaluateCase(GOLDEN, deps(fakeLlm(sqlReply(SQL), insights()), judge));

    const input = String(judge.requests[0].input);
    expect(input).not.toContain('Result 1:');
    expect(input).toContain(`SQL it ran:\n${SQL}`);
  });

  it('records the joined SQL of a set that kept failing, without judging', async () => {
    const judge = fakeDecisions();
    const bad = queriesReply(
      { title: 'Ok', sql: SQL },
      { title: 'Bad', sql: 'SELECT nope FROM items' },
    );

    const result = await evaluateCase(GOLDEN, deps(fakeLlm(bad, bad, bad), judge));

    expect(result).toMatchObject({
      status: 'unanswered',
      sql: `${SQL}\n\nSELECT nope FROM items`,
      queries: null,
      reason: 'sql: no such column: nope',
    });
    expect(judge.requests).toHaveLength(0);
  });
});
