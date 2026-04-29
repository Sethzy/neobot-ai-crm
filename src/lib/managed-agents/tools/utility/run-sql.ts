/**
 * run_sql tool for managed agents.
 *
 * @module lib/managed-agents/tools/utility/run-sql
 */
import { z } from "zod";

import { validateAndCleanSql } from "@/lib/runner/tools/utility/sql";

import type { ManagedAgentTool } from "../types";

const inputSchema = z.object({
  query: z.string().min(1).describe("SQL SELECT/CTE query to execute. Single statement only, no semicolons."),
  purpose: z.string().min(1).optional().describe("Brief description of what this query answers. Logged for audit."),
});

type RunSqlInput = z.infer<typeof inputSchema>;

const MAX_RETURNED_ROWS = 200;

export const runSqlTool: ManagedAgentTool<RunSqlInput> = {
  name: "run_sql",
  description:
    "Escape hatch for queries search_crm cannot express: multi-table JOINs, " +
    "aggregations (COUNT, SUM, AVG), GROUP BY, subqueries, date arithmetic. " +
    "Always try search_crm first. Read-only SELECT/CTE only. " +
    "Use get_agent_db_schema to inspect available tables and columns. " +
    "Read-only and tenant-scoped via Postgres RLS — no need to add `WHERE client_id = ...`.",
  inputSchema,
  chatOnly: true,
  execute: async ({ query }, context) => {
    const { cleaned, error: validationError } = validateAndCleanSql(query);
    if (validationError) {
      return { success: false as const, error: validationError };
    }

    const { data, error } = await context.supabase.rpc("run_readonly_sql", {
      query_text: cleaned,
    });
    if (error) {
      return { success: false as const, error: error.message };
    }

    const rows = (data ?? []) as Record<string, unknown>[];
    if (rows.length > MAX_RETURNED_ROWS) {
      return {
        success: true as const,
        rows: rows.slice(0, MAX_RETURNED_ROWS),
        row_count: MAX_RETURNED_ROWS,
        truncated: true as const,
        truncated_from: rows.length,
      };
    }

    return { success: true as const, rows, row_count: rows.length };
  },
};
