/**
 * Human-readable cron descriptions and countdown formatting.
 * @module lib/triggers/cron-display
 */
import cronstrue from "cronstrue";

/**
 * Converts a 5-field cron expression to human-readable text.
 * Returns the raw expression on parse failure, "\u2014" for null/undefined.
 */
export function cronToHuman(cronExpression: string | null | undefined): string {
  if (!cronExpression) return "\u2014";

  try {
    return cronstrue.toString(cronExpression, { use24HourTimeFormat: false });
  } catch {
    return cronExpression;
  }
}

/**
 * Formats an ISO timestamp as a relative countdown: "in 18hr", "in 3d", "in 45min".
 * Returns "\u2014" for null/undefined or past timestamps.
 */
export function formatCountdown(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return "\u2014";

  const now = Date.now();
  const target = new Date(isoTimestamp).getTime();
  const diffMs = target - now;

  if (diffMs <= 0) return "\u2014";

  const diffMin = Math.floor(diffMs / (1000 * 60));
  const diffHr = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) return `in ${diffDays}d`;
  if (diffHr > 0) return `in ${diffHr}hr`;
  if (diffMin > 0) return `in ${diffMin}min`;
  return "in <1min";
}
