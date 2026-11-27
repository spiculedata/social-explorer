// Request-chosen sizes are clamped here before they reach SQL. A viewer can otherwise exhaust the
// database and Node memory with one request (unbounded LIMIT, a generate_series spanning millennia,
// or an ILIKE pattern of '%%' that matches every row).

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Clamps an integer query parameter between the given bounds. An unparsable value falls back to
 * the default rather than NaN reaching the database as a 500.
 */
export function clampInt(raw: string | null | undefined, fallback: number, min: number, max: number): number {
  const parsed = parseInt(raw ?? '', 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/** How many distinct keywords one investigation request may carry. */
export const MAX_KEYWORDS = 25;

/**
 * Keyword list as ILIKE patterns. Empty items are dropped (so `keywords=a,` never becomes `%%`,
 * which matches every row) and the count is capped.
 */
export function keywordPatterns(raw: string | null | undefined, max: number = MAX_KEYWORDS): string[] {
  return (raw ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0)
    .slice(0, max)
    .map((k) => `%${k}%`);
}

/** The investigation timeline buckets one row per day: wider spans are refused, not generated. */
export const MAX_DATE_SPAN_DAYS = 400;

/**
 * Checks the span of an investigation date range. Returns the error message to answer 400 with,
 * or null when the dates are absent or within the cap.
 */
export function dateSpanError(dateStart: string | null, dateEnd: string | null, maxDays: number = MAX_DATE_SPAN_DAYS): string | null {
  if (!dateStart || !dateEnd) return null;
  const start = Date.parse(dateStart);
  const end = Date.parse(dateEnd);
  if (Number.isNaN(start) || Number.isNaN(end)) return 'date_start and date_end must be dates (YYYY-MM-DD)';
  if (end - start > maxDays * MS_PER_DAY) return `date range must span at most ${maxDays} days`;
  return null;
}
