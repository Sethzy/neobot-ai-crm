/**
 * Supabase queries for persisted Composio connection metadata.
 * @module lib/connections/queries
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";
import {
  connectionInsertSchema,
  connectionRowSchema,
  type ConnectionInsert,
  type ConnectionRow,
} from "./schemas";

type ConnectionSupabaseClient = SupabaseClient<Database>;

async function parseConnectionRows(data: unknown): Promise<ConnectionRow[]> {
  return connectionRowSchema.array().parse(data ?? []);
}

const toolkitSlugRowSchema = z.object({
  toolkit_slug: z.string().min(1),
});

/** Loads all active connections for one client. */
export async function getActiveConnections(
  supabase: ConnectionSupabaseClient,
  clientId: string,
): Promise<ConnectionRow[]> {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("toolkit_slug", { ascending: true });

  if (error) {
    throw new Error(`Failed to load active connections: ${error.message}`);
  }

  return parseConnectionRows(data);
}

/** Loads one active connection for a specific toolkit, if present. */
export async function getActiveConnectionByToolkit(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  toolkitSlug: string,
): Promise<ConnectionRow | null> {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("toolkit_slug", toolkitSlug)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load active connection for ${toolkitSlug}: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return connectionRowSchema.parse(data);
}

/** Returns only toolkit slugs for active connections. */
export async function getActiveToolkitSlugs(
  supabase: ConnectionSupabaseClient,
  clientId: string,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("connections")
    .select("toolkit_slug")
    .eq("client_id", clientId)
    .eq("status", "active")
    .order("toolkit_slug", { ascending: true });

  if (error) {
    throw new Error(`Failed to load active connection toolkits: ${error.message}`);
  }

  return toolkitSlugRowSchema.array().parse(data ?? []).map((row) => row.toolkit_slug);
}

/** Upserts one connection row after a successful OAuth callback. */
export async function upsertConnection(
  supabase: ConnectionSupabaseClient,
  data: ConnectionInsert,
): Promise<ConnectionRow> {
  const parsedInput = connectionInsertSchema.parse(data);
  const { data: row, error } = await supabase
    .from("connections")
    .upsert(parsedInput, { onConflict: "client_id,toolkit_slug" })
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to upsert connection: ${error.message}`);
  }

  return connectionRowSchema.parse(row);
}
