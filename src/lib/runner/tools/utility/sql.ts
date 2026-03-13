/**
 * SQL query tools for ad-hoc data exploration.
 * @module lib/runner/tools/utility/sql
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

/**
 * Validates that a query is read-only (SELECT/CTE, single statement, no semicolons).
 * Returns an error message or null if valid.
 */
export function getReadOnlySqlValidationError(query: string): string | null {
  const normalized = query.trim();

  if (normalized.length === 0) {
    return "Query cannot be empty";
  }

  if (normalized.includes(";")) {
    return "Only single-statement SQL is allowed";
  }

  if (!/^(select|with)\s/i.test(normalized)) {
    return "Only SELECT/CTE queries are allowed";
  }

  return null;
}

/**
 * Creates SQL helper tools backed by read-only database RPC functions.
 */
export function createSqlTools(supabase: SupabaseClient<Database>) {

  const run_sql = tool({
    description:
      "Escape hatch for queries search_crm cannot express: multi-table JOINs, " +
      "aggregations (COUNT, SUM, AVG), GROUP BY, subqueries, date arithmetic. " +
      "Always try search_crm first. Read-only SELECT/CTE only. " +
      "Use get_agent_db_schema to inspect available tables and columns.",
    inputSchema: z.object({
      query: z.string().min(1).describe("SQL SELECT/CTE query to execute. Single statement only, no semicolons."),
      purpose: z
        .string()
        .min(1)
        .describe("Brief description of what this query answers. Logged for audit.")
        .optional(),
    }),
    execute: async ({ query, purpose: _purpose }) => {
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

      const rows = (data ?? []) as Record<string, unknown>[];
      return {
        success: true as const,
        rows,
        row_count: rows.length,
      };
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

  return { run_sql, get_agent_db_schema };
}
