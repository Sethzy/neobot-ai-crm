/** Tests for bundled superpowers skill content. */
import { describe, it, expect, vi } from "vitest";

import {
  SUPERPOWERS_SKILLS,
  SUPERPOWERS_AGENT_PROMPTS,
  SANDBOX_CLAUDE_MD,
  toSpriteSkillFiles,
  ensureSuperpowersInstalled,
} from "../index";

describe("superpowers skill content", () => {
  it("exports 5 skill files", () => {
    expect(Object.keys(SUPERPOWERS_SKILLS)).toHaveLength(5);
  });

  it("exports 1 agent prompt", () => {
    expect(Object.keys(SUPERPOWERS_AGENT_PROMPTS)).toHaveLength(1);
    expect(SUPERPOWERS_AGENT_PROMPTS).toHaveProperty("code-reviewer");
  });

  it("all skills have YAML frontmatter with name and description", () => {
    for (const [, content] of Object.entries(SUPERPOWERS_SKILLS)) {
      expect(content).toMatch(/^---\nname:/);
      expect(content).toContain("description:");
    }
  });

  it("using-superpowers references all other skill names", () => {
    const meta = SUPERPOWERS_SKILLS["using-superpowers"];
    expect(meta).toContain("verification-before-completion");
    expect(meta).toContain("systematic-debugging");
    expect(meta).toContain("requesting-code-review");
    expect(meta).toContain("receiving-code-review");
  });

  it("using-superpowers has SUBAGENT-STOP block", () => {
    const meta = SUPERPOWERS_SKILLS["using-superpowers"];
    expect(meta).toContain("<SUBAGENT-STOP>");
  });

  it("SANDBOX_CLAUDE_MD references the superpowers meta-skill", () => {
    expect(SANDBOX_CLAUDE_MD).toContain("superpowers");
    expect(SANDBOX_CLAUDE_MD).toContain("receiving-code-review");
  });

  it("generates SpriteSkillFile[] with superpowers/ prefix", () => {
    const files = toSpriteSkillFiles();
    expect(files.length).toBe(6); // 5 skills + 1 agent prompt
    for (const { path, content } of files) {
      expect(path).toMatch(/^superpowers\//);
      expect(content.length).toBeGreaterThan(50);
    }
  });

  it("code-reviewer agent prompt uses agents/ subdirectory", () => {
    const files = toSpriteSkillFiles();
    const agentFile = files.find((f) => f.path.includes("agents/"));
    expect(agentFile).toBeDefined();
    expect(agentFile!.path).toBe("superpowers/agents/code-reviewer.md");
  });
});

describe("ensureSuperpowersInstalled", () => {
  it("skips writing when .installed marker exists", async () => {
    const mockExecFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const mockWriteFile = vi.fn();
    const sprite = {
      execFile: mockExecFile,
      filesystem: vi.fn(() => ({ writeFile: mockWriteFile })),
    } as never;

    await ensureSuperpowersInstalled(sprite);

    // test -f succeeded, so no writes should happen
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(mockExecFile).toHaveBeenCalledWith("test", [
      "-f",
      "/skills/superpowers/.installed",
    ]);
  });

  it("writes all files + CLAUDE.md + marker on first install", async () => {
    const mockExecFile = vi
      .fn()
      .mockImplementation(async (cmd: string) => {
        if (cmd === "test") throw new Error("ENOENT"); // marker doesn't exist
        return { stdout: "", stderr: "" };
      });
    const mockWriteFile = vi.fn().mockResolvedValue(undefined);
    const sprite = {
      execFile: mockExecFile,
      filesystem: vi.fn(() => ({ writeFile: mockWriteFile })),
    } as never;

    await ensureSuperpowersInstalled(sprite);

    // Should write 6 skill files + CLAUDE.md + .installed marker = 8 writes
    expect(mockWriteFile).toHaveBeenCalledTimes(8);

    const writtenPaths = mockWriteFile.mock.calls.map(
      ([path]: [string]) => path,
    );
    expect(writtenPaths).toContain(
      "/skills/superpowers/using-superpowers/SKILL.md",
    );
    expect(writtenPaths).toContain(
      "/skills/superpowers/verification-before-completion/SKILL.md",
    );
    expect(writtenPaths).toContain(
      "/skills/superpowers/systematic-debugging/SKILL.md",
    );
    expect(writtenPaths).toContain(
      "/skills/superpowers/requesting-code-review/SKILL.md",
    );
    expect(writtenPaths).toContain(
      "/skills/superpowers/receiving-code-review/SKILL.md",
    );
    expect(writtenPaths).toContain(
      "/skills/superpowers/agents/code-reviewer.md",
    );
    expect(writtenPaths).toContain("/workspace/CLAUDE.md");
    expect(writtenPaths).toContain("/skills/superpowers/.installed");
  });
});
