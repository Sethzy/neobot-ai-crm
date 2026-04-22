/**
 * @module scripts/managed-agents/__tests__/create-agent-system.test
 *
 * Regression coverage for the managed-agent system prompt filesystem rules.
 */
import { describe, expect, it } from "vitest";

import { buildManagedAgentSystem } from "../create-agent";

describe("managed-agent system prompt source", () => {
  it("documents workspace skill mounts as built-in-tool-only session paths", () => {
    const systemPrompt = buildManagedAgentSystem("- xlsx: spreadsheet workflow");

    expect(systemPrompt).toContain("**Session-mounted skills** (`/workspace/skills/<slug>/*`)");
    expect(systemPrompt).toContain(
      "Use built-in tools on `/workspace/skills/*` paths. These skill mounts are not durable files, so never call `storage_read` or `storage_write` on them.",
    );
    expect(systemPrompt).toContain(
      "Do not look for attached skills under `/agent/skills/*`. Attached managed-agent skills live under `/workspace/skills/*` in this environment.",
    );
  });

  it("documents the request_approval gate for destructive CRM actions", () => {
    const systemPrompt = buildManagedAgentSystem("- xlsx: spreadsheet workflow");

    expect(systemPrompt).toContain(
      "Before `delete_records` or `configure_crm`, call `request_approval` with a short summary and wait for the result.",
    );
    expect(systemPrompt).toContain(
      "If `request_approval` returns approved, continue with the action. If it returns denied, do not perform the action and explain that it was blocked.",
    );
  });
});
