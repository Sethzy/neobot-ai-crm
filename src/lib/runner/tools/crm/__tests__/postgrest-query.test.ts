/**
 * Contract tests that validate query serialization against the real Supabase client.
 * @module lib/runner/tools/crm/__tests__/postgrest-query.test
 */
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

import { createSearchCrmTool } from "../search";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const EXECUTION_OPTIONS = { toolCallId: "tool-call", messages: [] } as never;
let storageKeyCounter = 0;

function createQueryCapturingClient() {
  const capturedUrls: URL[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const requestUrl = new URL(
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url,
    );

    capturedUrls.push(requestUrl);

    return new Response("[]", {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  const supabase = createClient<Database>(
    "https://example.supabase.co",
    "public-anon-key",
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: `crm-postgrest-query-${storageKeyCounter++}`,
      },
      global: { fetch: fetchMock as typeof fetch },
    },
  );

  return { supabase, capturedUrls };
}

describe("PostgREST query serialization", () => {
  it("serializes escaped contact search filters", async () => {
    const { supabase, capturedUrls } = createQueryCapturingClient();
    const tools = createSearchCrmTool(supabase, CLIENT_ID);

    await tools.search_crm.execute(
      { entity: "contacts", query: "John, (Doe)%_ \"VIP\"" },
      EXECUTION_OPTIONS,
    );

    const requestUrl = capturedUrls[0];
    expect(requestUrl).toBeDefined();

    expect(requestUrl.searchParams.get("client_id")).toBe(`eq.${CLIENT_ID}`);
    const orFilter = requestUrl.searchParams.get("or");
    expect(orFilter).toContain("first_name.ilike.\"%John, (Doe)\\%\\_");
    expect(orFilter).toContain("email.ilike.\"%John, (Doe)\\%\\_");
    expect(orFilter).toContain("VIP");
  });

  it("serializes escaped deal search filters", async () => {
    const { supabase, capturedUrls } = createQueryCapturingClient();
    const tools = createSearchCrmTool(supabase, CLIENT_ID);

    await tools.search_crm.execute(
      { entity: "deals", query: "Blk 123, #08-01 (A)_%" },
      EXECUTION_OPTIONS,
    );

    const requestUrl = capturedUrls[0];
    expect(requestUrl).toBeDefined();

    expect(requestUrl.searchParams.get("client_id")).toBe(`eq.${CLIENT_ID}`);
    const orFilter = requestUrl.searchParams.get("or");
    expect(orFilter).toContain("address.ilike.\"%Blk 123, #08-01 (A)\\_\\%%\"");
    expect(orFilter).toContain("notes.ilike.\"%Blk 123, #08-01 (A)\\_\\%%\"");
  });
});
