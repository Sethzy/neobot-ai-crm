/**
 * Tests for spec-fence parsing in message persistence utilities.
 * @module lib/runner/message-utils.test
 */
import { describe, expect, it } from "vitest";

import { splitTextAndSpecParts, rehydrateSpecParts } from "./message-utils";

describe("splitTextAndSpecParts", () => {
  it("returns a single text part when no spec fences exist", () => {
    const result = splitTextAndSpecParts("Hello, here is your CRM summary.");
    expect(result).toEqual([{ type: "text", text: "Hello, here is your CRM summary." }]);
  });

  it("extracts data-spec parts from a spec fence", () => {
    const text = [
      "Here is your chart:",
      "```spec",
      '{"op":"add","path":"/root","value":"main"}',
      '{"op":"add","path":"/elements/main","value":{"type":"Card","props":{"title":"Overview"},"children":[]}}',
      "```",
      "Let me know if you need anything else.",
    ].join("\n");

    const result = splitTextAndSpecParts(text);

    expect(result).toEqual([
      { type: "text", text: "Here is your chart:" },
      {
        type: "data-spec",
        data: { type: "patch", patch: { op: "add", path: "/root", value: "main" } },
      },
      {
        type: "data-spec",
        data: {
          type: "patch",
          patch: {
            op: "add",
            path: "/elements/main",
            value: { type: "Card", props: { title: "Overview" }, children: [] },
          },
        },
      },
      { type: "text", text: "Let me know if you need anything else." },
    ]);
  });

  it("handles text with only a spec fence and no surrounding text", () => {
    const text = [
      "```spec",
      '{"op":"add","path":"/root","value":"main"}',
      "```",
    ].join("\n");

    const result = splitTextAndSpecParts(text);

    expect(result).toEqual([
      {
        type: "data-spec",
        data: { type: "patch", patch: { op: "add", path: "/root", value: "main" } },
      },
    ]);
  });

  it("skips malformed JSON lines inside fence", () => {
    const text = [
      "```spec",
      '{"op":"add","path":"/root","value":"main"}',
      "not json",
      '{"op":"add","path":"/elements/x","value":{"type":"Text","props":{"text":"hi"},"children":[]}}',
      "```",
    ].join("\n");

    const result = splitTextAndSpecParts(text);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      type: "data-spec",
      data: { type: "patch", patch: { op: "add", path: "/root", value: "main" } },
    });
    expect(result[1]).toEqual({
      type: "data-spec",
      data: {
        type: "patch",
        patch: {
          op: "add",
          path: "/elements/x",
          value: { type: "Text", props: { text: "hi" }, children: [] },
        },
      },
    });
  });

  it("handles trailing text after spec fence", () => {
    const text = [
      "```spec",
      '{"op":"add","path":"/root","value":"main"}',
      "```",
      "Done!",
    ].join("\n");

    const result = splitTextAndSpecParts(text);

    expect(result).toHaveLength(2);
    expect(result[0]?.type).toBe("data-spec");
    expect(result[1]).toEqual({ type: "text", text: "Done!" });
  });
});

describe("rehydrateSpecParts", () => {
  it("passes through parts without spec fences unchanged", () => {
    const parts = [
      { type: "text", text: "Hello" },
      { type: "step-start" },
      { type: "tool-search_crm", toolCallId: "abc", state: "output-available" },
    ];

    const result = rehydrateSpecParts(parts);
    expect(result).toEqual(parts);
  });

  it("splits text parts containing spec fences into text + data-spec parts", () => {
    const parts = [
      { type: "text", text: "Before" },
      {
        type: "text",
        text: [
          "Here is your chart:",
          "```spec",
          '{"op":"add","path":"/root","value":"main"}',
          "```",
          "After the chart.",
        ].join("\n"),
      },
      { type: "text", text: "Another text part" },
    ];

    const result = rehydrateSpecParts(parts);

    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ type: "text", text: "Before" });
    expect(result[1]).toEqual({ type: "text", text: "Here is your chart:" });
    expect(result[2]).toEqual({
      type: "data-spec",
      data: { type: "patch", patch: { op: "add", path: "/root", value: "main" } },
    });
    expect(result[3]).toEqual({ type: "text", text: "After the chart." });
    expect(result[4]).toEqual({ type: "text", text: "Another text part" });
  });

  it("preserves existing data-spec parts", () => {
    const parts = [
      { type: "text", text: "Hello" },
      { type: "data-spec", data: { type: "patch", patch: { op: "add", path: "/root", value: "x" } } },
    ];

    const result = rehydrateSpecParts(parts);
    expect(result).toEqual(parts);
  });
});
