import type { ToolContext } from "@/lib/managed-agents/tools/types";

export async function neutral(ctx: ToolContext) {
  // @tenant-neutral: composio_catalog is a global reference table with no client_id column.
  return ctx.supabase.from("composio_catalog").select("*").limit(10);
}
