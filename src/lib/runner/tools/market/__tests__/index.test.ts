/**
 * Tests for market tool barrel registration.
 * @module lib/runner/tools/market/__tests__/index
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreatePropertyPublicServerClient,
  mockCreateSearchMarketDataTool,
  mockCreateSearch99coTool,
  mockCreateSearchPropertyguruTool,
} = vi.hoisted(() => ({
  mockCreatePropertyPublicServerClient: vi.fn(),
  mockCreateSearchMarketDataTool: vi.fn(),
  mockCreateSearch99coTool: vi.fn(),
  mockCreateSearchPropertyguruTool: vi.fn(),
}));

vi.mock("@/lib/supabase/property-public-server", () => ({
  createPropertyPublicServerClient: mockCreatePropertyPublicServerClient,
}));

vi.mock("../search-market-data", () => ({
  createSearchMarketDataTool: mockCreateSearchMarketDataTool,
}));

vi.mock("../search-99co", () => ({
  createSearch99coTool: mockCreateSearch99coTool,
}));

vi.mock("../search-propertyguru", () => ({
  createSearchPropertyguruTool: mockCreateSearchPropertyguruTool,
}));

import { createListingTools, createMarketTools } from "../index";

describe("createMarketTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates market tools with the property public Supabase client", () => {
    const searchMarketDataTool = { search_market_data: { execute: vi.fn() } };

    mockCreatePropertyPublicServerClient.mockReturnValue("property-supabase");
    mockCreateSearchMarketDataTool.mockReturnValue(searchMarketDataTool);

    const tools = createMarketTools();

    expect(mockCreatePropertyPublicServerClient).toHaveBeenCalledOnce();
    expect(mockCreateSearchMarketDataTool).toHaveBeenCalledWith("property-supabase");
    expect(tools).toStrictEqual(searchMarketDataTool);
  });

  it("creates listing tools without touching the property Supabase client", () => {
    const search99coTool = { search_99co: { execute: vi.fn() } };
    const searchPropertyguruTool = {
      search_propertyguru: { execute: vi.fn() },
    };

    mockCreateSearch99coTool.mockReturnValue(search99coTool);
    mockCreateSearchPropertyguruTool.mockReturnValue(searchPropertyguruTool);

    const tools = createListingTools();

    expect(mockCreatePropertyPublicServerClient).not.toHaveBeenCalled();
    expect(mockCreateSearch99coTool).toHaveBeenCalledOnce();
    expect(mockCreateSearchPropertyguruTool).toHaveBeenCalledOnce();
    expect(tools).toStrictEqual({
      ...search99coTool,
      ...searchPropertyguruTool,
    });
  });
});
