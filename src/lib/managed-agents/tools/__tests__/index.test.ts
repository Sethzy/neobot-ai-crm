import { describe, expect, it } from "vitest";

import {
  MANAGED_AGENT_TOOL_DECLARATIONS,
  MANAGED_AGENT_TOOL_NAMES,
  MANAGED_AGENT_TOOLS,
} from "../index";

describe("MANAGED_AGENT_TOOLS registry", () => {
  it("matches the canonical tool declaration source", () => {
    const names = Object.keys(MANAGED_AGENT_TOOLS).sort();

    expect(names).toEqual([...MANAGED_AGENT_TOOL_NAMES].sort());
  });

  it("keeps the declaration source free of duplicate tool names", () => {
    expect(new Set(MANAGED_AGENT_TOOL_NAMES).size).toBe(MANAGED_AGENT_TOOL_NAMES.length);
  });

  it("sets chatOnly: true on exactly run_sql and get_agent_db_schema", () => {
    const chatOnly = MANAGED_AGENT_TOOL_DECLARATIONS
      .filter((tool) => tool.chatOnly === true)
      .map((tool) => tool.name)
      .sort();

    expect(chatOnly).toEqual(["get_agent_db_schema", "run_sql"]);
  });

  it("keeps each tool name aligned with its registry key", () => {
    for (const [key, tool] of Object.entries(MANAGED_AGENT_TOOLS)) {
      expect(tool.name).toBe(key);
    }
  });
});
