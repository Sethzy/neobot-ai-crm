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
  it("defines Claude Sonnet 4.6 as the default chat model", () => {
    expect(DEFAULT_CHAT_MODEL).toBe("anthropic/claude-sonnet-4-6");
  });

  it("exposes Claude Sonnet 4.6 as the single user-selectable model", () => {
    expect(chatModels).toEqual([
      expect.objectContaining({
        id: "anthropic/claude-sonnet-4-6",
        name: "Claude Sonnet 4.6",
        provider: "anthropic",
      }),
    ]);
  });

  it("exposes the allowed model ids set", () => {
    expect(allowedModelIds.has("anthropic/claude-sonnet-4-6")).toBe(true);
    expect(allowedModelIds.has("not-a-real-model")).toBe(false);
  });
});

describe("resolveModelId", () => {
  it("returns the selected model when it is allowed", () => {
    expect(resolveModelId("anthropic/claude-sonnet-4-6")).toBe(
      "anthropic/claude-sonnet-4-6",
    );
  });

  it("falls back to the default chat model when the selection is invalid", () => {
    expect(resolveModelId("invalid/model-id")).toBe(DEFAULT_CHAT_MODEL);
  });

  it("falls back to the default chat model when the selection is missing", () => {
    expect(resolveModelId(undefined)).toBe(DEFAULT_CHAT_MODEL);
  });
});
