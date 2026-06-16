/**
 * @module lib/managed-agents/__tests__/tool-name-aliases.test
 *
 * Tests for the publish/runtime translation layer that keeps Anthropic
 * reserved tool names from colliding with NeoBot's internal registry names.
 */
import { describe, expect, it } from "vitest";

import {
  toInternalManagedAgentToolName,
  toPublishedManagedAgentToolName,
} from "../tool-name-aliases";

describe("managed-agent tool name aliases", () => {
  it("aliases reserved internal tool names when publishing to Anthropic", () => {
    expect(toPublishedManagedAgentToolName("web_search")).toBe(
      "sunder_web_search",
    );
  });

  it("keeps non-reserved tool names unchanged when publishing", () => {
    expect(toPublishedManagedAgentToolName("search_crm")).toBe("search_crm");
  });

  it("maps Anthropic tool names back to the internal registry names", () => {
    expect(toInternalManagedAgentToolName("sunder_web_search")).toBe(
      "web_search",
    );
  });

  it("passes through unknown Anthropic names unchanged at runtime", () => {
    expect(toInternalManagedAgentToolName("search_crm")).toBe("search_crm");
  });
});
