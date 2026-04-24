/**
 * Builds cron expressions from UI schedule controls and infers a UI
 * preset back from a stored 5-field cron expression.
 * @module lib/triggers/cron-builder
 */

export type Recurrence = "daily" | "weekdays" | "weekly" | "monthly" | "custom";

const PLAIN_INT_RE = /^\d+$/;
const WEEKLY_DOW_RE = /^[\d,-]+$/;

/**
 * Converts UI schedule inputs to a 5-field cron expression.
 * @param recurrence - Schedule type
 * @param days - Day-of-week numbers (0=Sun, 1=Mon, ..., 6=Sat) for weekly
 * @param time - HH:mm format (e.g., "08:00", "14:30")
 * @param customCron - Raw cron for "custom" recurrence
 */
export function buildCronExpression(
  recurrence: Recurrence,
  days: number[],
  time: string,
  customCron?: string,
): string {
  if (recurrence === "custom" && customCron) {
    return customCron;
  }

  const [hourStr, minuteStr] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const minute = parseInt(minuteStr, 10);

  switch (recurrence) {
    case "daily":
      return `${minute} ${hour} * * *`;
    case "weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "weekly":
      return `${minute} ${hour} * * ${days.length > 0 ? days.join(",") : "0-6"}`;
    case "monthly":
      return `${minute} ${hour} 1 * *`;
    default:
      return `${minute} ${hour} * * *`;
  }
}

/**
 * Infers a UI recurrence preset from a stored 5-field cron expression.
 *
 * Parses the cron fields explicitly rather than substring-matching the raw
 * string — substring checks would misclassify weekly crons whose hour
 * happens to contain "1" (e.g. `0 1 * * 0-6`, `0 11 * * 0-6`) as monthly.
 */
export function inferRecurrence(cron: string | null | undefined): Recurrence {
  if (!cron) return "daily";
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "custom";

  const [minute, hour, dom, month, dow] = parts;

  if (!PLAIN_INT_RE.test(minute) || !PLAIN_INT_RE.test(hour)) return "custom";
  if (month !== "*") return "custom";

  if (dom === "*" && dow === "*") return "daily";
  if (dom === "*" && dow === "1-5") return "weekdays";
  if (dom === "1" && dow === "*") return "monthly";
  if (dom === "*" && WEEKLY_DOW_RE.test(dow)) return "weekly";

  return "custom";
}
