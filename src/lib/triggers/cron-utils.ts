/**
 * Cron expression parsing and UTC schedule computation helpers.
 * @module lib/triggers/cron-utils
 */
import { CronExpressionParser } from "cron-parser";

const EXPECTED_CRON_FIELDS = 5;
const UTC_TIMEZONE = "UTC";

function hasFiveCronFields(expression: string): boolean {
  return expression.trim().split(/\s+/).length === EXPECTED_CRON_FIELDS;
}

/**
 * Returns true when the expression is a supported 5-field cron expression.
 */
export function isValidCronExpression(expression: string): boolean {
  if (!expression.trim() || !hasFiveCronFields(expression)) {
    return false;
  }

  try {
    CronExpressionParser.parse(`0 ${expression}`, {
      currentDate: new Date().toISOString(),
      tz: UTC_TIMEZONE,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes the next fire time in UTC from a reference timestamp.
 */
export function computeNextFireAt(cronExpression: string, referenceTime: Date): Date {
  if (!hasFiveCronFields(cronExpression)) {
    throw new Error("Cron expression must contain exactly 5 fields.");
  }

  const interval = CronExpressionParser.parse(`0 ${cronExpression}`, {
    currentDate: referenceTime.toISOString(),
    tz: UTC_TIMEZONE,
  });

  return interval.next().toDate();
}
