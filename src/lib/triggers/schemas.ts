/**
 * Zod schemas for trigger persistence, dispatch, and scan results.
 * @module lib/triggers/schemas
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

/** Typed Supabase client scoped to the trigger module. */
export type TriggerSupabaseClient = SupabaseClient<Database>;

const jsonObjectSchema = z.record(z.string(), z.unknown());

/** Supported trigger types for the `agent_triggers` table. */
export const triggerTypeValues = ["schedule", "webhook", "rss", "pulse"] as const;

/** Validates one `agent_triggers` row returned from Supabase. */
export const triggerRowSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  thread_id: z.string().uuid(),
  trigger_type: z.enum(triggerTypeValues),
  name: z.string().min(1),
  cron_expression: z.string().nullable(),
  instruction_path: z.string().min(1),
  payload: jsonObjectSchema,
  enabled: z.boolean(),
  current_run_id: z.string().uuid().nullable(),
  next_fire_at: z.string().datetime({ offset: true }).nullable(),
  last_fired_at: z.string().datetime({ offset: true }).nullable(),
  last_status: z.string().nullable(),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

/** Payload sent from the scanner to `/api/trigger/run`. */
export const triggerDispatchPayloadSchema = z.object({
  triggerId: z.string().uuid(),
  clientId: z.string().uuid(),
  threadId: z.string().uuid(),
  currentRunId: z.string().uuid(),
  triggerType: z.enum(triggerTypeValues),
  triggerName: z.string().min(1),
  instructionPath: z.string().min(1),
  triggerPayload: jsonObjectSchema.default({}),
  nextFireAt: z.string().datetime({ offset: true }).optional(),
});

/** Contract returned by one scanner tick. */
export const scanResultSchema = z.object({
  claimed: z.number().int().nonnegative(),
  dispatched: z.number().int().nonnegative(),
  staleReleased: z.number().int().nonnegative(),
  errors: z.array(z.string()),
});

export type TriggerRow = z.infer<typeof triggerRowSchema>;
export type TriggerDispatchPayload = z.infer<typeof triggerDispatchPayloadSchema>;
export type ScanResult = z.infer<typeof scanResultSchema>;
