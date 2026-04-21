import { describe, expect, it } from "vitest";

import { getSystemSkillContent } from "../system-skills";

describe("creating-connections/SKILL.md", () => {
  const content = getSystemSkillContent("skills/system/creating-connections/SKILL.md");

  it("teaches the connect-authorize-use model", () => {
    expect(content).toBeTruthy();
    expect(content).toMatch(/auth card/i);
    expect(content).toMatch(/next message/i);
  });

  it("does not mention retired discovery or activation tools", () => {
    expect(content).not.toMatch(/search_for_integrations/);
    expect(content).not.toMatch(/get_integrations_capabilities/);
    expect(content).not.toMatch(/toolsToActivate/);
    expect(content).not.toMatch(/manage_activated_tools/);
  });

  it("lists the supported providers and tells the agent to end the turn", () => {
    expect(content?.toLowerCase()).toContain("gmail");
    expect(content).toContain("Google Calendar");
    expect(content).toContain("Google Drive");
    expect(content?.toLowerCase()).toContain("notion");
    expect(content).toContain("{\"integrations\":[\"notion\"]}");
    expect(content?.toLowerCase()).toMatch(/end (your|the) turn/);
  });
});

describe("creating-connections/create-direct-api-connection.md", () => {
  it("states that direct-api connections are out of scope for v1", () => {
    expect(
      getSystemSkillContent("skills/system/creating-connections/create-direct-api-connection.md"),
    ).toBe("Direct-API connections are not supported in v1.");
  });
});
