/**
 * Tests for system prompt content and safety instructions.
 * @module lib/ai/__tests__/system-prompt
 */

import { describe, expect, it } from "vitest";

import {
  BROWSER_AUTOMATION_PROMPT,
  MARKET_DATA_PROMPT,
  PROPERTY_LISTING_PROMPT,
  SANDBOX_PROMPT,
  SETUP_SYSTEM_PROMPT,
  SYSTEM_PROMPT,
} from "@/lib/ai/system-prompt";

describe("SYSTEM_PROMPT", () => {
  it("exports a non-empty string", () => {
    expect(typeof SYSTEM_PROMPT).toBe("string");
    expect(SYSTEM_PROMPT.length).toBeGreaterThan(0);
  });

  it("mentions advisory sales context", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("advisory sales");
  });

  it("keeps market-data tool guidance out of the base system prompt", () => {
    expect(SYSTEM_PROMPT).not.toContain("search_market_data");
  });

  it("adapts to user locale instead of hardcoding geography", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("locale");
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

  it("documents /agent/uploads/ as read-only user-uploaded files", () => {
    expect(SYSTEM_PROMPT).toContain("/agent/uploads/");
    expect(SYSTEM_PROMPT).toContain("Read-only");
    expect(SYSTEM_PROMPT).toContain("user-uploaded files");
  });

  it("teaches the agent to read uploaded files explicitly", () => {
    expect(SYSTEM_PROMPT).toContain('read_file("/agent/uploads/');
  });

  it("teaches the sunder:// download link convention", () => {
    expect(SYSTEM_PROMPT).toContain("sunder://");
    expect(SYSTEM_PROMPT).toContain("/api/files/download");
  });

  it("reserves web search for information outside the market database", () => {
    expect(SYSTEM_PROMPT).toContain("isn't in their CRM or the market database");
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

  it("includes CRM saved view guidance", () => {
    expect(SYSTEM_PROMPT).toContain("CRM — Views:");
    expect(SYSTEM_PROMPT).toContain("manage_views");
    expect(SYSTEM_PROMPT).toContain("$month_end");
  });

  it("instructs agent to briefly describe multi-step work", () => {
    expect(SYSTEM_PROMPT.toLowerCase()).toContain(
      "multi-step work",
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

  describe("subagent guidance", () => {
    it("states subagents do not inherit activated connection tools", () => {
      expect(SYSTEM_PROMPT).toContain("do not inherit activated connection tools");
      expect(SYSTEM_PROMPT).not.toContain("including activated connection tools");
    });

    it("states subagents cannot create connections or triggers", () => {
      expect(SYSTEM_PROMPT).toContain("cannot create or activate connections");
      expect(SYSTEM_PROMPT).toContain("create triggers");
    });

    it("does not say subagents are internal-work-only", () => {
      expect(SYSTEM_PROMPT).not.toContain("internal work");
    });
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

  it("includes Google Workspace guidance for connected Drive, Docs, and Sheets", () => {
    expect(SYSTEM_PROMPT).toContain("Google Workspace");
    expect(SYSTEM_PROMPT).toContain("GOOGLEDRIVE_FIND_FILE");
    expect(SYSTEM_PROMPT).toContain("GOOGLEDOCS");
    expect(SYSTEM_PROMPT).toContain("GOOGLESHEETS");
    expect(SYSTEM_PROMPT).toContain("use bash in the sandbox");
  });

  it("retains PDF document guidance alongside the new Google Workspace section", () => {
    expect(SYSTEM_PROMPT).toContain("PDF Documents:");
    expect(SYSTEM_PROMPT).toContain("Use generate_pdf");
    expect(SYSTEM_PROMPT).toContain("Google Workspace");
  });

  it("includes custom skill discovery and loading guidance", () => {
    expect(SYSTEM_PROMPT).toContain("<custom-skills>");
    expect(SYSTEM_PROMPT).toContain("</custom-skills>");
    expect(SYSTEM_PROMPT).toContain("<available-skills>");
    expect(SYSTEM_PROMPT).toContain("read_file");
    expect(SYSTEM_PROMPT).toContain("/agent/skills/{slug}/SKILL.md");
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

  it("includes inline-mode view guidance with spec fence instructions", () => {
    expect(SYSTEM_PROMPT).toContain("<view-guidance>");
    expect(SYSTEM_PROMPT).toContain("</view-guidance>");
    // Must contain spec fence instruction from catalog.prompt({ mode: "inline" })
    expect(SYSTEM_PROMPT).toContain("```spec");
    // Must contain /state patch ordering instruction
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("/state");
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("before");
    // Must NOT contain old show_view tool references
    expect(SYSTEM_PROMPT).not.toContain("show_view");
    // Must still contain old getViewCatalogPrompt patterns that are now in customRules
    expect(SYSTEM_PROMPT.toLowerCase()).toContain("snapshot");
    expect(SYSTEM_PROMPT).toContain("4KB");
  });
});

describe("PROPERTY_LISTING_PROMPT", () => {
  it("routes public listing searches separately from market data and browser automation", () => {
    expect(PROPERTY_LISTING_PROMPT).toContain("search_99co");
    expect(PROPERTY_LISTING_PROMPT).toContain("search_propertyguru");
    expect(PROPERTY_LISTING_PROMPT).toContain("search_market_data");
    expect(PROPERTY_LISTING_PROMPT).toContain("browse_website");
    expect(PROPERTY_LISTING_PROMPT).toContain("what's available");
    expect(PROPERTY_LISTING_PROMPT).toContain("what did it sell for");
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

  it("mentions SOUL.md is writable during onboarding", () => {
    expect(SYSTEM_PROMPT).toMatch(/SOUL\.md.*onboarding/is);
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
    expect(SYSTEM_PROMPT).toContain("/agent/skills/");
  });

  it("does not document the removed vault directory", () => {
    expect(SYSTEM_PROMPT).not.toContain("/agent/vault/");
    expect(SYSTEM_PROMPT).not.toContain("Knowledge Base");
  });

  it("does not contain bare model-facing path references without /agent/", () => {
    expect(SYSTEM_PROMPT.match(/(?<!\/agent\/)vault\//g) ?? []).toHaveLength(0);
  });
});

describe("BROWSER_AUTOMATION_PROMPT", () => {
  it("includes authenticated browsing guidance for platform connections", () => {
    expect(BROWSER_AUTOMATION_PROMPT).toContain("Platform authentication");
    expect(BROWSER_AUTOMATION_PROMPT).toContain('platform: "salesforce"');
    expect(BROWSER_AUTOMATION_PROMPT).toContain("needsAuth");
    expect(BROWSER_AUTOMATION_PROMPT).toContain("Do not auto-retry");
    expect(BROWSER_AUTOMATION_PROMPT).toContain("saved login may have expired");
  });
});

describe("MARKET_DATA_PROMPT", () => {
  it("includes search_market_data guidance for built-in property datasets", () => {
    expect(MARKET_DATA_PROMPT).toContain("search_market_data");
    expect(MARKET_DATA_PROMPT).toContain("CEA agent registry");
    expect(MARKET_DATA_PROMPT).toContain("HDB resale");
    expect(MARKET_DATA_PROMPT).toContain("URA private residential");
  });

  it("distinguishes market-data usage from web search", () => {
    expect(MARKET_DATA_PROMPT).toContain("Use search mode");
    expect(MARKET_DATA_PROMPT).toContain("Use stats mode");
    expect(MARKET_DATA_PROMPT).toContain("Use web search instead");
  });

  it("explains that sampled stats are recent-window aggregates, not full-dataset exact stats", () => {
    expect(MARKET_DATA_PROMPT).toContain("most recent 10,000 matching rows");
    expect(MARKET_DATA_PROMPT).toContain("recent-window stats");
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

describe("SANDBOX_PROMPT", () => {
  it("is exported", () => {
    expect(SANDBOX_PROMPT).toBeDefined();
    expect(typeof SANDBOX_PROMPT).toBe("string");
  });

  it("mentions /vercel/sandbox/workspace paths", () => {
    expect(SANDBOX_PROMPT).toContain("/vercel/sandbox/workspace");
  });

  it("mentions input/context.json for data passing", () => {
    expect(SANDBOX_PROMPT).toContain("input/context.json");
  });

  it("uses agent/uploads/ for user files, not input/", () => {
    expect(SANDBOX_PROMPT).toContain("agent/uploads/");
    // input/ should only appear as input/context.json, never as a general user-file directory
    const inputRefs = SANDBOX_PROMPT.match(/\/input\//g) ?? [];
    const contextJsonRefs = SANDBOX_PROMPT.match(/\/input\/context\.json/g) ?? [];
    expect(inputRefs.length).toBe(contextJsonRefs.length);
  });

  it("warns against hard-coding data", () => {
    expect(SANDBOX_PROMPT).toContain("Never enumerate or hard-code");
  });

  it("uses agent/home/ instead of output/ for persisted sandbox files", () => {
    expect(SANDBOX_PROMPT).toContain("agent/home/");
    expect(SANDBOX_PROMPT).not.toContain("output/");
  });

  it("mentions skills/ for reference data", () => {
    expect(SANDBOX_PROMPT).toContain("skills/");
  });

  it("warns that only agent/home persists after sandbox shutdown", () => {
    expect(SANDBOX_PROMPT).toContain("Only files in /vercel/sandbox/workspace/agent/home/");
    expect(SANDBOX_PROMPT).toContain("Everything else is lost");
  });

  it("warns that sandbox-installed packages are ephemeral", () => {
    expect(SANDBOX_PROMPT.toLowerCase()).toContain("ephemeral");
  });
});
