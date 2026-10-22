import { auth, rejectKey } from './auth.ts';

/** A failed API call. `status` is the HTTP status, so callers can show it or branch on it. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * The single way to call `/api/*`: it sends the access key and handles a rejected one.
 * On a 401 it forgets the key (the app goes back to the key screen) and rejects, so
 * callers never handle a 401 themselves. Any other non-2xx rejects with an ApiError.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const sentKey = auth.key;
  const headers = new Headers(init.headers);
  if (sentKey) {
    try {
      headers.set('Authorization', `Bearer ${sentKey}`);
    } catch (error) {
      // A key that can't travel in a header (e.g. it has '€') can never be valid.
      rejectKey();
      throw error;
    }
  }

  const res = await fetch(path, { ...init, headers });
  // A late 401 for a key the user has already replaced must not wipe the new one.
  if (res.status === 401 && auth.key === sentKey) rejectKey();
  if (!res.ok) throw new ApiError(res.status);
  return res;
}

export interface Health {
  status: string;
  sqliteVersion: string;
}

export async function getHealth(): Promise<Health> {
  const res = await apiFetch('/api/health');
  return (await res.json()) as Health;
}

/** The data the bot knows about, as `GET /api/catalog` returns it. */
export interface Catalog {
  tables: {
    name: string;
    description: string;
    columns: { name: string; dataType: string; description: string }[];
    indexes: { name: string; unique: boolean; columns: string[] }[];
  }[];
  relationships: {
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    description: string;
  }[];
}

export async function getCatalog(): Promise<Catalog> {
  const res = await apiFetch('/api/catalog');
  return (await res.json()) as Catalog;
}

/** A chart built by the backend from the real rows, ready for Chart.js. */
export interface ChartBlock {
  type: 'chart';
  chartType: 'bar' | 'line' | 'pie' | 'doughnut';
  title: string;
  labels: string[];
  datasets: { label: string; data: (number | null)[] }[];
}

/** A response block of the chat, rendered in order. */
export type Block =
  | { type: 'text'; markdown: string }
  | { type: 'table'; columns: string[]; rows: (string | number | null)[][] }
  | ChartBlock;

export interface ChatResponse {
  conversationId: string;
  turnId: number;
  blocks: Block[];
  suggestions: string[];
}

/**
 * How long the UI waits for an answer before giving up. A safety net, not the normal wait:
 * it's above the backend's worst case (about 5 OpenAI calls in series × 2 attempts × 30 s
 * = 300 s), so it practically never cuts an answer that can still arrive.
 */
export const CHAT_TIMEOUT_MS = 360_000;

/**
 * Asks a question; without a `conversationId` the backend starts a new conversation. Past
 * CHAT_TIMEOUT_MS it rejects with a `TimeoutError` DOMException.
 */
export async function postChat(body: {
  question: string;
  conversationId?: string;
}): Promise<ChatResponse> {
  const res = await apiFetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
  });
  return (await res.json()) as ChatResponse;
}

export const GRANULARITIES = ['hour', 'day', 'week', 'month'] as const;
export type Granularity = (typeof GRANULARITIES)[number];

/** The pipeline steps an LLM call belongs to: `answer` is the insights or the text reply. */
export const LLM_STEPS = ['classify', 'sql', 'answer'] as const;
export type LlmStep = (typeof LLM_STEPS)[number];

export interface UsageFilters {
  /** First and last local day, inclusive, as YYYY-MM-DD. */
  from: string;
  to: string;
  granularity: Granularity;
  model?: string;
  step?: LlmStep;
}

interface UsageAmounts {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** null when none of the calls has a price. */
  costUsd: number | null;
}

interface UsageTimings {
  avgMs: number | null;
  maxMs: number | null;
  failedCalls: number;
}

/** The LLM usage report, as `GET /api/usage` returns it. */
export interface UsageReport {
  models: string[];
  unpricedModels: string[];
  totals: UsageAmounts & UsageTimings & { turns: number; sqlRetries: number };
  series: (UsageAmounts & {
    bucket: string;
    turns: number;
    tokensByStep: Record<LlmStep, number>;
  })[];
  breakdown: (UsageAmounts & UsageTimings & { step: LlmStep; model: string })[];
  topTurns: (UsageAmounts & {
    turnId: number;
    createdAt: string;
    question: string;
    durationMs: number;
  })[];
}

/** The LLM usage report of a period, with days and hours in the browser's time zone. */
export async function getUsage(filters: UsageFilters): Promise<UsageReport> {
  const params = new URLSearchParams({
    from: filters.from,
    to: filters.to,
    granularity: filters.granularity,
    // getTimezoneOffset is UTC minus local time; the API wants local minus UTC.
    tz: String(-new Date().getTimezoneOffset()),
  });
  if (filters.model) params.set('model', filters.model);
  if (filters.step) params.set('step', filters.step);
  const res = await apiFetch(`/api/usage?${params}`);
  return (await res.json()) as UsageReport;
}
