import type { ToolContext } from "@/lib/managed-agents/tools/types";

export async function writeBad(ctx: ToolContext) {
  return ctx.supabase.from("contacts").insert({
    first_name: "Ada",
    last_name: "Lovelace",
  });
}
