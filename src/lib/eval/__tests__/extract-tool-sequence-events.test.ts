/**
 * @module lib/eval/__tests__/extract-tool-sequence-events.test
 *
 * Tests for the event-derived tool sequence extractor — the H3 replacement
 * for the old observation-derived path. Pairs `agent.custom_tool_use`
 * with the matching `user.custom_tool_result` and ignores everything else.
 */
import { describe, it, expect } from "vitest";

import { extractToolSequenceFromEvents } from "../extract-tool-sequence";

import {
  agentMessageTextEvent,
  bashToolUseEvent,
  builtInToolResultEvent,
  customToolResultEvent,
  customToolUseEvent,
} from "@/lib/managed-agents/__tests__/fixtures/events";

describe("extractToolSequenceFromEvents", () => {
  it("pairs agent.custom_tool_use with matching user.custom_tool_result", () => {
    const seq = extractToolSequenceFromEvents([
      customToolUseEvent("ctu_1", "ask_user_question", { question: "Delete?" }),
      customToolResultEvent("ctr_1", "ctu_1", { success: true }),
      customToolUseEvent("ctu_2", "delete_records", {
        entity: "contacts",
        ids: ["c1"],
      }),
      customToolResultEvent("ctr_2", "ctu_2", { success: true, deleted: 1 }),
    ]);
    expect(seq).toHaveLength(2);
    expect(seq[0].toolName).toBe("ask_user_question");
    expect(seq[1].toolName).toBe("delete_records");
    expect(seq[1].output).toEqual({ success: true, deleted: 1 });
  });

  it("preserves event order", () => {
    const seq = extractToolSequenceFromEvents([
      customToolUseEvent("a", "tool_a", {}),
      customToolUseEvent("b", "tool_b", {}),
      customToolResultEvent("ra", "a", { success: true }),
      customToolResultEvent("rb", "b", { success: true }),
    ]);
    expect(seq.map((r) => r.toolName)).toEqual(["tool_a", "tool_b"]);
  });

  it("ignores non-tool events", () => {
    const seq = extractToolSequenceFromEvents([
      agentMessageTextEvent("m1", "hello"),
      customToolUseEvent("ctu_1", "search_crm", {}),
      customToolResultEvent("ctr_1", "ctu_1", { success: true }),
    ]);
    expect(seq).toHaveLength(1);
    expect(seq[0].toolName).toBe("search_crm");
  });

  it("pairs built-in agent.tool_use with agent.tool_result (e.g. bash)", () => {
    const seq = extractToolSequenceFromEvents([
      bashToolUseEvent("tu_1", "ls /tmp", "allow"),
      builtInToolResultEvent("tr_1", "tu_1", "file_a\nfile_b\n"),
    ]);
    expect(seq).toHaveLength(1);
    expect(seq[0].toolName).toBe("bash");
    expect(seq[0].input).toEqual({ command: "ls /tmp" });
    expect(seq[0].output).toEqual({ text: "file_a\nfile_b\n", isError: false });
  });

  it("interleaves built-in and custom tool calls in event order", () => {
    const seq = extractToolSequenceFromEvents([
      customToolUseEvent("ctu_1", "search_crm", {}),
      customToolResultEvent("ctr_1", "ctu_1", { success: true }),
      bashToolUseEvent("tu_1", "ls", "allow"),
      builtInToolResultEvent("tr_1", "tu_1", "ok"),
      customToolUseEvent("ctu_2", "create_record", {}),
      customToolResultEvent("ctr_2", "ctu_2", { success: true }),
    ]);
    expect(seq.map((r) => r.toolName)).toEqual([
      "search_crm",
      "bash",
      "create_record",
    ]);
  });

  it("captures is_error on built-in tool failures", () => {
    const seq = extractToolSequenceFromEvents([
      bashToolUseEvent("tu_1", "false", "allow"),
      builtInToolResultEvent("tr_1", "tu_1", "exit 1", { isError: true }),
    ]);
    expect(seq).toHaveLength(1);
    expect(seq[0].output).toEqual({ text: "exit 1", isError: true });
  });
});
