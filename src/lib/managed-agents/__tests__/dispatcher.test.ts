/**
 * @module lib/managed-agents/__tests__/dispatcher.test
 *
 * Tests for `dispatchCustomTool` — the bridge from Anthropic
 * `agent.custom_tool_use` events into the local MANAGED_AGENT_TOOLS registry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

import { dispatchCustomTool } from "../dispatcher";
import type { ManagedAgentTool } from "../types";

vi.mock("@/lib/managed-agents/tools", () => ({
  MANAGED_AGENT_TOOLS: {} as Record<string, ManagedAgentTool>,
}));

const { MANAGED_AGENT_TOOLS } = await import("@/lib/managed-agents/tools");

function stubContext(
  overrides: Partial<Parameters<typeof dispatchCustomTool>[1]> = {},
) {
  return {
    supabase: {} as never,
    clientId: "client-1",
    threadId: "thread-1",
    isChatContext: true,
    ...overrides,
  };
}

beforeEach(() => {
  for (const key of Object.keys(MANAGED_AGENT_TOOLS)) {
    delete (MANAGED_AGENT_TOOLS as Record<string, ManagedAgentTool>)[key];
  }
});

describe("dispatchCustomTool", () => {
  it("returns success content for a valid tool call", async () => {
    const execute = vi.fn().mockResolvedValue({ success: true, count: 3 });
    (MANAGED_AGENT_TOOLS as Record<string, ManagedAgentTool>)["search_crm"] = {
      name: "search_crm",
      description: "search the crm",
      inputSchema: z.object({ entity: z.string() }),
      execute,
    } as ManagedAgentTool;

    const result = await dispatchCustomTool(
      {
        type: "agent.custom_tool_use",
        id: "ctu_1",
        name: "search_crm",
        input: { entity: "contacts" },
      },
      stubContext(),
    );

    expect(execute).toHaveBeenCalledWith(
      { entity: "contacts" },
      expect.objectContaining({ clientId: "client-1", isChatContext: true }),
    );
    expect(result.custom_tool_use_id).toBe("ctu_1");
    expect(result.is_error).toBeUndefined();
    expect(JSON.parse(result.content[0].text)).toEqual({
      success: true,
      count: 3,
    });
  });

  it("returns an is_error result for unknown tool names", async () => {
    const result = await dispatchCustomTool(
      {
        type: "agent.custom_tool_use",
        id: "ctu_2",
        name: "does_not_exist",
        input: {},
      },
      stubContext(),
    );
    expect(result.is_error).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({
      success: false,
      error: "Unknown tool: does_not_exist",
    });
  });

  it("returns an is_error result when Zod validation fails", async () => {
    (MANAGED_AGENT_TOOLS as Record<string, ManagedAgentTool>)["create_record"] =
      {
        name: "create_record",
        description: "create a record",
        inputSchema: z.object({ entity: z.enum(["contact", "deal"]) }),
        execute: vi.fn(),
      } as ManagedAgentTool;
    const result = await dispatchCustomTool(
      {
        type: "agent.custom_tool_use",
        id: "ctu_3",
        name: "create_record",
        input: { entity: "banana" },
      },
      stubContext(),
    );
    expect(result.is_error).toBe(true);
    expect(result.content[0].text).toMatch(/Invalid input for create_record/);
  });

  it("rejects chatOnly tools when isChatContext is false", async () => {
    const execute = vi.fn();
    (MANAGED_AGENT_TOOLS as Record<string, ManagedAgentTool>)["run_sql"] = {
      name: "run_sql",
      description: "run sql",
      inputSchema: z.object({ query: z.string() }),
      chatOnly: true,
      execute,
    } as ManagedAgentTool;
    const result = await dispatchCustomTool(
      {
        type: "agent.custom_tool_use",
        id: "ctu_4",
        name: "run_sql",
        input: { query: "select 1" },
      },
      stubContext({ isChatContext: false }),
    );
    expect(execute).not.toHaveBeenCalled();
    expect(result.is_error).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual({
      success: false,
      error: "Tool not available in trigger runs. Use search_crm instead.",
    });
  });

  it("allows chatOnly tools when isChatContext is true", async () => {
    const execute = vi.fn().mockResolvedValue({ success: true, rows: [] });
    (MANAGED_AGENT_TOOLS as Record<string, ManagedAgentTool>)["run_sql"] = {
      name: "run_sql",
      description: "run sql",
      inputSchema: z.object({ query: z.string() }),
      chatOnly: true,
      execute,
    } as ManagedAgentTool;
    const result = await dispatchCustomTool(
      {
        type: "agent.custom_tool_use",
        id: "ctu_5",
        name: "run_sql",
        input: { query: "select 1" },
      },
      stubContext({ isChatContext: true }),
    );
    expect(execute).toHaveBeenCalled();
    expect(result.is_error).toBeUndefined();
  });
});
