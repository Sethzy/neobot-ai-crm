/**
 * Cron expression parsing and UTC schedule computation helpers.
 * @module lib/triggers/cron-utils
 */
import { CronExpressionParser } from "cron-parser";

const EXPECTED_CRON_FIELDS = 5;
const UTC_TIMEZONE = "UTC";
const DEFAULT_TRIGGER_TIMEZONE = "Asia/Singapore";

/**
 * Explicit error used when a stored cron expression cannot be parsed safely.
 */
export class InvalidCronExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCronExpressionError";
  }
}

function hasFiveCronFields(expression: string): boolean {
  return expression.trim().split(/\s+/).length === EXPECTED_CRON_FIELDS;
}

/**
 * Returns true when the expression is a supported 5-field cron expression.
 */
export function isValidCronExpression(
  expression: string,
  timezone = UTC_TIMEZONE,
): boolean {
  if (!expression.trim() || !hasFiveCronFields(expression)) {
    return false;
  }

  try {
    CronExpressionParser.parse(`0 ${expression}`, {
      currentDate: new Date().toISOString(),
      tz: timezone,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Computes the next fire time in UTC from a reference timestamp.
 */
export function computeNextFireAt(
  cronExpression: string,
  referenceTime: Date,
  timezone = UTC_TIMEZONE,
): Date {
  if (!hasFiveCronFields(cronExpression)) {
    throw new InvalidCronExpressionError("Cron expression must contain exactly 5 fields.");
  }

  try {
    const interval = CronExpressionParser.parse(`0 ${cronExpression}`, {
      currentDate: referenceTime.toISOString(),
      tz: timezone,
    });

    return interval.next().toDate();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cron parser rejected expression.";
    throw new InvalidCronExpressionError(message);
  }
}

/**
 * Normalizes optional trigger timezones to the product default.
 */
export function normalizeTriggerTimezone(timezone: string | null | undefined): string {
  const trimmedTimezone = timezone?.trim();
  return trimmedTimezone && trimmedTimezone.length > 0
    ? trimmedTimezone
    : DEFAULT_TRIGGER_TIMEZONE;
}
