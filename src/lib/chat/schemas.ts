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

const reasoningPartSchema = z.object({
  type: z.literal("reasoning"),
  text: z.string(),
});

const filePartSchema = z.object({
  type: z.literal("file"),
  mediaType: z.string().min(1),
  url: z.string().min(1),
  filename: z.string().optional(),
});

const stepStartPartSchema = z.object({
  type: z.literal("step-start"),
});

/** Shared fields for typed and dynamic tool part schemas. */
const toolPartBaseFields = {
  toolCallId: z.string().min(1),
  state: z.enum([
    "input-streaming",
    "input-available",
    "approval-requested",
    "approval-responded",
    "output-available",
    "output-error",
    "output-denied",
  ]),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  errorText: z.string().optional(),
  providerExecuted: z.boolean().optional(),
  preliminary: z.boolean().optional(),
  title: z.string().optional(),
  approval: z
    .object({
      id: z.string(),
      approved: z.boolean().optional(),
      reason: z.string().optional(),
    })
    .optional(),
};

const typedToolPartSchema = z.object({
  type: z.string().startsWith("tool-"),
  ...toolPartBaseFields,
});

const dynamicToolPartSchema = z.object({
  type: z.literal("dynamic-tool"),
  toolName: z.string().min(1),
  ...toolPartBaseFields,
});

const dataPartSchema = z.object({
  type: z.string().startsWith("data-"),
  data: z.unknown(),
  id: z.string().optional(),
});

const messagePartSchema = z.union([
  textPartSchema,
  reasoningPartSchema,
  filePartSchema,
  stepStartPartSchema,
  typedToolPartSchema,
  dynamicToolPartSchema,
  dataPartSchema,
]);

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
