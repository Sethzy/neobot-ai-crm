import { NextResponse } from "next/server";
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ regNo: string }> }
) {
  if (!isPropertySupabaseConfigured()) {
    return NextResponse.json(
      { error: "Property data is not configured" },
      { status: 503 }
    );
  }

  const { regNo } = await params;
  const registrationNo = decodeURIComponent(regNo).toUpperCase();

  const url = new URL(request.url);
  const limit = Math.min(
    parsePositiveInt(url.searchParams.get("limit"), DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const page = parsePositiveInt(url.searchParams.get("page"), 1) || 1;
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const client = await createPropertyServerClient();
  const { data, count, error } = await client
    .from("cea_transactions")
    .select(
      "transaction_date, property_type, transaction_type, represented, town, district, general_location",
      { count: "exact" }
    )
    .eq("salesperson_reg_num", registrationNo)
    .order("transaction_date", { ascending: false })
    .range(from, to);

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
