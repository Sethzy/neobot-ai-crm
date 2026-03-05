/**
 * SQL query tools for ad-hoc data exploration.
 * @module lib/runner/tools/utility/sql
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

/**
 * Creates SQL helper tools backed by read-only database RPC functions.
 */
function getReadOnlySqlValidationError(query: string): string | null {
  const normalizedQuery = query.trim();

  if (normalizedQuery.length === 0) {
    return "Query cannot be empty";
  }

  if (normalizedQuery.includes(";")) {
    return "Only single-statement SQL is allowed";
  }

  if (!/^(select|with)\s/i.test(normalizedQuery)) {
    return "Only SELECT/CTE queries are allowed";
  }

  return null;
}

export function createSqlTools(supabase: SupabaseClient<Database>) {

  const run_agent_memory_sql = tool({
    description:
      "Run a single read-only SQL query against client-accessible tables. " +
      "Use get_agent_db_schema first to inspect available schema.",
    inputSchema: z.object({
      query: z.string().min(1).describe("SQL SELECT/CTE query to execute."),
    }),
    execute: async ({ query }) => {
      const validationError = getReadOnlySqlValidationError(query);

      if (validationError) {
        return { success: false as const, error: validationError };
      }

      const { data, error } = await supabase.rpc("run_readonly_sql", {
        query_text: query,
      });

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, rows: data };
    },
  });

  const get_agent_db_schema = tool({
    description:
      "Get available tables, columns, and row counts for the agent SQL workspace.",
    inputSchema: z.object({}),
    execute: async () => {
      const { data, error } = await supabase.rpc("get_client_accessible_schema");

      if (error) {
        return { success: false as const, error: error.message };
      }

      return { success: true as const, schema: data };
    },
  });

  return { run_agent_memory_sql, get_agent_db_schema };
}
