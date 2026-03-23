/**
 * Tests for Claude execution inside a Sprite.
 * @module lib/sandbox/__tests__/run-claude-in-sprite
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildAnalysisPrompt,
  buildClaudeCliArgs,
  buildClaudeEnv,
  runClaudeInSprite,
} from "../run-claude-in-sprite";

function createMockSprite() {
  const mockExecFile = vi.fn();
  const mockWriteFile = vi.fn().mockResolvedValue(undefined);
  const mockReadFile = vi.fn();
  const mockFilesystem = vi.fn(() => ({
    writeFile: mockWriteFile,
    readFile: mockReadFile,
  }));

  return {
    sprite: {
      name: "thread-abc12345",
      execFile: mockExecFile,
      filesystem: mockFilesystem,
    },
    mockExecFile,
    mockWriteFile,
    mockReadFile,
    mockFilesystem,
  };
}

describe("buildClaudeCliArgs", () => {
  it("builds execFile-safe claude args with max turns and prompt as a single argument", () => {
    const prompt = "analyze this sheet with 'quoted' text";
    const args = buildClaudeCliArgs(prompt, 15);

    expect(args).toContain("--print");
    expect(args).toContain("--dangerously-skip-permissions");
    expect(args).toContain("--max-turns");
    expect(args[args.indexOf("--max-turns") + 1]).toBe("15");
    expect(args).toContain(prompt);
    expect(args.join(" ")).toContain("Bash");
  });
});

describe("buildAnalysisPrompt", () => {
  it("includes the built-in xlsx skill, user skill, input files, output files, and recalc step", () => {
    const prompt = buildAnalysisPrompt("compare two deals", ["a.xlsx", "b.csv"], "re-analyst");

    expect(prompt).toContain("/skills/xlsx/SKILL.md");
    expect(prompt).toContain("/skills/re-analyst/SKILL.md");
    expect(prompt).toContain("a.xlsx");
    expect(prompt).toContain("b.csv");
    expect(prompt).toContain("/workspace/output/result.xlsx");
    expect(prompt).toContain("/workspace/output/summary.txt");
    expect(prompt).toContain("recalc.py");
  });

  it("omits the user skill block when no user skill slug is provided", () => {
    const prompt = buildAnalysisPrompt("compare two deals", ["a.xlsx"]);

    expect(prompt).toContain("/skills/xlsx/SKILL.md");
    expect(prompt).not.toContain("/skills/re-analyst/");
  });
});

describe("buildClaudeEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the Anthropic API key for execFile env injection", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");

    expect(buildClaudeEnv()).toEqual({ ANTHROPIC_API_KEY: "sk-test-key" });
  });

  it("throws when ANTHROPIC_API_KEY is missing", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    expect(() => buildClaudeEnv()).toThrow("ANTHROPIC_API_KEY");
  });
});

describe("runClaudeInSprite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("writes bundled xlsx assets on first run, injects user skills, and runs claude", async () => {
    const { sprite, mockExecFile, mockReadFile, mockWriteFile } = createMockSprite();

    mockReadFile.mockImplementation(async (path: string) => {
      if (path === "/skills/xlsx/SKILL.md") {
        throw new Error("ENOENT");
      }

      if (path === "/workspace/output/summary.txt") {
        return Buffer.from("Finished cleanly");
      }

      throw new Error(`Unexpected read: ${path}`);
    });

    mockExecFile.mockImplementation(async (command: string, args?: string[]) => {
      if (command === "test" && args?.[1] === "/workspace/output/result.xlsx") {
        return { stdout: "", stderr: "", exitCode: 0 };
      }

      return { stdout: "claude output", stderr: "", exitCode: 0 };
    });

    const result = await runClaudeInSprite(sprite as never, {
      task: "Compare the uploaded deals",
      inputFilenames: ["deals.xlsx"],
      userSkillFiles: [{ path: "re-analyst/SKILL.md", content: "# Preferences" }],
      userSkillSlug: "re-analyst",
    });

    expect(result.success).toBe(true);
    expect(result.summary).toBe("Finished cleanly");
    expect(mockWriteFile).toHaveBeenCalledWith(
      "/skills/xlsx/SKILL.md",
      expect.any(String),
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      "/skills/re-analyst/SKILL.md",
      "# Preferences",
    );
    expect(mockExecFile).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["--print", "--dangerously-skip-permissions"]),
      expect.objectContaining({
        env: expect.objectContaining({ ANTHROPIC_API_KEY: "sk-test-key" }),
      }),
    );
  });

  it("skips bundled xlsx asset writes on follow-up runs when the skill already exists", async () => {
    const { sprite, mockExecFile, mockReadFile, mockWriteFile } = createMockSprite();

    mockReadFile.mockImplementation(async (path: string) => {
      if (path === "/skills/xlsx/SKILL.md") {
        return Buffer.from("already present");
      }

      if (path === "/workspace/output/summary.txt") {
        return Buffer.from("Follow-up complete");
      }

      throw new Error(`Unexpected read: ${path}`);
    });

    mockExecFile.mockResolvedValue({ stdout: "claude output", stderr: "", exitCode: 0 });

    const result = await runClaudeInSprite(sprite as never, {
      task: "Adjust the assumptions",
      inputFilenames: ["deals.xlsx"],
      userSkillFiles: [],
    });

    expect(result.success).toBe(true);
    expect(result.summary).toBe("Follow-up complete");
    expect(mockWriteFile).not.toHaveBeenCalledWith(
      "/skills/xlsx/SKILL.md",
      expect.anything(),
    );
  });

  it("falls back to a generic summary when summary.txt is missing", async () => {
    const { sprite, mockExecFile, mockReadFile } = createMockSprite();

    mockReadFile.mockImplementation(async (path: string) => {
      if (path === "/skills/xlsx/SKILL.md") {
        return Buffer.from("already present");
      }

      throw new Error(`ENOENT: ${path}`);
    });

    mockExecFile.mockResolvedValue({ stdout: "claude output", stderr: "", exitCode: 0 });

    const result = await runClaudeInSprite(sprite as never, {
      task: "Compare deals",
      inputFilenames: ["deals.xlsx"],
      userSkillFiles: [],
    });

    expect(result.success).toBe(true);
    expect(result.summary).toContain("Analysis complete");
  });

  it("returns success false when result.xlsx was not produced", async () => {
    const { sprite, mockExecFile, mockReadFile } = createMockSprite();

    mockReadFile.mockImplementation(async (path: string) => {
      if (path === "/skills/xlsx/SKILL.md") {
        return Buffer.from("already present");
      }

      if (path === "/workspace/output/summary.txt") {
        return Buffer.from("No workbook");
      }

      throw new Error(`Unexpected read: ${path}`);
    });

    mockExecFile.mockImplementation(async (command: string) => {
      if (command === "test") {
        throw new Error("missing result");
      }

      return { stdout: "claude output", stderr: "", exitCode: 0 };
    });

    const result = await runClaudeInSprite(sprite as never, {
      task: "Compare deals",
      inputFilenames: ["deals.xlsx"],
      userSkillFiles: [],
    });

    expect(result.success).toBe(false);
    expect(result.summary).toBe("No workbook");
  });
});
