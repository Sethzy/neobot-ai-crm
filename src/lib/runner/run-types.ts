/**
 * Shared runner run-type constants for persisted run observability.
 * @module lib/runner/run-types
 */

/** Canonical persisted run-type values across chat, triggers, and subagents. */
export const runTypeValues = [
  "chat",
  "webhook",
  "cron",
  "autopilot",
  "subagent",
] as const;

/** String literal union for persisted run-type values. */
export type RunType = (typeof runTypeValues)[number];
