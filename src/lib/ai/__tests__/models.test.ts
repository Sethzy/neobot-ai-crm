/**
 * @fileoverview Tests for the chat model catalog and model resolution helpers.
 */

import { describe, expect, it } from "vitest";

import {
  allowedModelIds,
  chatModels,
  DEFAULT_CHAT_MODEL,
  resolveModelId,
} from "@/lib/ai/models";

describe("chat model catalog", () => {
  it("defines Gemini Flash 3 as the default chat model", () => {
    expect(DEFAULT_CHAT_MODEL).toBe("google/gemini-3-flash");
  });

  it("includes the initial Gemini and MiniMax model options", () => {
    expect(chatModels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "google/gemini-3-flash",
          provider: "google",
        }),
        expect.objectContaining({
          id: "minimax/minimax-m2.7",
          provider: "minimax",
        }),
      ]),
    );
  });

  it("exposes the allowed model ids set", () => {
    expect(allowedModelIds.has("google/gemini-3-flash")).toBe(true);
    expect(allowedModelIds.has("minimax/minimax-m2.7")).toBe(true);
    expect(allowedModelIds.has("not-a-real-model")).toBe(false);
  });
});

describe("resolveModelId", () => {
  it("returns the selected model when it is allowed", () => {
    expect(resolveModelId("minimax/minimax-m2.7")).toBe("minimax/minimax-m2.7");
  });

  it("falls back to the default chat model when the selection is invalid", () => {
    expect(resolveModelId("invalid/model-id")).toBe(DEFAULT_CHAT_MODEL);
  });

  it("falls back to the default chat model when the selection is missing", () => {
    expect(resolveModelId(undefined)).toBe(DEFAULT_CHAT_MODEL);
  });
});
