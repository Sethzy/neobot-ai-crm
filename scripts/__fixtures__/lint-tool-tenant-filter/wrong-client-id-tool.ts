import type { ToolContext } from "@/lib/managed-agents/tools/types";

const wrongTenantId = "other-client";

export async function wrongClientId(ctx: ToolContext) {
  return ctx.supabase
    .from("contacts")
    .select("*")
    .eq("client_id", wrongTenantId)
    .limit(10);
}
