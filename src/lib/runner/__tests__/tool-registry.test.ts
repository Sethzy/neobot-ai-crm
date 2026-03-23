/**
 * Tests for runner tool registry composition rules.
 * @module lib/runner/__tests__/tool-registry
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateBrowserTools,
  mockCreateConnectionTools,
  mockCreateCrmTools,
  mockCreateListingTools,
  mockCreateMarketTools,
  mockCreateStorageTools,
  mockCreateTriggerTools,
  mockCreateUtilityTools,
  mockCreateWebTools,
  mockIsApifyConfigured,
  mockIsBrowserUseConfigured,
  mockIsPropertySupabaseConfigured,
} = vi.hoisted(() => ({
  mockCreateBrowserTools: vi.fn(),
  mockCreateConnectionTools: vi.fn(),
  mockCreateCrmTools: vi.fn(),
  mockCreateListingTools: vi.fn(),
  mockCreateMarketTools: vi.fn(),
  mockCreateStorageTools: vi.fn(),
  mockCreateTriggerTools: vi.fn(),
  mockCreateUtilityTools: vi.fn(),
  mockCreateWebTools: vi.fn(),
  mockIsApifyConfigured: vi.fn(),
  mockIsBrowserUseConfigured: vi.fn(),
  mockIsPropertySupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/apify/env", () => ({
  isApifyConfigured: mockIsApifyConfigured,
}));

vi.mock("@/lib/browser-use/client", () => ({
  isBrowserUseConfigured: mockIsBrowserUseConfigured,
}));

vi.mock("@/lib/supabase/property-env", () => ({
  isPropertySupabaseConfigured: mockIsPropertySupabaseConfigured,
}));

vi.mock("@/lib/runner/tools", () => ({
  createBrowserTools: mockCreateBrowserTools,
  createConnectionTools: mockCreateConnectionTools,
  createCrmTools: mockCreateCrmTools,
  createListingTools: mockCreateListingTools,
  createMarketTools: mockCreateMarketTools,
  createStorageTools: mockCreateStorageTools,
  createTriggerTools: mockCreateTriggerTools,
  createUtilityTools: mockCreateUtilityTools,
  createWebTools: mockCreateWebTools,
}));

import { createRunnerTools } from "../tool-registry";

describe("createRunnerTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateBrowserTools.mockReturnValue({
      browse_website: { description: "browser-tool" },
    });
    mockCreateConnectionTools.mockReturnValue({
      list_users_connections: { description: "connection-tool" },
    });
    mockCreateCrmTools.mockReturnValue({
      search_contacts: { description: "crm-tool" },
    });
    mockCreateListingTools.mockReturnValue({
      search_99co: { description: "listing-tool" },
      search_propertyguru: { description: "listing-tool" },
    });
    mockCreateMarketTools.mockReturnValue({
      search_market_data: { description: "market-tool" },
    });
    mockCreateStorageTools.mockReturnValue({
      read_file: { description: "storage-tool" },
    });
    mockCreateTriggerTools.mockReturnValue({
      search_triggers: { description: "trigger-tool" },
    });
    mockCreateUtilityTools.mockReturnValue({
      calculate: { description: "utility-tool" },
    });
    mockCreateWebTools.mockReturnValue({
      web_search: { description: "web-tool" },
    });
    mockIsApifyConfigured.mockReturnValue(true);
    mockIsBrowserUseConfigured.mockReturnValue(true);
    mockIsPropertySupabaseConfigured.mockReturnValue(true);
  });

  it("includes browser tools only when explicitly enabled", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { includeBrowserTools: true },
    );

    expect(tools).toHaveProperty("browse_website");
    expect(mockCreateBrowserTools).toHaveBeenCalledOnce();
  });

  it("omits browser tools when includeBrowserTools is false", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { includeBrowserTools: false },
    );

    expect(tools).not.toHaveProperty("browse_website");
    expect(mockCreateBrowserTools).not.toHaveBeenCalled();
  });

  it("omits browser tools for subagents even when explicitly enabled", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { includeBrowserTools: true, isSubagent: true },
    );

    expect(tools).not.toHaveProperty("browse_website");
    expect(mockCreateBrowserTools).not.toHaveBeenCalled();
  });

  it("includes market tools when explicitly enabled and property env is configured", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { includeMarketTools: true },
    );

    expect(tools).toHaveProperty("search_market_data");
    expect(mockCreateMarketTools).toHaveBeenCalledOnce();
  });

  it("includes listing tools when explicitly enabled and Apify is configured", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { includeListingTools: true },
    );

    expect(tools).toHaveProperty("search_99co");
    expect(tools).toHaveProperty("search_propertyguru");
    expect(mockCreateListingTools).toHaveBeenCalledOnce();
  });

  it("omits market tools when includeMarketTools is false", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { includeMarketTools: false },
    );

    expect(tools).not.toHaveProperty("search_market_data");
    expect(mockCreateMarketTools).not.toHaveBeenCalled();
  });

  it("omits market tools when property env is not configured", () => {
    mockIsPropertySupabaseConfigured.mockReturnValue(false);

    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { includeMarketTools: true },
    );

    expect(tools).not.toHaveProperty("search_market_data");
    expect(mockCreateMarketTools).not.toHaveBeenCalled();
  });

  it("omits listing tools when includeListingTools is false", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { includeListingTools: false },
    );

    expect(tools).not.toHaveProperty("search_99co");
    expect(mockCreateListingTools).not.toHaveBeenCalled();
  });

  it("omits listing tools when Apify is not configured", () => {
    mockIsApifyConfigured.mockReturnValue(false);

    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { includeListingTools: true },
    );

    expect(tools).not.toHaveProperty("search_99co");
    expect(mockCreateListingTools).not.toHaveBeenCalled();
  });

  it("includes market tools for subagents when explicitly enabled", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { includeMarketTools: true, isSubagent: true },
    );

    expect(tools).toHaveProperty("search_market_data");
    expect(mockCreateMarketTools).toHaveBeenCalledOnce();
  });

  it("omits listing tools for subagents even when explicitly enabled", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { includeListingTools: true, isSubagent: true },
    );

    expect(tools).not.toHaveProperty("search_99co");
    expect(mockCreateListingTools).not.toHaveBeenCalled();
  });

  it("keeps listing tools independent from property Supabase gating", () => {
    mockIsPropertySupabaseConfigured.mockReturnValue(false);

    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { includeListingTools: true },
    );

    expect(tools).toHaveProperty("search_99co");
    expect(mockCreateListingTools).toHaveBeenCalledOnce();
    expect(mockCreateMarketTools).not.toHaveBeenCalled();
  });
});
