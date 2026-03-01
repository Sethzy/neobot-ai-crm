/**
 * Shared schemas for runner input/output and tool envelopes.
 * @module lib/runner/schemas
 */
import { z } from "zod";

/** Supported invocation sources for runAgent. */
export const triggerTypeValues = ["chat", "webhook", "cron", "pulse"] as const;

export const runnerPayloadSchema = z.object({
  clientId: z.string().uuid(),
  threadId: z.string().uuid(),
  triggerType: z.enum(triggerTypeValues),
  input: z.string(),
});

export const toolResultEnvelopeSchema = z.object({
  success: z.boolean(),
  data: z.unknown().nullable(),
  error: z.string().nullable(),
  source: z.string().min(1),
});

export const runResultSchema = z.object({
  runId: z.string().uuid(),
  status: z.enum(["completed", "partial", "failed", "cancelled"]),
  model: z.string().min(1),
  tokensIn: z.number().int().nonnegative(),
  tokensOut: z.number().int().nonnegative(),
});

export type RunnerPayload = z.infer<typeof runnerPayloadSchema>;
export type ToolResultEnvelope = z.infer<typeof toolResultEnvelopeSchema>;
export type RunResult = z.infer<typeof runResultSchema>;
