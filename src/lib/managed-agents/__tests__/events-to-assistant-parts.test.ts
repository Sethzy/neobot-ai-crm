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
