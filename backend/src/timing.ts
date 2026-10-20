/** Milliseconds since `started` (a `performance.now()` value), rounded, for step logs. */
export function elapsed(started: number): number {
  return Math.round(performance.now() - started);
}
