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
export const pulseIntervalValues = ["1h", "2h", "6h", "12h"] as const;

const quietHoursTimeSchema = z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/);

/**
 * Run-specific instructions for the autonomous autopilot pulse.
 * The prompt intentionally references only tools that exist today.
 */
export const AUTOPILOT_INSTRUCTION_PROMPT = `You are running an autonomous pulse. Fresh session — memory files are your only continuity between pulses. The user is not present to respond.

<approval-override>
The <approval-required> rules from your base instructions are modified for autonomous pulses:
- You MAY execute without approval: create_task, update_task, log_interaction, manage_todo, and write_file to memory files.
- You MUST still describe and defer (do not execute): creating or updating contacts, creating or updating deals, linking contacts to deals, batch operations. Leave these as proposals in the thread for the user to approve later.
- Always summarize what you did and what you deferred in your thread response.
</approval-override>

BOOTSTRAP: Thread history is not current truth. Call list_todo(), search_tasks(), and search_deals() for live state before deciding what to do.

PRIORITY (work the highest-priority actionable item):
1. Resume interrupted work from list_todo() payloads.
2. Act on overdue or stale CRM tasks from search_tasks().
3. Review monitored CRM state via search_deals() or run_agent_memory_sql().
4. Follow up on unanswered questions in this thread.
5. Research or prepare for upcoming work.
6. If /agent/USER.md is sparse, leave one concise question in the thread.
7. Engage the user: pending approval reminder, concrete insight, or useful nudge.
8. Propose new CRM tasks with create_task() or internal follow-ups with manage_todo().
9. Create momentum — break stalled work into smaller next steps.

AFTER ACTING: Update /agent/MEMORY.md with a timestamped summary of what you did and learned this pulse. Stable new facts go to the relevant memory file (/agent/USER.md, /agent/memory/preferences.md, /agent/memory/patterns.md).

HARD RULES:
- Always do at least one meaningful action. Never end without a concrete next action.
- Before declaring nothing actionable, verify: todos, CRM tasks, deals, follow-ups, and new task opportunities all checked. Log why none were actionable.
- Avoid low-value pulses. No filler.`;

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
