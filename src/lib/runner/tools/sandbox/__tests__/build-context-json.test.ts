import { describe, expect, it } from "vitest";

import { buildContextJson } from "../build-context-json";
import type { SandboxContextEntry } from "../types";

describe("buildContextJson", () => {
  it("excludes bash tool results", () => {
    const entries: SandboxContextEntry[] = [
      { toolCallId: "1", toolName: "search_crm", input: { entity: "contacts" }, output: { success: true, records: [] } },
      { toolCallId: "2", toolName: "bash", input: { command: "ls" }, output: { stdout: "file.txt" } },
    ];
    const result = JSON.parse(buildContextJson(entries));
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].toolName).toBe("search_crm");
  });

  it("excludes multimodal read_file results (image/PDF)", () => {
    const entries: SandboxContextEntry[] = [
      { toolCallId: "1", toolName: "read_file", input: { path: "/agent/data.csv" }, output: { success: true, type: "text", content: "a,b\n1,2" } },
      { toolCallId: "2", toolName: "read_file", input: { path: "/agent/photo.png" }, output: { success: true, type: "image", data: "base64...", mediaType: "image/png" } },
      { toolCallId: "3", toolName: "read_file", input: { path: "/agent/report.pdf" }, output: { success: true, type: "pdf", data: "base64...", mediaType: "application/pdf" } },
    ];
    const result = JSON.parse(buildContextJson(entries));
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].toolCallId).toBe("1");
  });

  it("excludes operational tools", () => {
    const entries: SandboxContextEntry[] = [
      { toolCallId: "1", toolName: "search_crm", input: {}, output: { success: true } },
      { toolCallId: "2", toolName: "write_file", input: {}, output: { success: true } },
      { toolCallId: "3", toolName: "rename_chat", input: {}, output: { success: true } },
      { toolCallId: "4", toolName: "send_message", input: {}, output: { success: true } },
      { toolCallId: "5", toolName: "web_search", input: {}, output: { results: [] } },
    ];
    const result = JSON.parse(buildContextJson(entries));
    expect(result.tools).toHaveLength(2);
    expect(result.tools.map((t: { toolName: string }) => t.toolName)).toEqual(["search_crm", "web_search"]);
  });

  it("truncates when serialized payload exceeds 500KB", () => {
    const entries: SandboxContextEntry[] = Array.from({ length: 100 }, (_, i) => ({
      toolCallId: `call-${i}`,
      toolName: "search_crm",
      input: { query: "x" },
      output: { data: "x".repeat(10_000) },
    }));
    const json = buildContextJson(entries);
    expect(Buffer.byteLength(json)).toBeLessThanOrEqual(500_000);
    const parsed = JSON.parse(json);
    expect(parsed._truncated).toBe(true);
    expect(parsed.tools.length).toBeLessThan(100);
  });

  it("includes generatedAt timestamp", () => {
    const entries: SandboxContextEntry[] = [
      { toolCallId: "1", toolName: "search_crm", input: {}, output: {} },
    ];
    const result = JSON.parse(buildContextJson(entries));
    expect(result.generatedAt).toBeDefined();
    expect(new Date(result.generatedAt).getTime()).not.toBeNaN();
  });

  it("returns empty tools array when no entries", () => {
    const result = JSON.parse(buildContextJson([]));
    expect(result.tools).toEqual([]);
  });
});
