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
  connectionUpdateSchema,
  type ConnectionInsert,
  type ConnectionRow,
  type ConnectionUpdate,
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

/** Loads all connections for one client across every lifecycle status. */
export async function getAllConnections(
  supabase: ConnectionSupabaseClient,
  clientId: string,
): Promise<ConnectionRow[]> {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .order("toolkit_slug", { ascending: true });

  if (error) {
    throw new Error(`Failed to load connections: ${error.message}`);
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
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load active connection for ${toolkitSlug}: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return connectionRowSchema.parse(data);
}

/** Loads all active connections for one toolkit, scoped to one client. */
export async function getActiveConnectionsByToolkit(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  toolkitSlug: string,
): Promise<ConnectionRow[]> {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("toolkit_slug", toolkitSlug)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to load connections for toolkit: ${error.message}`);
  }

  return parseConnectionRows(data);
}

/** Loads one connection by Composio connected account ID, scoped to one client. */
export async function getConnectionByConnectedAccountId(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  connectedAccountId: string,
): Promise<ConnectionRow | null> {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("composio_connected_account_id", connectedAccountId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load connection by connected account ID: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return connectionRowSchema.parse(data);
}

/** Loads one pending connection for a toolkit, scoped to one client. */
export async function getPendingConnectionByToolkit(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  toolkitSlug: string,
): Promise<ConnectionRow | null> {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("toolkit_slug", toolkitSlug)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load pending connection for ${toolkitSlug}: ${error.message}`);
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

/** Inserts one new connection row. Multi-connection per toolkit is allowed. */
export async function insertConnection(
  supabase: ConnectionSupabaseClient,
  data: ConnectionInsert,
): Promise<ConnectionRow> {
  const parsedInput = connectionInsertSchema.parse(data);
  const { data: row, error } = await supabase
    .from("connections")
    .insert(parsedInput)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to insert connection: ${error.message}`);
  }

  return connectionRowSchema.parse(row);
}

/** Loads one connection by ID, scoped to one client. */
export async function getConnectionById(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  connectionId: string,
): Promise<ConnectionRow | null> {
  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .eq("id", connectionId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load connection: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return connectionRowSchema.parse(data);
}

/** Loads a set of connections by ID, scoped to one client. */
export async function getConnectionsByIds(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  connectionIds: string[],
): Promise<ConnectionRow[]> {
  if (connectionIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from("connections")
    .select("*")
    .eq("client_id", clientId)
    .in("id", connectionIds);

  if (error) {
    throw new Error(`Failed to load connections: ${error.message}`);
  }

  return parseConnectionRows(data);
}

/** Deletes one connection row by ID, scoped to one client. */
export async function deleteConnection(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  connectionId: string,
): Promise<void> {
  const { error } = await supabase
    .from("connections")
    .delete()
    .eq("client_id", clientId)
    .eq("id", connectionId);

  if (error) {
    throw new Error(`Failed to delete connection: ${error.message}`);
  }
}

/** Updates one connection row by ID using the provided mutable fields. */
export async function updateConnection(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  update: ConnectionUpdate,
): Promise<ConnectionRow> {
  const { id, ...changes } = connectionUpdateSchema.parse(update);
  const { data, error } = await supabase
    .from("connections")
    .update(changes)
    .eq("client_id", clientId)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    throw new Error(`Failed to update connection: ${error.message}`);
  }

  return connectionRowSchema.parse(data);
}

/** Updates the activated tool slug list for one connection row. */
export async function updateConnectionActivatedTools(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  connectionId: string,
  activatedTools: string[],
): Promise<ConnectionRow> {
  try {
    return await updateConnection(supabase, clientId, {
      id: connectionId,
      activated_tools: activatedTools,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message.replace("Failed to update connection", "Failed to update activated tools")
        : "Failed to update activated tools.",
    );
  }
}

/** Updates the lifecycle status for one connection row. */
export async function updateConnectionStatus(
  supabase: ConnectionSupabaseClient,
  clientId: string,
  connectionId: string,
  status: ConnectionRow["status"],
): Promise<ConnectionRow> {
  try {
    return await updateConnection(supabase, clientId, {
      id: connectionId,
      status,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message.replace("Failed to update connection", "Failed to update connection status")
        : "Failed to update connection status.",
    );
  }
}
