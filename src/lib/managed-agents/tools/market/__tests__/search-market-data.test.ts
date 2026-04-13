import { describe, expect, it, vi } from "vitest";

import { createMockSupabase } from "@/lib/crm/__tests__/mock-supabase";

const { mockCreatePropertyPublicServerClient } = vi.hoisted(() => ({
  mockCreatePropertyPublicServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/property-public-server", () => ({
  createPropertyPublicServerClient: mockCreatePropertyPublicServerClient,
}));

import { searchMarketDataTool } from "../search-market-data";

describe("searchMarketDataTool", () => {
  it("searches the agents dataset", async () => {
    const agents = [
      {
        registration_no: "R012345A",
        salesperson_name: "John Tan",
        estate_agent_name: "PropNex",
      },
    ];
    const { client, from } = createMockSupabase({
      cea_agents: { data: agents, error: null },
    });
    mockCreatePropertyPublicServerClient.mockReturnValue(client);

    const result = await searchMarketDataTool.execute({
      dataset: "agents",
      agent_name: "John",
      mode: "search",
    });

    expect(result).toEqual({
      success: true,
      dataset: "agents",
      results: agents,
      count: 1,
    });
    expect(from).toHaveBeenCalledWith("cea_agents");
  });

  it("normalizes district filters for ura", async () => {
    const { client, builders } = createMockSupabase({
      ura_transactions: { data: [], error: null },
    });
    mockCreatePropertyPublicServerClient.mockReturnValue(client);

    await searchMarketDataTool.execute({
      dataset: "ura",
      district: "District 15",
      mode: "search",
    });

    expect(builders.ura_transactions.eq).toHaveBeenCalledWith("district", "15");
  });

  it("returns date validation errors before querying", async () => {
    const { client } = createMockSupabase();
    mockCreatePropertyPublicServerClient.mockReturnValue(client);

    const result = await searchMarketDataTool.execute({
      dataset: "transactions",
      date_from: "2025-12-31",
      date_to: "2025-01-01",
      mode: "search",
    });

    expect(result).toEqual({
      success: false,
      error: "date_from must be on or before date_to",
    });
  });
});
