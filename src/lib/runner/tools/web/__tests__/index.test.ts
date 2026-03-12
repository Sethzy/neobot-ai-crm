/**
 * Tests for web tool barrel registration.
 * @module lib/runner/tools/web/__tests__/index
 */
import { describe, expect, it } from "vitest";

import { createWebTools } from "../index";

describe("createWebTools", () => {
  it("returns all web tools", () => {
    const tools = createWebTools();

    expect(Object.keys(tools).sort()).toEqual([
      "calculate_drive_time",
      "web_scrape",
      "web_search",
    ]);
  });

  it("ensures each web tool has an execute function", () => {
    const tools = createWebTools();

    for (const [toolName, toolDefinition] of Object.entries(tools)) {
      expect(toolDefinition, `${toolName} should have execute`).toHaveProperty("execute");
    }
  });
});
