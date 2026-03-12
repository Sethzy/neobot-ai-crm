/**
 * Tests for system prompt content and safety instructions.
 * @module lib/ai/__tests__/system-prompt
 */

import { describe, expect, it } from "vitest";

import { SETUP_SYSTEM_PROMPT, SYSTEM_PROMPT } from "@/lib/ai/system-prompt";

describe("SYSTEM_PROMPT", () => {
  it("exports a non-empty string", () => {
    expect(typeof SYSTEM_PROMPT).toBe("string");
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("mentions real estate context", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("real estate");
  });

  it("mentions singapore context", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("singapore");
  });

  it("sets concise and practical response expectations", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("concise");
    expect(lower).toContain("practical");
  });

  it("includes mechanical safety guidance for approval-gated tools", () => {
    expect(SYSTEM_PROMPT).toContain("<safety>");
    expect(SYSTEM_PROMPT).toContain("Destructive tools");
    expect(SYSTEM_PROMPT).toContain("run immediately");
  });

  it("removes the old manual approval example block", () => {
    expect(SYSTEM_PROMPT).not.toContain("<approval-required>");
    expect(SYSTEM_PROMPT).not.toContain("Shall I go ahead?");
  });

  it("mentions all three tool categories", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).toContain("crm");
    expect(lower).toContain("file storage");
    expect(lower).toContain("web");
    expect(lower).toContain("trigger");
  });

  it("instructs agent to skip preambles before tool calls", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("skip preambles");
  });

  it("instructs agent not to expose tool names to user", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain(
      "do not mention tool names",
    );
  });

  it("instructs agent to search before creating", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("search before creating");
  });

  it("instructs agent to ask one follow-up question at a time", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain(
      "one follow-up question at a time",
    );
  });

  it("does not tell the agent to manually gate all CRM writes", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(lower).not.toContain("before creating or updating any crm record");
    expect(lower).not.toContain("logging interactions");
  });

  it("includes trigger safety guidance", () => {
    const lower = SYSTEM_PROMPT.toLowerCase();
    expect(SYSTEM_PROMPT).toContain("<triggers>");
    expect(SYSTEM_PROMPT).toContain("search_triggers");
    expect(lower).toContain(
      "only create or modify triggers when the user clearly asks",
    );
    expect(SYSTEM_PROMPT).toContain(
      "Do not test the trigger unless the user asks",
    );
    expect(SYSTEM_PROMPT).toContain("When a trigger event includes an instruction_path");
  });

  it("includes subagent delegation guidance with isolated context", () => {
    expect(SYSTEM_PROMPT).toContain("<subagents>");
    expect(SYSTEM_PROMPT).toContain("</subagents>");
    expect(SYSTEM_PROMPT).toContain("run_subagent");
    expect(SYSTEM_PROMPT).toContain("single request-response cycle");
    expect(SYSTEM_PROMPT).toContain("cannot access conversation history");
  });

  it("prefers subagents for reusable instruction files without making them mandatory", () => {
    expect(SYSTEM_PROMPT).toContain("prefer run_subagent");
    expect(SYSTEM_PROMPT).toContain("clean isolated context");
    expect(SYSTEM_PROMPT).toContain("Simple trigger work can stay inline");
  });

  it("includes external-connections section with 3 sub-sections", () => {
    expect(SYSTEM_PROMPT).toContain("<external-connections>");
    expect(SYSTEM_PROMPT).toContain("</external-connections>");
    expect(SYSTEM_PROMPT).toContain("<using-existing-connections>");
    expect(SYSTEM_PROMPT).toContain("</using-existing-connections>");
    expect(SYSTEM_PROMPT).toContain("<creating-new-connections>");
    expect(SYSTEM_PROMPT).toContain("</creating-new-connections>");
    expect(SYSTEM_PROMPT).toContain("<using-connection-tools>");
    expect(SYSTEM_PROMPT).toContain("</using-connection-tools>");
  });

  it("includes agent-driven connection lifecycle guidance", () => {
    expect(SYSTEM_PROMPT).toContain("list_users_connections");
    expect(SYSTEM_PROMPT).toContain("create_new_connections");
    expect(SYSTEM_PROMPT).toContain("manage_activated_tools_for_connections");
  });

  it("describes approval cards for connection activation and deletion", () => {
    expect(SYSTEM_PROMPT).toContain("manage_activated_tools_for_connections");
    expect(SYSTEM_PROMPT).toContain("delete_connection");
    expect(SYSTEM_PROMPT).toContain("show approval cards in chat");
    expect(SYSTEM_PROMPT).not.toContain("These tools do not show approval cards in v1");
  });

  it("instructs the agent to read the creating-connections skill if it exists", () => {
    expect(SYSTEM_PROMPT).toContain("If /agent/skills/system/creating-connections/SKILL.md exists");
    expect(SYSTEM_PROMPT).toContain("MUST read it");
  });

  it("includes connection-ID-prefixed tool naming guidance", () => {
    expect(SYSTEM_PROMPT).toContain("conn_1234__search_for_info");
  });

  it("instructs the agent to read connection skill files before using tools", () => {
    expect(SYSTEM_PROMPT).toContain(
      "MUST read and follow the instructions in the skills file",
    );
  });

  it("qualifies non-integration connection types as not yet available in v1", () => {
    expect(SYSTEM_PROMPT).toContain("not yet available in v1");
    expect(SYSTEM_PROMPT).toContain("only Composio OAuth integrations are supported");
  });

  it("does not contain the old passive connections guidance", () => {
    expect(SYSTEM_PROMPT).not.toContain("Never try to create or manage connections yourself");
  });

  it("does not claim that connection activation prompts the user automatically", () => {
    expect(SYSTEM_PROMPT).not.toContain("This will prompt the user to grant permissions");
  });

  it("includes show_view guidance for structured inline views", () => {
    expect(SYSTEM_PROMPT).toContain("<view-guidance>");
    expect(SYSTEM_PROMPT).toContain("</view-guidance>");
    expect(SYSTEM_PROMPT).toContain("show_view");
    expect(SYSTEM_PROMPT).toContain("repeat + $item");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("snapshot-only");
  });
});

