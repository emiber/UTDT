import type { DatabaseSync } from 'node:sqlite';
import { LLM_STEPS, type LlmStep } from './conversations.ts';
import { costUsd, type Prices } from './prices.ts';

// The LLM usage report: what a period's calls took and cost, from llm_calls and their turns.
// Fixed queries only, no LLM involved, so the numbers are exact. Intervals are in the
// browser's local time: a turn at 23:30 counts for its local day, not the next UTC one.

export const GRANULARITIES = ['hour', 'day', 'week', 'month'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

/** Most intervals one report may have: a year by the hour is too many. */
export const MAX_BUCKETS = 1000;

/** How many turns the report lists, the most tokens first. */
export const TOP_TURNS = 10;

/** Largest UTC offset on Earth, in minutes (UTC+14). */
const MAX_TZ = 14 * 60;

export interface UsageFilters {
  /** First and last local day of the period, inclusive, as YYYY-MM-DD. */
  from: string;
  to: string;
  granularity: Granularity;
  /** Minutes to add to UTC for the browser's local time: -180 for UTC-3. */
  tz: number;
  model?: string;
  step?: LlmStep;
}

/** Filters the report can't use; the route answers them with a 400. */
export class UsageFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageFilterError';
  }
}

interface Amounts {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** null when none of the calls has a price. */
  costUsd: number | null;
}

interface Timings {
  /** Per call; null without calls. */
  avgMs: number | null;
  maxMs: number | null;
  /** Calls OpenAI reported no tokens for: they never got a response. */
  failedCalls: number;
}

export interface UsageTotals extends Amounts, Timings {
  turns: number;
  /** SQL attempts after the first. */
  sqlRetries: number;
}

export interface UsageBucket extends Amounts {
  /** Where the interval starts: `YYYY-MM-DD HH:00`, `YYYY-MM-DD` (a week, on its Monday) or `YYYY-MM`. */
  bucket: string;
  turns: number;
  /** Input plus output tokens, per step. */
  tokensByStep: Record<LlmStep, number>;
}

export interface UsageBreakdownRow extends Amounts, Timings {
  step: LlmStep;
  model: string;
}

export interface UsageTurn extends Amounts {
  turnId: number;
  /** When the turn was saved, in UTC (ISO 8601). */
  createdAt: string;
  question: string;
  /** All its calls together. */
  durationMs: number;
}

export interface UsageReport {
  filters: UsageFilters;
  /** Every model in llm_calls, whatever the filters: the choices for the model filter. */
  models: string[];
  /** Models of the period's calls with no price in OPENAI_PRICES: they add no cost. */
  unpricedModels: string[];
  totals: UsageTotals;
  /** Every interval of the period, in order, empty ones included. */
  series: UsageBucket[];
  breakdown: UsageBreakdownRow[];
  topTurns: UsageTurn[];
}

/** The local time of a turn, as SQLite sees it. `$tz` is a modifier like `-180 minutes`. */
const LOCAL_TIME = 'datetime(t.created_at, $tz)';

const BUCKET_SQL: Record<Granularity, string> = {
  hour: `strftime('%Y-%m-%d %H:00', ${LOCAL_TIME})`,
  day: `date(${LOCAL_TIME})`,
  // Back 6 days, then forward to a Monday: the Monday that starts the week.
  week: `date(${LOCAL_TIME}, '-6 days', 'weekday 1')`,
  month: `strftime('%Y-%m', ${LOCAL_TIME})`,
};

const FROM_WHERE = `
  FROM llm_calls c JOIN turns t ON t.id = c.turn_id
  WHERE date(${LOCAL_TIME}) BETWEEN $from AND $to
    AND ($model IS NULL OR c.model = $model)
    AND ($step IS NULL OR c.step = $step)`;

/** One query row: the calls of one model in one step and interval. */
interface Group {
  bucket: string;
  step: LlmStep;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalMs: number;
  maxMs: number;
  failedCalls: number;
  sqlRetries: number;
}

/** One query row: a turn's calls to one model. */
interface TurnGroup {
  turnId: number;
  createdAt: string;
  question: string;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalMs: number;
}

/**
 * Builds the usage report of a period. Throws a UsageFilterError for an invalid date or
 * offset, a period that ends before it starts, or one with more than MAX_BUCKETS intervals.
 */
