/**
 * Zod schemas for persisted Composio connection metadata.
 * @module lib/connections/schemas
 */
import { z } from "zod";

export const connectionStatusValues = ["active", "inactive", "error", "pending"] as const;

/** Validates one `connections` table row returned from Supabase. */
export const connectionRowSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  composio_connected_account_id: z.string().min(1),
  toolkit_slug: z.string().min(1),
  display_name: z.string().nullable(),
  account_identifier: z.string().nullable().default(null),
  status: z.enum(connectionStatusValues),
  activated_tools: z.array(z.string()).default([]),
  tool_count: z.number().int().nonnegative().default(0),
  tool_schemas: z.record(z.string(), z.object({
    description: z.string().nullable(),
    inputParameters: z.unknown(),
  })).default({}),
  created_at: z.string().datetime({ offset: true }),
  updated_at: z.string().datetime({ offset: true }),
});

/** Validates the payload persisted after a successful OAuth callback. */
export const connectionInsertSchema = connectionRowSchema
  .omit({
    id: true,
    created_at: true,
    updated_at: true,
  })
  .extend({
    display_name: z.string().nullable().optional(),
    account_identifier: z.string().nullable().optional(),
    activated_tools: z.array(z.string()).optional().default([]),
    tool_count: z.number().int().nonnegative().optional().default(0),
    tool_schemas: z.record(z.string(), z.object({
      description: z.string().nullable(),
      inputParameters: z.unknown(),
    })).optional().default({}),
  });

/** Validates a partial update to one existing connection row. */
export const connectionUpdateSchema = z.object({
  id: z.string().uuid(),
  composio_connected_account_id: z.string().min(1).optional(),
  toolkit_slug: z.string().min(1).optional(),
  display_name: z.string().nullable().optional(),
  account_identifier: z.string().nullable().optional(),
  status: z.enum(connectionStatusValues).optional(),
  activated_tools: z.array(z.string()).optional(),
  tool_count: z.number().int().nonnegative().optional(),
  tool_schemas: z.record(z.string(), z.object({
    description: z.string().nullable(),
    inputParameters: z.unknown(),
  })).optional(),
});

export type ConnectionRow = z.infer<typeof connectionRowSchema>;
/** Input type for connection inserts — fields with `.default()` are optional at call sites. */
export type ConnectionInsert = z.input<typeof connectionInsertSchema>;
export type ConnectionUpdate = z.infer<typeof connectionUpdateSchema>;
