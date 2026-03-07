/**
 * Zod schemas for persisted Composio connection metadata.
 * @module lib/connections/schemas
 */
import { z } from "zod";

export const connectionStatusValues = ["active", "inactive", "error"] as const;

/** Validates one `connections` table row returned from Supabase. */
export const connectionRowSchema = z.object({
  id: z.string().uuid(),
  client_id: z.string().uuid(),
  composio_connected_account_id: z.string().min(1),
  toolkit_slug: z.string().min(1),
  display_name: z.string().nullable(),
  status: z.enum(connectionStatusValues),
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
  });

/** Validates a partial update to one existing connection row. */
export const connectionUpdateSchema = connectionRowSchema
  .omit({
    client_id: true,
    composio_connected_account_id: true,
    toolkit_slug: true,
    created_at: true,
    updated_at: true,
  })
  .partial()
  .extend({
    id: z.string().uuid(),
  });

export type ConnectionRow = z.infer<typeof connectionRowSchema>;
export type ConnectionInsert = z.infer<typeof connectionInsertSchema>;
export type ConnectionUpdate = z.infer<typeof connectionUpdateSchema>;
