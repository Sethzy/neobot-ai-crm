/**
 * SQL query tools for ad-hoc data exploration.
 * @module lib/runner/tools/utility/sql
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { formatFieldDefinitionsForSchemaTool } from "@/lib/ai/platform-instructions";
import type { CrmVocabConfig } from "@/lib/crm/config";
import type { Database } from "@/types/database";

/**
 * Strips a trailing semicolon and validates that a query is read-only
 * (SELECT/CTE, single statement). Returns `{ cleaned, error }` where
 * `cleaned` is the semicolon-free query to send to the RPC.
 */
export function validateAndCleanSql(query: string): { cleaned: string; error: string | null } {
  const trimmed = query.trim();

  if (trimmed.length === 0) {
    return { cleaned: trimmed, error: "Query cannot be empty" };
  }

  // Strip trailing semicolon (LLMs add these by habit)
  const cleaned = trimmed.replace(/;\s*$/, "");

  if (cleaned.includes(";")) {
    return { cleaned, error: "Only single-statement SQL is allowed" };
  }

  if (!/^(select|with)\s/i.test(cleaned)) {
    return { cleaned, error: "Only SELECT/CTE queries are allowed" };
  }

  return { cleaned, error: null };
}

/**
 * Creates SQL helper tools backed by read-only database RPC functions.
 */
export function createSqlTools(
  supabase: SupabaseClient<Database>,
  crmConfig?: CrmVocabConfig,
) {

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
    execute: async ({ query, purpose }) => {
      void purpose;
      const { cleaned, error: validationError } = validateAndCleanSql(query);

      if (validationError) {
        return { success: false as const, error: validationError };
      }

      const { data, error } = await supabase.rpc("run_readonly_sql", {
        query_text: cleaned,
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

      if (crmConfig) {
        return {
          success: true as const,
          schema: data,
          crm_fields: {
            contacts: formatFieldDefinitionsForSchemaTool(crmConfig.contact_fields),
            companies: formatFieldDefinitionsForSchemaTool(crmConfig.company_fields),
            deals: formatFieldDefinitionsForSchemaTool(crmConfig.deal_fields),
          },
        };
      }

      return { success: true as const, schema: data };
    },
  });

  return { run_sql, get_agent_db_schema };
}
