/**
 * @module lib/managed-agents/__tests__/events-to-assistant-parts.test
 *
 * Tests for the Event[] → PersistedPart[] translator that the session runner
 * uses both incrementally and on the terminal `createMessages` write.
 */
import { describe, it, expect } from "vitest";

import { buildAssistantPartsFromEvents } from "../events-to-assistant-parts";

import {
  agentMessageTextEvent,
  bashToolUseEvent,
  builtInToolResultEvent,
  customToolResultEvent,
  customToolUseEvent,
  modelRequestStartEvent,
  statusIdleEvent,
} from "./fixtures/events";

describe("buildAssistantPartsFromEvents", () => {
  it("emits step-start + text parts for agent.message", () => {
    const parts = buildAssistantPartsFromEvents([
      modelRequestStartEvent("span_1"),
      agentMessageTextEvent("evt_1", "Hello"),
      statusIdleEvent("evt_end", "end_turn"),
    ]);
    expect(parts).toEqual([
      { type: "step-start" },
      { type: "text", text: "Hello" },
    ]);
  });

  it("emits tool-<name> parts with matching tool-call + tool-result states", () => {
    const parts = buildAssistantPartsFromEvents([
      modelRequestStartEvent("span_1"),
      customToolUseEvent("ctu_1", "search_crm", { entity: "contacts" }),
      customToolResultEvent("ctr_1", "ctu_1", {
        success: true,
        records: [{ id: "c1" }],
      }),
      statusIdleEvent("evt_end", "end_turn"),
    ]);
    const toolPart = parts.find((p) => p.type === "tool-search_crm");
    expect(toolPart).toMatchObject({
      toolCallId: "ctu_1",
      state: "output-available",
      input: { entity: "contacts" },
      output: { success: true, records: [{ id: "c1" }] },
    });
  });

  it("preserves custom tool failures as output-error parts", () => {
    const parts = buildAssistantPartsFromEvents([
      modelRequestStartEvent("span_1"),
      customToolUseEvent("ctu_err", "create_connection", {
        integrations: ["notion"],
      }),
      customToolResultEvent(
        "ctr_err",
        "ctu_err",
        {
          success: false,
          error: "Invalid input for create_connection",
        },
        { isError: true },
      ),
      statusIdleEvent("evt_end", "end_turn"),
    ]);

    const toolPart = parts.find((p) => p.type === "tool-create_connection");
    expect(toolPart).toMatchObject({
      toolCallId: "ctu_err",
      state: "output-error",
      input: { integrations: ["notion"] },
      errorText: JSON.stringify({
        success: false,
        error: "Invalid input for create_connection",
      }),
    });
    expect(toolPart?.output).toBeUndefined();
  });

  it("emits an approval-requested tool part for bash with evaluated_permission='ask'", () => {
    const parts = buildAssistantPartsFromEvents([
      modelRequestStartEvent("span_1"),
      bashToolUseEvent("tu_1", "rm -rf /tmp", "ask"),
      statusIdleEvent("evt_idle", "requires_action"),
    ]);
    const approvalPart = parts.find(
      (p) => typeof p.type === "string" && p.type.startsWith("tool-bash"),
    );
    expect(approvalPart).toMatchObject({
      type: "tool-bash",
      toolCallId: "tu_1",
      state: "approval-requested",
      input: { command: "rm -rf /tmp" },
      approval: { id: "tu_1" },
    });
  });

  it("does NOT emit approval-requested parts for bash with evaluated_permission='allow'", () => {
    const parts = buildAssistantPartsFromEvents([
      modelRequestStartEvent("span_1"),
      bashToolUseEvent("tu_1", "ls", "allow"),
      builtInToolResultEvent("tr_1", "tu_1", "file_a"),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);
    const bashPart = parts.find(
      (p) => typeof p.type === "string" && p.type.startsWith("tool-bash"),
    );
    expect(bashPart).toMatchObject({
      type: "tool-bash",
      toolCallId: "tu_1",
      state: "output-available",
      input: { command: "ls" },
      output: { text: "file_a", isError: false },
    });
    expect(bashPart?.approval).toBeUndefined();
  });

  it("captures is_error on built-in tool failures", () => {
    const parts = buildAssistantPartsFromEvents([
      modelRequestStartEvent("span_1"),
      bashToolUseEvent("tu_1", "false", "allow"),
      builtInToolResultEvent("tr_1", "tu_1", "exit 1", { isError: true }),
      statusIdleEvent("evt_idle", "end_turn"),
    ]);
    const bashPart = parts.find(
      (p) => typeof p.type === "string" && p.type.startsWith("tool-bash"),
    );
    expect(bashPart).toMatchObject({
      state: "output-error",
      output: { text: "exit 1", isError: true },
    });
  });

  it("normalizes Anthropic aliased tool names in persisted tool parts", () => {
    const parts = buildAssistantPartsFromEvents([
      modelRequestStartEvent("span_1"),
      customToolUseEvent("ctu_2", "sunder_web_search", { query: "sg condos" }),
      customToolResultEvent("ctr_2", "ctu_2", {
        success: true,
        results: [{ url: "https://example.com" }],
      }),
      statusIdleEvent("evt_end", "end_turn"),
    ]);

    const toolPart = parts.find((p) => p.type === "tool-web_search");
    expect(toolPart).toMatchObject({
      toolCallId: "ctu_2",
      state: "output-available",
      input: { query: "sg condos" },
      output: { success: true, results: [{ url: "https://example.com" }] },
    });
  });

  it("splits ```spec fences inside agent.message text into data-spec parts", () => {
    const text =
      'Here is the data:\n```spec\n{"op":"replace","path":"/metric","value":42}\n```\nDone.';
    const parts = buildAssistantPartsFromEvents([
      modelRequestStartEvent("span_1"),
      agentMessageTextEvent("evt_1", text),
      statusIdleEvent("evt_end", "end_turn"),
    ]);
    const types = parts.map((p) => p.type);
    expect(types).toContain("text");
    expect(
      types.some((t) => typeof t === "string" && t.startsWith("data-")),
    ).toBe(true);
  });
});
