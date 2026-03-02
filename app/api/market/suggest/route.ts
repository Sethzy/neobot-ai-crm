/** Lightweight typeahead suggestions for all market search pages. */
import { NextResponse } from "next/server";
import { cleanSearchTerm } from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

type Suggestion = {
  label: string;
  sublabel?: string;
  href: string;
};

const LIMIT = 8;

const HANDLERS: Record<
  string,
  (q: string) => Promise<Suggestion[]>
> = {
  agents: fetchAgentSuggestions,
  properties: fetchPropertySuggestions,
  hdb: fetchHdbSuggestions,
  agencies: fetchAgencySuggestions,
  areas: fetchAreaSuggestions,
};

export async function GET(request: Request) {
  if (!isPropertySupabaseConfigured()) {
    return NextResponse.json({ suggestions: [] });
  }

  const url = new URL(request.url);
  const type = url.searchParams.get("type") ?? "";
  const q = cleanSearchTerm(url.searchParams.get("q") ?? "");

  if (!q || q.length < 2 || !HANDLERS[type]) {
    return NextResponse.json({ suggestions: [] });
  }

  const suggestions = await HANDLERS[type](q);
  return NextResponse.json({ suggestions });
}

async function fetchAgentSuggestions(q: string): Promise<Suggestion[]> {
  const client = await createPropertyServerClient();
  const { data } = await client
    .from("cea_agents")
    .select("registration_no, salesperson_name, estate_agent_name")
    .or(
      `salesperson_name.ilike.%${q}%,registration_no.ilike.%${q}%,estate_agent_name.ilike.%${q}%`
    )
    .order("salesperson_name", { ascending: true })
    .limit(LIMIT);

  return (data ?? []).map((row) => ({
    label: row.salesperson_name ?? "Unknown Agent",
    sublabel: [row.registration_no, row.estate_agent_name]
      .filter(Boolean)
      .join(" · "),
    href: `/market/agents/${row.registration_no}`,
  }));
}

async function fetchPropertySuggestions(q: string): Promise<Suggestion[]> {
  const client = await createPropertyServerClient();
  const { data } = await client
    .from("ura_transactions")
    .select("project, district")
    .ilike("project", `%${q}%`)
    .order("project", { ascending: true })
    .limit(50);

  const seen = new Map<string, { project: string; district: string | null }>();
  for (const row of data ?? []) {
    if (!row.project) continue;
    const key = `${row.project}::${row.district ?? ""}`;
    if (!seen.has(key)) seen.set(key, { project: row.project, district: row.district });
    if (seen.size >= LIMIT) break;
  }

  const { toPropertySlug } = await import("@/lib/property/utils");
  return Array.from(seen.values()).map((row) => ({
    label: row.project,
    sublabel: row.district ? `District ${row.district}` : undefined,
    href: `/market/properties/${toPropertySlug(row.project, row.district)}?project=${encodeURIComponent(row.project)}${row.district ? `&district=${encodeURIComponent(row.district)}` : ""}`,
  }));
}

async function fetchHdbSuggestions(q: string): Promise<Suggestion[]> {
  const client = await createPropertyServerClient();
  const { data } = await client
    .from("hdb_resale_transactions")
    .select("town, street_name")
    .or(`town.ilike.%${q}%,street_name.ilike.%${q}%`)
    .not("town", "is", null)
    .not("street_name", "is", null)
    .limit(50);

  const seen = new Map<string, { town: string; street: string }>();
  for (const row of data ?? []) {
    const town = row.town?.trim();
    const street = row.street_name?.trim();
    if (!town || !street) continue;
    const key = `${town}::${street}`;
    if (!seen.has(key)) {
      seen.set(key, { town, street });
    }
    if (seen.size >= LIMIT) break;
  }

  const { toHdbTownSlug, toHdbStreetSlug } = await import(
    "@/lib/property/utils"
  );
  return Array.from(seen.values()).map((row) => ({
    label: row.street,
    sublabel: row.town,
    href: `/market/hdb/${toHdbTownSlug(row.town)}/${toHdbStreetSlug(row.street)}?town=${encodeURIComponent(row.town)}&street=${encodeURIComponent(row.street)}`,
  }));
}

async function fetchAgencySuggestions(q: string): Promise<Suggestion[]> {
  const client = await createPropertyServerClient();
  const { data } = await client
    .from("cea_agents")
    .select("estate_agent_name")
    .ilike("estate_agent_name", `%${q}%`)
    .not("estate_agent_name", "is", null)
    .limit(50);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const name = row.estate_agent_name?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const { toAgencySlug } = await import("@/lib/property/utils");
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMIT)
    .map(([name, count]) => ({
      label: name,
      sublabel: `${count} agents`,
      href: `/market/agencies/${toAgencySlug(name)}?name=${encodeURIComponent(name)}`,
    }));
}

async function fetchAreaSuggestions(q: string): Promise<Suggestion[]> {
  const client = await createPropertyServerClient();
  const { data } = await client
    .from("cea_transactions")
    .select("town")
    .ilike("town", `%${q}%`)
    .not("town", "is", null)
    .limit(50);

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const name = row.town?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }

  const { toAreaSlug } = await import("@/lib/property/utils");
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, LIMIT)
    .map(([name, count]) => ({
      label: name,
      sublabel: `${count} transactions`,
      href: `/market/areas/${toAreaSlug(name)}?name=${encodeURIComponent(name)}`,
    }));
}
