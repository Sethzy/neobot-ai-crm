/**
 * Shared RSS polling schedule helpers.
 * @module lib/triggers/rss-schedule
 */

export const DEFAULT_RSS_POLLING_INTERVAL_MINUTES = 60;

export const RSS_INTERVAL_TO_CRON = {
  15: "*/15 * * * *",
  30: "*/30 * * * *",
  60: "0 * * * *",
  360: "0 */6 * * *",
  1440: "0 0 * * *",
} as const;

/**
 * Derives the canonical cron expression for supported RSS polling intervals.
 */
export function deriveRssCronExpression(pollingIntervalMinutes: number): string | null {
  return RSS_INTERVAL_TO_CRON[pollingIntervalMinutes as keyof typeof RSS_INTERVAL_TO_CRON] ?? null;
}
