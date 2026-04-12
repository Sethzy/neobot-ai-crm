/**
 * Shared runner run-type constants for persisted run observability.
 * @module lib/runner/run-types
 */

/** Canonical persisted run-type values across chat and triggers. */
export const runTypeValues = [
  "chat",
  "webhook",
  "cron",
  "autopilot",
] as const;

/** String literal union for persisted run-type values. */
export type RunType = (typeof runTypeValues)[number];