export function buildUsageReport(
  db: DatabaseSync,
  filters: UsageFilters,
  prices: Prices,
): UsageReport {
  const intervals = listBuckets(filters);
  const params = {
    tz: `${filters.tz >= 0 ? '+' : ''}${filters.tz} minutes`,
    from: filters.from,
    to: filters.to,
    model: filters.model ?? null,
    step: filters.step ?? null,
  };
  const bucket = BUCKET_SQL[filters.granularity];
  const sums = `COUNT(*) AS calls,
    COALESCE(SUM(c.input_tokens), 0) AS inputTokens,
    COALESCE(SUM(c.output_tokens), 0) AS outputTokens,
    SUM(c.duration_ms) AS totalMs`;

  const groups = db
    .prepare(
      `SELECT ${bucket} AS bucket, c.step AS step, c.model AS model, ${sums},
         MAX(c.duration_ms) AS maxMs,
         SUM(c.input_tokens IS NULL) AS failedCalls,
         SUM(c.step = 'sql' AND c.attempt > 1) AS sqlRetries
       ${FROM_WHERE}
       GROUP BY 1, 2, 3`,
    )
    .all(params) as unknown as Group[];
  // A turn falls in a single interval, so turns per interval add up to the period's turns.
  const turnsPerBucket = new Map(
    (
      db
        .prepare(
          `SELECT ${bucket} AS bucket, COUNT(DISTINCT c.turn_id) AS turns ${FROM_WHERE} GROUP BY 1`,
        )
        .all(params) as { bucket: string; turns: number }[]
    ).map((row) => [row.bucket, row.turns]),
  );
  const turnGroups = db
    .prepare(
      `SELECT c.turn_id AS turnId, t.created_at AS createdAt, t.question AS question,
         c.model AS model, ${sums}
       ${FROM_WHERE}
       GROUP BY c.turn_id, c.model`,
    )
    .all(params) as unknown as TurnGroup[];
  const models = (
    db.prepare('SELECT DISTINCT model FROM llm_calls ORDER BY model').all() as { model: string }[]
  ).map((row) => row.model);

  const cost = (g: { model: string; inputTokens: number; outputTokens: number }) =>
    costUsd(prices, g.model, g.inputTokens, g.outputTokens);

  const totals = {
    ...emptyAmounts(),
    turns: 0,
    totalMs: 0,
    maxMs: 0,
    failedCalls: 0,
    sqlRetries: 0,
  };
  const series = new Map(
    intervals.map((b) => [
      b,
      {
        bucket: b,
        ...emptyAmounts(),
        turns: turnsPerBucket.get(b) ?? 0,
        tokensByStep: emptySteps(),
      },
    ]),
  );
  type BreakdownSums = Omit<UsageBreakdownRow, 'avgMs' | 'maxMs'> & {
    totalMs: number;
    maxMs: number;
  };
  const breakdown = new Map<string, BreakdownSums>();
  for (const g of groups) {
    const groupCost = cost(g);
    addAmounts(totals, g, groupCost);
    totals.totalMs += g.totalMs;
    totals.maxMs = Math.max(totals.maxMs, g.maxMs);
    totals.failedCalls += g.failedCalls;
    totals.sqlRetries += g.sqlRetries;

    const interval = series.get(g.bucket)!;
    addAmounts(interval, g, groupCost);
    interval.tokensByStep[g.step] += g.inputTokens + g.outputTokens;

    const key = `${g.step}\u0000${g.model}`;
    const row = breakdown.get(key) ?? {
      step: g.step,
      model: g.model,
      ...emptyAmounts(),
      totalMs: 0,
      maxMs: 0,
      failedCalls: 0,
    };
    addAmounts(row, g, groupCost);
    row.totalMs += g.totalMs;
    row.maxMs = Math.max(row.maxMs, g.maxMs);
    row.failedCalls += g.failedCalls;
    breakdown.set(key, row);
  }
  totals.turns = [...series.values()].reduce((sum, b) => sum + b.turns, 0);

  const turns = new Map<number, UsageTurn>();
  for (const g of turnGroups) {
    const turn = turns.get(g.turnId) ?? {
      turnId: g.turnId,
      createdAt: g.createdAt,
      question: g.question,
      ...emptyAmounts(),
      durationMs: 0,
    };
    addAmounts(turn, g, cost(g));
    turn.durationMs += g.totalMs;
    turns.set(g.turnId, turn);
  }

  const { totalMs, maxMs, ...totalAmounts } = totals;
  return {
    filters,
    models,
    unpricedModels: [...new Set(groups.map((g) => g.model))].filter((m) => !prices.has(m)).sort(),
    totals: { ...totalAmounts, ...timings(totals.calls, totalMs, maxMs) },
    series: [...series.values()],
    breakdown: [...breakdown.values()]
      .sort(
        (a, b) =>
          LLM_STEPS.indexOf(a.step) - LLM_STEPS.indexOf(b.step) || a.model.localeCompare(b.model),
      )
      .map(({ totalMs: ms, maxMs: max, ...row }) => ({ ...row, ...timings(row.calls, ms, max) })),
    topTurns: [...turns.values()]
      .sort((a, b) => tokens(b) - tokens(a) || b.turnId - a.turnId)
      .slice(0, TOP_TURNS),
  };
}

