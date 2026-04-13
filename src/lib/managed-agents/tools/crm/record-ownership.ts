/**
 * Shared CRM ownership helpers for managed-agent tools.
 *
 * @module lib/managed-agents/tools/crm/record-ownership
 */
import type { ToolContext } from "../types";

type OwnedTable = "contacts" | "companies" | "deals" | "crm_tasks";

const TABLE_PK_MAP: Record<OwnedTable, string> = {
  contacts: "contact_id",
  companies: "company_id",
  deals: "deal_id",
  crm_tasks: "task_id",
};

export async function findOwnedRecord(
  context: ToolContext,
  table: OwnedTable,
  recordId: string,
  select = "*",
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const pk = TABLE_PK_MAP[table];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (context.supabase as any)
    .from(table)
    .select(select)
    .eq(pk, recordId)
    .eq("client_id", context.clientId)
    .maybeSingle();

  if (error) {
    return { data: null, error: error.message };
  }

  return {
    data: (data as Record<string, unknown> | null) ?? null,
    error: null,
  };
}
