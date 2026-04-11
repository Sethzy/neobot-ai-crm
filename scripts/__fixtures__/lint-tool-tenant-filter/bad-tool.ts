import type { ToolContext } from "@/lib/managed-agents/tools/types";

export async function bad(ctx: ToolContext) {
  // Missing .eq("client_id", ...) - this file should fail the lint.
  return ctx.supabase
    .from("contacts")
    .select("*")
    .limit(10);
}
