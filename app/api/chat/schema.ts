/**
 * Request schema for chat transport payloads.
 * @module app/api/chat/schema
 */
import { z } from "zod";

const textPartSchema = z.object({
  type: z.literal("text"),
  text: z.string().min(1),
});

const filePartSchema = z.object({
  type: z.literal("file"),
  url: z.string().url(),
  filename: z.string().min(1).optional(),
  mediaType: z.string().min(1),
});

const userMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.literal("user"),
  parts: z.array(z.union([textPartSchema, filePartSchema])),
});

const continuationMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  parts: z.array(z.unknown()),
});

export const postRequestBodySchema = z.object({
  id: z.string().uuid(),
  message: userMessageSchema.optional(),
  messages: z.array(continuationMessageSchema).optional(),
  crmMode: z.enum(["normal", "setup"]).optional(),
});

export type PostRequestBody = z.infer<typeof postRequestBodySchema>;
