import { NextResponse } from "next/server";
import { isPropertySupabaseConfigured } from "@/lib/supabase/property-env";
import { createPropertyServerClient } from "@/lib/supabase/property-server";

export async function GET(
  _request: Request,
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
  const client = await createPropertyServerClient();

  const [agentResult, countResult, latestResult] = await Promise.all([
    client
      .from("cea_agents")
      .select(
        "registration_no, salesperson_name, estate_agent_name, registration_start_date, registration_end_date"
      )
      .eq("registration_no", registrationNo)
      .maybeSingle(),
    client
      .from("cea_transactions")
      .select("id", { count: "exact", head: true })
      .eq("salesperson_reg_num", registrationNo),
    client
      .from("cea_transactions")
      .select("transaction_date")
      .eq("salesperson_reg_num", registrationNo)
      .order("transaction_date", { ascending: false })
      .limit(1),
  ]);

  for (const result of [agentResult, countResult, latestResult]) {
    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }
  }

  if (!agentResult.data && (countResult.count ?? 0) === 0) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({
    data: {
      registrationNo,
      agent: agentResult.data,
      transactionCount: countResult.count ?? 0,
      latestTransactionDate: latestResult.data?.[0]?.transaction_date ?? null,
      expiredRegistration: !agentResult.data,
    },
  });
}