describe("SYSTEM_PROMPT memory instructions", () => {
  it("contains a memory-system section", () => {
    expect(SYSTEM_PROMPT).toContain("<memory-system>");
    expect(SYSTEM_PROMPT).toContain("</memory-system>");
  });

  it("documents all root memory files", () => {
    expect(SYSTEM_PROMPT).toContain("SOUL.md");
    expect(SYSTEM_PROMPT).toContain("USER.md");
    expect(SYSTEM_PROMPT).toContain("MEMORY.md");
  });

  it("documents all topic files", () => {
    expect(SYSTEM_PROMPT).toContain("memory/preferences.md");
    expect(SYSTEM_PROMPT).toContain("memory/growth-plan.md");
    expect(SYSTEM_PROMPT).toContain("memory/patterns.md");
    expect(SYSTEM_PROMPT).toContain("memory/key-decisions.md");
  });

  it("includes auto-write rules", () => {
    expect(SYSTEM_PROMPT).toContain("lasting preference");
    expect(SYSTEM_PROMPT).toContain("3+");
  });

  it("includes what not to save guidance", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("do not save");
    expect(SYSTEM_PROMPT).toContain("already in CRM");
  });

  it("mentions SOUL.md is read-only for the agent", () => {
    expect(SYSTEM_PROMPT).toMatch(/SOUL\.md.*read-only/is);
  });

  it("mentions the 200-line cap on MEMORY.md", () => {
    expect(SYSTEM_PROMPT).toContain("200");
  });

  it("documents how to discover topic files", () => {
    expect(SYSTEM_PROMPT).toContain('read_file("/agent/memory/")');
  });

  it("uses /agent/ prefixes on all model-facing path references", () => {
    expect(SYSTEM_PROMPT).toContain("/agent/SOUL.md");
    expect(SYSTEM_PROMPT).toContain("/agent/USER.md");
    expect(SYSTEM_PROMPT).toContain("/agent/MEMORY.md");
    expect(SYSTEM_PROMPT).toContain("/agent/memory/preferences.md");
    expect(SYSTEM_PROMPT).toContain("/agent/vault/");
    expect(SYSTEM_PROMPT).toContain("/agent/skills/");
  });

  it("does not contain bare model-facing path references without /agent/", () => {
    expect(SYSTEM_PROMPT.match(/(?<!\/agent\/)SOUL\.md/g) ?? []).toHaveLength(0);
    expect(SYSTEM_PROMPT.match(/(?<!\/agent\/)memory\//g) ?? []).toHaveLength(0);
    expect(SYSTEM_PROMPT.match(/(?<!\/agent\/)vault\//g) ?? []).toHaveLength(0);
  });
});

describe("SETUP_SYSTEM_PROMPT", () => {
  it("exports a non-empty setup prompt", () => {
    expect(typeof SETUP_SYSTEM_PROMPT).toBe("string");
    expect(SETUP_SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("focuses on CRM setup and reconfiguration", () => {
    const lower = SETUP_SYSTEM_PROMPT.toLowerCase();

    expect(lower).toContain("setup mode");
    expect(lower).toContain("configure_crm");
    expect(lower).toContain("business");
    expect(lower).toContain("vocabulary");
  });

  it("does not tell the model to use unavailable normal-mode CRM tools", () => {
    expect(SETUP_SYSTEM_PROMPT).not.toContain("search_crm");
    expect(SETUP_SYSTEM_PROMPT).not.toContain("create_record");
  });
});
