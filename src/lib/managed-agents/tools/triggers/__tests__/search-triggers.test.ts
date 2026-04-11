import { describe, expect, it } from "vitest";

import { searchTriggersTool } from "../search-triggers";

describe("searchTriggersTool", () => {
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
});
