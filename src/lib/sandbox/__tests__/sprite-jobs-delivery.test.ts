/** Tests for sprite job delivery and progress parsing. */
import { describe, it, expect } from "vitest";

import { parseProgressFromLines } from "../sprite-jobs";

describe("parseProgressFromLines", () => {
  it("extracts tool_use name from stream-json NDJSON", () => {
    const lines = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: "pip3 install pandas" } }] } }),
    ].join("\n");

    const result = parseProgressFromLines(lines);
    expect(result).toBe("Running: pip3 install pandas");
  });

  it("extracts Edit tool with file path", () => {
    const lines = [
      JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: "/workspace/model.xlsx" } }] } }),
    ].join("\n");

    const result = parseProgressFromLines(lines);
    expect(result).toBe("Editing /workspace/model.xlsx");
  });

  it("returns null for empty input", () => {
    expect(parseProgressFromLines("")).toBeNull();
  });

  it("skips malformed JSON lines", () => {
    const lines = "not json\n" + JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Read", input: {} }] } });
    const result = parseProgressFromLines(lines);
    expect(result).toBe("Reading file");
  });

  it("truncates long Bash commands", () => {
    const longCmd = "a".repeat(100);
    const lines = JSON.stringify({ type: "assistant", message: { content: [{ type: "tool_use", name: "Bash", input: { command: longCmd } }] } });
    const result = parseProgressFromLines(lines);
    expect(result).toBe(`Running: ${"a".repeat(60)}`);
  });
});
