/**
 * Quiet-hours helpers for autopilot pulse suppression.
 * @module lib/autopilot/quiet-hours
 */

const DEFAULT_TIMEZONE = "Asia/Singapore";

export interface IsInQuietHoursInput {
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  now: Date;
  timezone?: string;
}

function parseTimeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map((part) => Number.parseInt(part, 10));
  return (hours * 60) + minutes;
}

function getCurrentMinutesInTimezone(now: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const hour = Number.parseInt(parts.find((part) => part.type === "hour")?.value ?? "0", 10);
  const minute = Number.parseInt(parts.find((part) => part.type === "minute")?.value ?? "0", 10);

  return (hour * 60) + minute;
}

/**
 * Returns whether `now` falls within the configured quiet-hours window.
 * Start is inclusive, end is exclusive.
 */
export function isInQuietHours({
  quietHoursStart,
  quietHoursEnd,
  now,
  timezone = DEFAULT_TIMEZONE,
}: IsInQuietHoursInput): boolean {
  if (quietHoursStart === null || quietHoursEnd === null) {
    return false;
  }

  const startMinutes = parseTimeToMinutes(quietHoursStart);
  const endMinutes = parseTimeToMinutes(quietHoursEnd);
  const currentMinutes = getCurrentMinutesInTimezone(now, timezone);

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}
