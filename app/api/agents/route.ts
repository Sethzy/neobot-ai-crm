import { NextResponse } from "next/server";
import { cleanSearchTerm } from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function parseLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(parsed, 1), MAX_LIMIT);
}

export async function GET(request: Request) {
  if (!isPropertySupabaseConfigured()) {
    return NextResponse.json(
      { error: "Property data is not configured" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const q = cleanSearchTerm(url.searchParams.get("q") ?? "");
  const limit = parseLimit(url.searchParams.get("limit"));

  const client = await createPropertyServerClient();
  let query = client
    .from("cea_agents")
    .select(
      "registration_no, salesperson_name, estate_agent_name, registration_start_date, registration_end_date"
    )
    .limit(limit)
    .order("salesperson_name", { ascending: true });

  if (q) {
    query = query.or(
      `salesperson_name.ilike.%${q}%,registration_no.ilike.%${q}%,estate_agent_name.ilike.%${q}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}
