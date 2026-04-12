/**
 * Builds cron expressions from UI schedule controls.
 * @module lib/triggers/cron-builder
 */

export type Recurrence = "daily" | "weekdays" | "weekly" | "monthly" | "custom";

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
