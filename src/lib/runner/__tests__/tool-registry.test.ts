/**
 * Tests for runner tool registry composition rules.
 * @module lib/runner/__tests__/tool-registry
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateBrowserTools,
  mockCreateConnectionTools,
  mockCreateCrmTools,
  mockCreateStorageTools,
  mockCreateTriggerTools,
  mockCreateUtilityTools,
  mockCreateWebTools,
  mockIsBrowserUseConfigured,
} = vi.hoisted(() => ({
  mockCreateBrowserTools: vi.fn(),
  mockCreateConnectionTools: vi.fn(),
  mockCreateCrmTools: vi.fn(),
  mockCreateStorageTools: vi.fn(),
  mockCreateTriggerTools: vi.fn(),
  mockCreateUtilityTools: vi.fn(),
  mockCreateWebTools: vi.fn(),
  mockIsBrowserUseConfigured: vi.fn(),
}));

vi.mock("@/lib/browser-use/client", () => ({
  isBrowserUseConfigured: mockIsBrowserUseConfigured,
}));

vi.mock("@/lib/runner/tools", () => ({
  createBrowserTools: mockCreateBrowserTools,
  createConnectionTools: mockCreateConnectionTools,
  createCrmTools: mockCreateCrmTools,
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
    mockIsBrowserUseConfigured.mockReturnValue(true);
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
});
