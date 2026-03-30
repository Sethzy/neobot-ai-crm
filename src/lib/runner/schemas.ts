/**
 * Shared schemas for runner input/output and tool envelopes.
 * @module lib/runner/schemas
 */
import { z } from "zod";

/** Supported invocation sources for runAgent. */
export const triggerTypeValues = ["chat", "webhook", "cron", "pulse"] as const;
/** Supported delivery channels for queued chat work. */
export const runnerChannelValues = ["web", "telegram", "whatsapp"] as const;

export const runnerFilePartSchema = z.object({
  type: z.literal("file"),
  filename: z.string().min(1).optional(),
  mediaType: z.string().min(1),
  url: z.string().min(1),
});

export const runnerPayloadSchema = z.object({
  clientId: z.string().uuid(),
  threadId: z.string().uuid(),
  triggerType: z.enum(triggerTypeValues),
  consumeMessageQuota: z.boolean().optional(),
  input: z.string(),
  selectedChatModel: z.string().optional(),
  channel: z.enum(runnerChannelValues).optional(),
  fileParts: z.array(runnerFilePartSchema).optional(),
  crmMode: z.enum(["normal", "setup"]).optional(),
  includeConfigTool: z.boolean().optional(),
  instructions: z.string().optional(),
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
export type RunnerFilePart = z.infer<typeof runnerFilePartSchema>;
export type ToolResultEnvelope = z.infer<typeof toolResultEnvelopeSchema>;
export type RunResult = z.infer<typeof runResultSchema>;