const emptyAmounts = (): Amounts => ({ calls: 0, inputTokens: 0, outputTokens: 0, costUsd: null });

const emptySteps = () =>
  Object.fromEntries(LLM_STEPS.map((step) => [step, 0])) as Record<LlmStep, number>;

const tokens = (a: Amounts) => a.inputTokens + a.outputTokens;

/** Adds a group's calls and tokens; its cost counts only when it has one. */
function addAmounts(
  target: Amounts,
  group: Amounts | Omit<Amounts, 'costUsd'>,
  cost: number | null,
) {
  target.calls += group.calls;
  target.inputTokens += group.inputTokens;
  target.outputTokens += group.outputTokens;
  // Rounded to 1e-8 USD: well below a cent, and without float noise like 0.0024000000000000002.
  if (cost !== null) target.costUsd = Math.round(((target.costUsd ?? 0) + cost) * 1e8) / 1e8;
}

function timings(calls: number, totalMs: number, maxMs: number) {
  return calls ? { avgMs: Math.round(totalMs / calls), maxMs } : { avgMs: null, maxMs: null };
}

const DAY_MS = 86_400_000;

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Midnight UTC of a YYYY-MM-DD day; throws if it isn't a real date. */
function parseDay(name: string, value: string): number {
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms) || isoDay(ms) !== value) {
    throw new UsageFilterError(`${name} is not a valid date: ${value}.`);
  }
  return ms;
}

/** Every interval of the period, in order, with the same keys BUCKET_SQL produces. */
function listBuckets({ from, to, granularity, tz }: UsageFilters): string[] {
  if (!Number.isInteger(tz) || Math.abs(tz) > MAX_TZ) {
    throw new UsageFilterError(
      `tz must be a whole number of minutes from -${MAX_TZ} to ${MAX_TZ}.`,
    );
  }
  const start = parseDay('from', from);
  const end = parseDay('to', to);
  if (start > end) throw new UsageFilterError('from must not be after to.');

  const buckets: string[] = [];
  const add = (bucket: string) => {
    if (buckets.length === MAX_BUCKETS) {
      throw new UsageFilterError(
        `The period has more than ${MAX_BUCKETS} intervals: shorten it or pick a coarser granularity.`,
      );
    }
    buckets.push(bucket);
  };
  if (granularity === 'month') {
    // Months as numbers: `YYYY-MM` strings would stop comparing right after year 9999.
    const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
    for (let m = monthIndex(from); m <= monthIndex(to); m++) {
      add(`${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`);
    }
    return buckets;
  }
  // A week starts on the Monday on or before `from`.
  const weekday = (new Date(start).getUTCDay() + 6) % 7;
  const first = granularity === 'week' ? start - weekday * DAY_MS : start;
  const step = granularity === 'week' ? 7 * DAY_MS : DAY_MS;
  for (let day = first; day <= end; day += step) {
    if (granularity !== 'hour') {
      add(isoDay(day));
      continue;
    }
    for (let hour = 0; hour < 24; hour++) add(`${isoDay(day)} ${String(hour).padStart(2, '0')}:00`);
  }
  return buckets;
}
