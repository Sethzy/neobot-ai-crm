/**
 * Tests for the search_triggers tool.
 * @module lib/runner/tools/triggers/__tests__/search-triggers
 */
import { describe, expect, it } from "vitest";

import { createSearchTriggersTool } from "../search-triggers";

const EXECUTION_OPTIONS = {
  toolCallId: "tool-call-id",
  messages: [],
  abortSignal: undefined as unknown as AbortSignal,
};

describe("createSearchTriggersTool", () => {
  it("returns all supported trigger types for a broad keyword", async () => {
    const { search_triggers } = createSearchTriggersTool();

    const result = await search_triggers.execute(
      { keywords: ["trigger"] },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.triggers.map((trigger) => trigger.trigger_id)).toEqual([
      "schedule",
      "webhook",
      "rss",
    ]);
  });

  it("matches schedule trigger details for cron-oriented searches", async () => {
    const { search_triggers } = createSearchTriggersTool();

    const result = await search_triggers.execute(
      { keywords: ["cron"] },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0]).toMatchObject({
      trigger_id: "schedule",
      setupSchema: expect.objectContaining({
        cron: expect.objectContaining({ type: "string", required: true }),
        timezone: expect.objectContaining({ type: "string" }),
      }),
      editSchema: expect.objectContaining({
        cron: expect.any(Object),
        timezone: expect.any(Object),
      }),
    });
  });

  it("matches webhook trigger details for inbound event searches", async () => {
    const { search_triggers } = createSearchTriggersTool();

    const result = await search_triggers.execute(
      { keywords: ["webhook"] },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0]).toMatchObject({
      trigger_id: "webhook",
      setupSchema: expect.objectContaining({
        webhook_secret: expect.objectContaining({ type: "string" }),
      }),
    });
  });

  it("matches rss trigger details for feed monitoring searches", async () => {
    const { search_triggers } = createSearchTriggersTool();

    const result = await search_triggers.execute(
      { keywords: ["feed"] },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0]).toMatchObject({
      trigger_id: "rss",
      setupSchema: expect.objectContaining({
        feed_url: expect.objectContaining({ type: "string", required: true }),
        polling_interval_minutes: expect.objectContaining({ type: "number" }),
      }),
    });
  });

  it("returns an empty list when nothing matches", async () => {
    const { search_triggers } = createSearchTriggersTool();

    const result = await search_triggers.execute(
      { keywords: ["definitely-not-a-trigger"] },
      EXECUTION_OPTIONS,
    );

    expect(result.success).toBe(true);
    expect(result.triggers).toEqual([]);
  });
});
