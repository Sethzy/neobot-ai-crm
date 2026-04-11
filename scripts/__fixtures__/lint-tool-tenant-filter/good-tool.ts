import type { ToolContext } from "@/lib/managed-agents/tools/types";

export async function good(ctx: ToolContext) {
  return ctx.supabase
    .from("contacts")
    .select("*")
    .eq("client_id", ctx.clientId)
    .limit(10);
}
