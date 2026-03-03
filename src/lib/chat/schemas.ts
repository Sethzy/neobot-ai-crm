/**
 * Zod schemas for chat persistence tables and related runtime constants.
 * @module lib/chat/schemas
 */
import { z } from "zod";

/** Canonical run statuses from RUNNER-08. */
export const runStatusValues = [
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "cancelled",
] as const;

/** Supported chat message roles aligned to AI SDK UI messages. */
export const messageRoleValues = ["system", "user", "assistant", "tool"] as const;

const isoDateTimeSchema = z.string().datetime({ offset: true });

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const toolCallPartSchema = z.object({
  type: z.literal("tool-call"),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  args: z.record(z.string(), z.unknown()),
});

const toolResultPartSchema = z.object({
  type: z.literal("tool-result"),
  toolCallId: z.string().min(1),
  toolName: z.string().min(1),
  result: z.unknown(),
});

const messagePartSchema = z.union([textPartSchema, toolCallPartSchema, toolResultPartSchema]);

export const clientSchema = z.object({
  client_id: z.string().uuid(),
  user_id: z.string().uuid(),
  display_name: z.string().nullable(),
  created_at: isoDateTimeSchema,
});

export const conversationThreadSchema = z.object({
  thread_id: z.string().uuid(),
  client_id: z.string().uuid(),
  title: z.string().nullable(),
  is_pinned: z.boolean(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export const conversationMessageSchema = z.object({
  message_id: z.string().uuid(),
  thread_id: z.string().uuid(),
  role: z.enum(messageRoleValues),
  content: z.string().nullable(),
  parts: z.array(messagePartSchema).nullable(),
  created_at: isoDateTimeSchema,
});

export const runSchema = z.object({
  run_id: z.string().uuid(),
  thread_id: z.string().uuid(),
  client_id: z.string().uuid(),
  status: z.enum(runStatusValues),
  model: z.string().nullable(),
  tokens_in: z.number().int().nonnegative().nullable(),
  tokens_out: z.number().int().nonnegative().nullable(),
  step_count: z.number().int().nonnegative().nullable(),
  created_at: isoDateTimeSchema,
  completed_at: isoDateTimeSchema.nullable(),
});

export type Client = z.infer<typeof clientSchema>;
export type ConversationThread = z.infer<typeof conversationThreadSchema>;
export type ConversationMessage = z.infer<typeof conversationMessageSchema>;
export type Run = z.infer<typeof runSchema>;
