/**
 * Autopilot prompt, scheduling constants, and config schemas.
 * @module lib/autopilot/constants
 */
import { z } from "zod";

/** Pinned thread title shown for the built-in autopilot conversation. */
export const AUTOPILOT_THREAD_TITLE = "Sunder Autopilot";

/** Default pulse schedule: every 6 hours. */
export const DEFAULT_PULSE_CRON = "0 */6 * * *";

/** Supported interval labels mapped to their cron expressions. */
export const PULSE_INTERVAL_MAP = {
  "1h": "0 * * * *",
  "2h": "0 */2 * * *",
  "6h": "0 */6 * * *",
  "12h": "0 */12 * * *",
} as const;

/** Supported pulse interval values persisted in `autopilot_config`. */
export const pulseIntervalValues = Object.keys(PULSE_INTERVAL_MAP) as Array<keyof typeof PULSE_INTERVAL_MAP>;

const quietHoursTimeSchema = z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/);

/**
 * Run-specific instructions for the autonomous autopilot pulse.
 * The prompt intentionally references only tools that exist today.
 */
export const AUTOPILOT_INSTRUCTION_PROMPT = `You are running an autonomous pulse in the client's dedicated autopilot thread.

MANDATORY BOOTSTRAP: You MUST call tools for live state before acting. Thread history is not current truth. Start by checking list_todo(), search_tasks(), and search_deals() before deciding what to do next.

Follow this priority order and work the highest-priority actionable item:
1. Resume interrupted internal work from list_todo() payloads.
2. Check overdue CRM tasks from search_tasks().
3. Review monitored CRM state using live tools such as search_deals() and run_agent_memory_sql() when needed.
4. Follow up on unanswered questions in this thread.
5. Handle stale CRM tasks that have sat open without progress.
6. Research or prepare for upcoming work.
7. If USER.md is sparse, ask one concise question to get to know the user better.
8. Engage the user with a useful nudge, pending approval reminder, or concrete insight.
9. Propose new CRM tasks with create_task() or internal follow-ups with manage_todo().
10. Create momentum by breaking stalled work into smaller next steps.

HARD RULES:
- Always do something. Never say "nothing to do."
- Always end with a concrete next action.
- Keep the update concise and actionable.

Avoid low-value pulses. If nothing urgent exists, focus on relationship building, preparation, or identifying the next useful task. Never produce filler.`;

/** Parsed shape of one `autopilot_config` row from Supabase. */
export const autopilotConfigSchema = z.object({
  config_id: z.string().uuid(),
  client_id: z.string().uuid(),
  pulse_interval: z.enum(pulseIntervalValues),
  quiet_hours_start: quietHoursTimeSchema.nullable(),
  quiet_hours_end: quietHoursTimeSchema.nullable(),
  enabled: z.boolean(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

export type AutopilotConfig = z.infer<typeof autopilotConfigSchema>;
