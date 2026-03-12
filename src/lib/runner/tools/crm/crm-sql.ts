/**
 * Read-only SQL escape hatch for complex CRM queries.
 * @module lib/runner/tools/crm/crm-sql
 */
import { tool } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Database } from "@/types/database";

/**
 * Validates that a query is read-only (SELECT/CTE, single statement, no semicolons).
 * Returns an error message or null if valid.
 */
function getReadOnlySqlValidationError(query: string): string | null {
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
 * Creates the crm_sql tool for CRM-scoped read-only SQL queries.
 */
export function createCrmSqlTool(
  supabase: SupabaseClient<Database>,
) {
  return {
    crm_sql: tool({
      description:
        "Run a read-only SQL query against CRM tables. Use for complex queries that search_crm cannot express: " +
        "multi-table JOINs, aggregations (COUNT, SUM, AVG), GROUP BY, HAVING, subqueries, date arithmetic, " +
        "complex WHERE clauses. Only SELECT and CTE (WITH) queries allowed. " +
        "Available tables: contacts, companies, deals, interactions, crm_tasks, deal_contacts. " +
        "All tables have client_id — RLS enforces tenant isolation automatically. " +
        "Prefer search_crm for simple lookups. Use crm_sql when you need JOINs or aggregations.",
      inputSchema: z.object({
        query: z
          .string()
          .min(1)
          .describe("SQL SELECT/CTE query. Single statement only, no semicolons."),
        purpose: z
          .string()
          .min(1)
          .describe("Brief description of what this query answers. Logged for audit."),
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
    }),
  };
}
