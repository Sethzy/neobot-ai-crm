import type { ToolContext } from "@/lib/managed-agents/tools/types";

export async function writeGood(ctx: ToolContext) {
  return ctx.supabase.from("contacts").insert({
    client_id: ctx.clientId,
    first_name: "Ada",
    last_name: "Lovelace",
  });
}
