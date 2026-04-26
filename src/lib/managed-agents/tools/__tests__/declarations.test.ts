import { describe, expect, it } from "vitest";

import {
  MANAGED_AGENT_TOOL_DECLARATIONS,
  MANAGED_AGENT_TOOL_NAMES,
} from "../index";

describe("MANAGED_AGENT_TOOL_DECLARATIONS", () => {
  it("publishes the four primary connection-management tools", () => {
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("create_connection");
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("list_connections");
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("reauthorize_connection");
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("delete_connection");
  });

  it("retains the temporary Composio execution compatibility layer", () => {
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("list_composio_tools");
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("execute_composio_tool");
  });

  it("publishes request_approval for destructive-action gating", () => {
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("request_approval");
  });

  it("publishes the CRM attachment listing tool", () => {
    expect(MANAGED_AGENT_TOOL_NAMES).toContain("list_record_attachments");
  });

  it("does not publish the retired activation and discovery tools", () => {
    expect(MANAGED_AGENT_TOOL_NAMES).not.toContain("search_integrations");
    expect(MANAGED_AGENT_TOOL_NAMES).not.toContain("get_integration_capabilities");
    expect(MANAGED_AGENT_TOOL_NAMES).not.toContain("get_connection_details");
    expect(MANAGED_AGENT_TOOL_NAMES).not.toContain("manage_activated_tools_for_connections");
  });
});

describe("tool descriptions are free of activation-era wording", () => {
  const toolNames = new Set([
    "create_connection",
    "list_connections",
    "delete_connection",
    "reauthorize_connection",
    "list_composio_tools",
    "execute_composio_tool",
  ]);
  const tools = MANAGED_AGENT_TOOL_DECLARATIONS.filter((tool) => toolNames.has(tool.name));

  const forbiddenPatterns: RegExp[] = [
    /activat/i,
    /deactivat/i,
    /grant\s+permissions/i,
    /toolsToActivate/,
    /manage_activated_tools/,
  ];

  for (const tool of tools) {
    it(`${tool.name} description contains no activation wording`, () => {
      for (const pattern of forbiddenPatterns) {
        expect(tool.description).not.toMatch(pattern);
      }
    });
  }
});
