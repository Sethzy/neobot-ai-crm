/**
 * Tests for market tool barrel registration.
 * @module lib/runner/tools/market/__tests__/index
 */
import { describe, expect, it, vi } from "vitest";

const {
  mockCreatePropertyPublicServerClient,
  mockCreateSearchMarketDataTool,
} = vi.hoisted(() => ({
  mockCreatePropertyPublicServerClient: vi.fn(),
  mockCreateSearchMarketDataTool: vi.fn(),
}));

vi.mock("@/lib/supabase/property-public-server", () => ({
  createPropertyPublicServerClient: mockCreatePropertyPublicServerClient,
}));

vi.mock("../search-market-data", () => ({
  createSearchMarketDataTool: mockCreateSearchMarketDataTool,
}));

import { createMarketTools } from "../index";

describe("createMarketTools", () => {
  it("creates market tools with the property public Supabase client", () => {
    const searchMarketDataTool = { search_market_data: { execute: vi.fn() } };

    mockCreatePropertyPublicServerClient.mockReturnValue("property-supabase");
    mockCreateSearchMarketDataTool.mockReturnValue(searchMarketDataTool);

    const tools = createMarketTools();

    expect(mockCreatePropertyPublicServerClient).toHaveBeenCalledOnce();
    expect(mockCreateSearchMarketDataTool).toHaveBeenCalledWith("property-supabase");
    expect(tools).toStrictEqual(searchMarketDataTool);
  });
});
