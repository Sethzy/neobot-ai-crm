import { NextResponse } from "next/server";
import { cleanSearchTerm, toPropertySlug } from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

const MAX_ROWS = 3_000;

export async function GET(request: Request) {
  if (!isPropertySupabaseConfigured()) {
    return NextResponse.json(
      { error: "Property data is not configured" },
      { status: 503 }
    );
  }

  const url = new URL(request.url);
  const q = cleanSearchTerm(url.searchParams.get("q") ?? "");

  const client = await createPropertyServerClient();
  let query = client
    .from("ura_transactions")
    .select("project, district, contract_date")
    .order("contract_date", { ascending: false })
    .limit(MAX_ROWS);

  if (q) {
    query = query.ilike("project", `%${q}%`);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const deduped = new Map<string, { project: string; district: string | null; latestDate: string | null }>();
  for (const row of data ?? []) {
    const project = row.project?.trim();
    if (!project) {
      continue;
    }

    const key = `${project}::${row.district ?? ""}`;
    if (!deduped.has(key)) {
      deduped.set(key, {
        project,
        district: row.district,
        latestDate: row.contract_date,
      });
    }
  }

  const out = Array.from(deduped.values()).map((row) => ({
    ...row,
    slug: toPropertySlug(row.project, row.district),
  }));

  return NextResponse.json({ data: out });
}
