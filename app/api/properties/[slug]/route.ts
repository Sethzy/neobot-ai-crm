import { NextResponse } from "next/server";
import { parseDistrictFromPropertySlug } from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

function parseOptionalString(value: string | null): string | null {
  const text = value?.trim();
  return text && text.length > 0 ? text : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!isPropertySupabaseConfigured()) {
    return NextResponse.json(
      { error: "Property data is not configured" },
      { status: 503 }
    );
  }

  const { slug } = await params;
  const decodedSlug = decodeURIComponent(slug);
  const url = new URL(request.url);

  const project = parseOptionalString(url.searchParams.get("project"));
  const district = parseOptionalString(url.searchParams.get("district"));
  const districtHint = parseDistrictFromPropertySlug(decodedSlug);

  const client = await createPropertyServerClient();

  let lookup = client
    .from("ura_transactions")
    .select("project, district, contract_date")
    .order("contract_date", { ascending: false })
    .limit(1);

  if (project) {
    lookup = lookup.eq("project", project);
    if (district) {
      lookup = lookup.eq("district", district);
    } else if (districtHint !== null) {
      lookup = lookup.eq("district", districtHint.toString());
    }
  }

  const { data, error } = await lookup;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = data?.[0];
  if (!row) {
    return NextResponse.json({ error: "Property not found" }, { status: 404 });
  }

  return NextResponse.json({ data: row });
}
