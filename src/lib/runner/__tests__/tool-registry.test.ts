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
  mockCreateSandboxTools,
  mockCreateStorageTools,
  mockCreateTriggerTools,
  mockCreateUtilityTools,
  mockCreateWebTools,
  mockIsSandboxConfigured,
  mockIsPropertySupabaseConfigured,
} = vi.hoisted(() => ({
  mockCreateBrowserTools: vi.fn(),
  mockCreateConnectionTools: vi.fn(),
  mockCreateCrmTools: vi.fn(),
  mockCreateListingTools: vi.fn(),
  mockCreateMarketTools: vi.fn(),
  mockCreateSandboxTools: vi.fn(),
  mockCreateStorageTools: vi.fn(),
  mockCreateTriggerTools: vi.fn(),
  mockCreateUtilityTools: vi.fn(),
  mockCreateWebTools: vi.fn(),
  mockIsSandboxConfigured: vi.fn(),
  mockIsPropertySupabaseConfigured: vi.fn(),
}));

vi.mock("@/lib/supabase/property-env", () => ({
  isPropertySupabaseConfigured: mockIsPropertySupabaseConfigured,
}));

vi.mock("@/lib/sandbox/env", () => ({
  isSandboxConfigured: mockIsSandboxConfigured,
}));

vi.mock("@/lib/runner/tools", () => ({
  createBrowserTools: mockCreateBrowserTools,
  createConnectionTools: mockCreateConnectionTools,
  createCrmTools: mockCreateCrmTools,
  createListingTools: mockCreateListingTools,
  createMarketTools: mockCreateMarketTools,
  createSandboxTools: mockCreateSandboxTools,
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
    mockCreateSandboxTools.mockReturnValue({
      analyze_spreadsheet: { description: "sandbox-tool" },
      publish_artifact: { description: "sandbox-tool" },
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
    mockIsSandboxConfigured.mockReturnValue(true);
    mockIsPropertySupabaseConfigured.mockReturnValue(true);
  });

  it("always includes browser tools for non-subagent runs", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
    );

    expect(tools).toHaveProperty("browse_website");
    expect(mockCreateBrowserTools).toHaveBeenCalledOnce();
  });

  it("omits browser tools for subagents", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { isSubagent: true },
    );

    expect(tools).not.toHaveProperty("browse_website");
  });

  it("includes market tools when property env is configured", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
    );

    expect(tools).toHaveProperty("search_market_data");
    expect(mockCreateMarketTools).toHaveBeenCalledOnce();
  });

  it("omits market tools when property env is not configured", () => {
    mockIsPropertySupabaseConfigured.mockReturnValue(false);

    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
    );

    expect(tools).not.toHaveProperty("search_market_data");
    expect(mockCreateMarketTools).not.toHaveBeenCalled();
  });

  it("always includes listing tools for non-subagent runs", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
    );

    expect(tools).toHaveProperty("search_99co");
    expect(tools).toHaveProperty("search_propertyguru");
    expect(mockCreateListingTools).toHaveBeenCalledOnce();
  });

  it("includes market tools for subagents when property env is configured", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { isSubagent: true },
    );

    expect(tools).toHaveProperty("search_market_data");
    expect(mockCreateMarketTools).toHaveBeenCalledOnce();
  });

  it("omits listing tools for subagents", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { isSubagent: true },
    );

    expect(tools).not.toHaveProperty("search_99co");
  });

  it("includes sandbox tools for non-subagent runs when sandbox env is configured", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
    );

    expect(tools).toHaveProperty("analyze_spreadsheet");
    expect(tools).toHaveProperty("publish_artifact");
    expect(mockCreateSandboxTools).toHaveBeenCalledWith(
      "supabase",
      "client-id",
      "thread-id",
    );
  });

  it("omits sandbox tools when sandbox env is not configured", () => {
    mockIsSandboxConfigured.mockReturnValue(false);

    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
    );

    expect(tools).not.toHaveProperty("analyze_spreadsheet");
    expect(tools).not.toHaveProperty("publish_artifact");
    expect(mockCreateSandboxTools).not.toHaveBeenCalled();
  });

  it("omits sandbox tools for subagents", () => {
    const tools = createRunnerTools(
      "supabase" as never,
      "client-id",
      "thread-id",
      { isSubagent: true },
    );

    expect(tools).not.toHaveProperty("analyze_spreadsheet");
    expect(tools).not.toHaveProperty("publish_artifact");
    expect(mockCreateSandboxTools).not.toHaveBeenCalled();
  });
});
