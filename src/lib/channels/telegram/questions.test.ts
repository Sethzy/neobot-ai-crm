/**
 * Tests for Telegram ask_user_question helpers.
 * @module lib/channels/telegram/questions.test
 */
import { describe, expect, it } from "vitest";

import {
  buildQuestionCallbackData,
  buildQuestionText,
  buildUnsupportedQuestionFallback,
  formatQuestionResponse,
  isSupportedQuestionType,
  parseQuestionCallback,
} from "./questions";

describe("buildQuestionText", () => {
  it("includes the question text", () => {
    expect(buildQuestionText("Which contact?", ["John Tan", "Mary Lee"])).toContain(
      "Which contact?",
    );
  });

  it("lists numbered options", () => {
    const text = buildQuestionText("Pick one:", ["Alpha", "Beta", "Gamma"]);
    expect(text).toContain("1. Alpha");
    expect(text).toContain("2. Beta");
    expect(text).toContain("3. Gamma");
  });

  it("renders option descriptions when provided (Dorabot parity)", () => {
    const text = buildQuestionText("Pick a contact:", [
      { label: "John Tan", description: "CEO at Acme Corp" },
      { label: "Mary Lee" },
      "Plain string option",
    ]);
    expect(text).toContain("1. <b>John Tan</b> — CEO at Acme Corp");
    expect(text).toContain("2. Mary Lee");
    expect(text).toContain("3. Plain string option");
  });

  it("escapes HTML in descriptions", () => {
    const text = buildQuestionText("Pick:", [
      { label: "A & B", description: "Uses <tags>" },
    ]);
    expect(text).toContain("<b>A &amp; B</b> — Uses &lt;tags&gt;");
  });
});

describe("parseQuestionCallback", () => {
  it("parses valid callback payloads", () => {
    expect(parseQuestionCallback("q:abc123:1:2")).toEqual({
      requestId: "abc123",
      questionIndex: 1,
      optionIndex: 2,
    });
  });

  it("returns null for invalid payloads", () => {
    expect(parseQuestionCallback("approve:abc")).toBeNull();
    expect(parseQuestionCallback("q:")).toBeNull();
    expect(parseQuestionCallback("q:abc:1:notanumber")).toBeNull();
  });

  it("allows request ids containing colons", () => {
    expect(parseQuestionCallback("q:abc:def:0:1")).toEqual({
      requestId: "abc:def",
      questionIndex: 0,
      optionIndex: 1,
    });
  });
});

describe("buildQuestionCallbackData", () => {
  it("encodes both question and option indices", () => {
    expect(buildQuestionCallbackData("batch-123", 2, 1)).toBe("q:batch-123:2:1");
  });
});

describe("formatQuestionResponse", () => {
  it("formats one answer in the web-compatible q/a shape", () => {
    expect(
      formatQuestionResponse([{ question: "Which contact?", selectedOption: "John Tan" }]),
    ).toBe("Q: Which contact?\nA: John Tan");
  });

  it("formats multiple answers in order", () => {
    expect(
      formatQuestionResponse([
        { question: "Who?", selectedOption: "John" },
        { question: "When?", selectedOption: "Tomorrow" },
      ]),
    ).toBe("Q: Who?\nA: John\n\nQ: When?\nA: Tomorrow");
  });
});

describe("isSupportedQuestionType", () => {
  it("supports single_select", () => {
    expect(isSupportedQuestionType("single_select")).toBe(true);
  });

  it("rejects multi_select and rank_priorities for inline buttons", () => {
    expect(isSupportedQuestionType("multi_select")).toBe(false);
    expect(isSupportedQuestionType("rank_priorities")).toBe(false);
  });
});

describe("buildUnsupportedQuestionFallback", () => {
  it("builds a prose fallback prompting for a reply", () => {
    const text = buildUnsupportedQuestionFallback(
      "Which contacts?",
      ["John", "Mary", "Alex"],
      "multi_select",
    );
    expect(text).toContain("Which contacts?");
    expect(text).toContain("John");
    expect(text).toContain("Mary");
    expect(text).toContain("reply");
  });
});
