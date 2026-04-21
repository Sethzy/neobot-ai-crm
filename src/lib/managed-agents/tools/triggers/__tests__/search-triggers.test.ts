import { describe, expect, it } from "vitest";

import { searchTriggersTool } from "../search-triggers";

describe("searchTriggersTool", () => {
  it("accepts a single space-delimited keyword string from the model", async () => {
    const parsed = searchTriggersTool.inputSchema.safeParse({
      keywords: "automation schedule reminder follow-up CRM",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }

    expect(parsed.data).toEqual({
      keywords: ["automation", "schedule", "reminder", "follow-up", "CRM"],
    });

    const result = await searchTriggersTool.execute(parsed.data);

    expect(result.success).toBe(true);
    expect(result.triggers.map((trigger) => trigger.trigger_id)).toContain("schedule");
  });

  it("returns all trigger types for a broad keyword", async () => {
    const result = await searchTriggersTool.execute({ keywords: ["trigger"] });

    expect(result.success).toBe(true);
    expect(result.triggers.map((trigger) => trigger.trigger_id)).toEqual([
      "schedule",
      "webhook",
      "rss",
    ]);
  });

  it("returns an empty list when nothing matches", async () => {
    const result = await searchTriggersTool.execute({ keywords: ["definitely-not-a-trigger"] });

    expect(result).toEqual({ success: true, triggers: [] });
  });

  it("tokenizes multi-word array entries before matching", async () => {
    const result = await searchTriggersTool.execute({
      keywords: ["automation schedule reminder follow-up CRM"],
    });

    expect(result.success).toBe(true);
    expect(result.triggers.map((trigger) => trigger.trigger_id)).toContain("schedule");
  });
});
