import { NextResponse } from "next/server";
import { parseDistrictFromPropertySlug } from "@/lib/property/utils";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 200;

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
}

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

  if (!project) {
    return NextResponse.json(
      { error: "Missing required query param: project" },
      { status: 400 }
    );
  }

  const limit = Math.min(
    parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const page = parsePositiveInt(url.searchParams.get("page"), 1) || 1;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const client = await createPropertyServerClient();

  let query = client
    .from("ura_transactions")
    .select(
      "contract_date, price, price_psf, area_sqm, floor_range, property_type, tenure, type_of_sale, no_of_units",
      { count: "exact" }
    )
    .eq("project", project)
    .order("contract_date", { ascending: false })
    .range(from, to);

  if (district) {
    query = query.eq("district", district);
  } else if (districtHint !== null) {
    query = query.eq("district", districtHint.toString());
  }

  const { data, count, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data ?? [],
    pagination: {
      page,
      limit,
      total: count ?? 0,
    },
  });
}
