import { describe, expect, it } from "vitest";

import {
  cleanStopWords,
  formatDuration,
  formatRecordingTime,
  parseTranscriptLine,
} from "../format-helpers";

describe("formatDuration", () => {
  it("formats 0 seconds as 00:00", () => {
    expect(formatDuration(0)).toBe("00:00");
  });

  it("formats 65 seconds as 01:05", () => {
    expect(formatDuration(65)).toBe("01:05");
  });

  it("formats 3600 seconds as 60:00", () => {
    expect(formatDuration(3600)).toBe("60:00");
  });
});

describe("formatRecordingTime", () => {
  it("formats undefined as [--:--]", () => {
    expect(formatRecordingTime(undefined)).toBe("[--:--]");
  });

  it("formats 0 as [00:00]", () => {
    expect(formatRecordingTime(0)).toBe("[00:00]");
  });

  it("formats 125.3 as [02:05]", () => {
    expect(formatRecordingTime(125.3)).toBe("[02:05]");
  });
});

describe("cleanStopWords", () => {
  it("removes filler words", () => {
    expect(cleanStopWords("uh so we talked um about the deal")).toBe("so we talked about the deal");
  });

  it("handles empty strings", () => {
    expect(cleanStopWords("")).toBe("");
  });

  it("preserves normal text", () => {
    expect(cleanStopWords("Met with John about pricing")).toBe("Met with John about pricing");
  });

  it("removes multiple consecutive fillers", () => {
    expect(cleanStopWords("uh um er the meeting")).toBe("the meeting");
  });
});

describe("parseTranscriptLine", () => {
  it("parses a line with speaker label", () => {
    expect(parseTranscriptLine("[00:12] Speaker 1: we need to close by Friday")).toEqual({
      start: 12,
      text: "we need to close by Friday",
      speaker: "Speaker 1",
    });
  });

  it("parses a line without speaker label (legacy format)", () => {
    expect(parseTranscriptLine("[00:12] we need to close by Friday")).toEqual({
      start: 12,
      text: "we need to close by Friday",
      speaker: null,
    });
  });

  it("returns null for non-matching lines", () => {
    expect(parseTranscriptLine("just some text")).toBeNull();
  });

  it("handles multi-digit minutes", () => {
    expect(parseTranscriptLine("[12:05] Speaker 2: wrapping up")).toEqual({
      start: 725,
      text: "wrapping up",
      speaker: "Speaker 2",
    });
  });
});
