/**
 * Zod schemas for Knowledge Base `vault_files` records.
 * @module lib/knowledge/schemas
 */
import { z } from "zod";

/** ISO-8601 timestamp validator aligned with CRM/chat schemas. */
const isoDateTimeSchema = z.string().datetime({ offset: true });

/** Full `vault_files` row validator (matches Supabase response shape). */
export const vaultFileSchema = z.object({
  file_id: z.string().uuid(),
  client_id: z.string().uuid(),
  filename: z.string().min(1),
  storage_path: z.string().regex(/^vault\/.+/, "storage_path must start with vault/"),
  title: z.string().min(1),
  content_type: z.string().nullable(),
  size_bytes: z.number().int().nonnegative().nullable(),
  content: z.string().nullable(),
  tags: z.array(z.string()),
  summary: z.string().nullable(),
  needs_reprocess: z.boolean(),
  created_at: isoDateTimeSchema,
  updated_at: isoDateTimeSchema,
});

export type VaultFile = z.infer<typeof vaultFileSchema>;

/** Insert payload for `vault_files` (id/timestamps/fts auto-generated). */
export const vaultFileInsertSchema = z.object({
  client_id: z.string().uuid(),
  filename: z.string().min(1, "Filename is required"),
  storage_path: z
    .string()
    .min(1, "Storage path is required")
    .regex(/^vault\/.+/, "storage_path must start with vault/"),
  title: z.string().min(1, "Title is required"),
  content_type: z.string().nullable().optional(),
  size_bytes: z.number().int().nonnegative().nullable().optional(),
  content: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  summary: z.string().nullable().optional(),
  needs_reprocess: z.boolean().optional(),
});

export type VaultFileInsert = z.infer<typeof vaultFileInsertSchema>;
