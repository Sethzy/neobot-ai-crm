/**
 * Tests for Claude execution inside a Sprite.
 * @module lib/sandbox/__tests__/run-claude-in-sprite
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildClaudeCliArgs,
  buildClaudeEnv,
  buildSandboxPrompt,
  launchBackgroundJob,
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

    expect(args).toContain("--output-format");
    expect(args).toContain("stream-json");
    expect(args).not.toContain("--print");
    expect(args).toContain("--dangerously-skip-permissions");
    expect(args).toContain("--max-turns");
    expect(args[args.indexOf("--max-turns") + 1]).toBe("15");
    expect(args).toContain(prompt);
    expect(args.join(" ")).toContain("Bash");
  });
});

describe("buildSandboxPrompt", () => {
  it("includes primary skill, task, input files, and summary instruction", () => {
    const prompt = buildSandboxPrompt({
      task: "compare two deals",
      skillSlugs: ["excel_editing"],
      inputFilenames: ["a.xlsx", "b.csv"],
      outputDir: "/workspace/jobs/j1",
    });
    expect(prompt).toContain("/skills/excel_editing/SKILL.md");
    expect(prompt).toContain("a.xlsx");
    expect(prompt).toContain("b.csv");
    expect(prompt).toContain("summary.txt");
    expect(prompt).toContain("compare two deals");
  });

  it("includes companion skill references", () => {
    const prompt = buildSandboxPrompt({
      task: "compare",
      skillSlugs: ["excel_editing", "re-analyst"],
      inputFilenames: [],
      outputDir: "/workspace/jobs/j2",
    });
    expect(prompt).toContain("/skills/excel_editing/SKILL.md");
    expect(prompt).toContain("Also read /skills/re-analyst/SKILL.md");
  });

  it("uses provided output dir", () => {
    const prompt = buildSandboxPrompt({
      task: "analyze",
      skillSlugs: ["pdf_creation"],
      inputFilenames: [],
      outputDir: "/workspace/jobs/abc",
    });
    expect(prompt).toContain("/workspace/jobs/abc/");
  });

  it("handles no input files", () => {
    const prompt = buildSandboxPrompt({
      task: "write letter",
      skillSlugs: ["docx_editing"],
      inputFilenames: [],
      outputDir: "/workspace/jobs/j3",
    });
    expect(prompt).toContain("No input files.");
  });
});

describe("buildClaudeEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns the Anthropic env needed for execFile injection", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    vi.stubEnv("PATH", "/usr/bin:/usr/local/bin");
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://proxy.example.test");

    expect(buildClaudeEnv()).toEqual({
      ANTHROPIC_API_KEY: "sk-test-key",
      PATH: "/usr/bin:/usr/local/bin",
      ANTHROPIC_BASE_URL: "https://proxy.example.test",
    });
  });

  it("throws when both ANTHROPIC_API_KEY and OPENROUTER_API_KEY are missing", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");

    expect(() => buildClaudeEnv()).toThrow("ANTHROPIC_API_KEY or OPENROUTER_API_KEY");
  });

  it("returns OpenRouter env when OPENROUTER_API_KEY is set", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("PATH", "/usr/bin");

    expect(buildClaudeEnv()).toEqual({
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_AUTH_TOKEN: "sk-or-test-key",
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      PATH: "/usr/bin",
    });
  });

  it("sets all model tier vars when SANDBOX_MODEL_ID is set", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key");
    vi.stubEnv("SANDBOX_MODEL_ID", "minimax/minimax-m2.7");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("PATH", "/usr/bin");

    expect(buildClaudeEnv()).toEqual({
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_AUTH_TOKEN: "sk-or-test-key",
      ANTHROPIC_BASE_URL: "https://openrouter.ai/api",
      ANTHROPIC_DEFAULT_SONNET_MODEL: "minimax/minimax-m2.7",
      ANTHROPIC_DEFAULT_OPUS_MODEL: "minimax/minimax-m2.7",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: "minimax/minimax-m2.7",
      CLAUDE_CODE_SUBAGENT_MODEL: "minimax/minimax-m2.7",
      PATH: "/usr/bin",
    });
  });

  it("prefers OpenRouter when both keys are set", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-key");
    vi.stubEnv("PATH", "/usr/bin");

    const env = buildClaudeEnv();
    expect(env.ANTHROPIC_AUTH_TOKEN).toBe("sk-or-test-key");
    expect(env.ANTHROPIC_BASE_URL).toBe("https://openrouter.ai/api");
  });
});

// runClaudeInSprite tests removed (function deleted in PR 55)
// The sync execution path is no longer used.
describe.skip("runClaudeInSprite (deleted)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-key");
    vi.stubEnv("PATH", "/usr/bin:/usr/local/bin");
    vi.stubEnv("ANTHROPIC_BASE_URL", "https://proxy.example.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("installs spreadsheet dependencies on first use, clears old outputs, writes bundled assets, and runs claude", async () => {
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
      if (command === "bash" && args?.[1]?.includes("pip3 show pandas")) {
        return { stdout: "MISSING", stderr: "", exitCode: 0 };
      }

      if (command === "bash" && args?.[1]?.includes("command -v soffice")) {
        return { stdout: "MISSING", stderr: "", exitCode: 0 };
      }

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
      "pip3",
      ["install", "pandas", "openpyxl", "xlsxwriter", "matplotlib"],
    );
    expect(mockExecFile).toHaveBeenCalledWith(
      "bash",
      ["-lc", "apt-get update -qq && apt-get install -y -qq libreoffice-calc gcc"],
    );
    expect(mockExecFile).toHaveBeenCalledWith(
      "bash",
      ["-lc", "rm -f /workspace/output/result.xlsx /workspace/output/summary.txt"],
    );
    expect(mockExecFile).toHaveBeenCalledWith(
      "claude",
      expect.arrayContaining(["--output-format", "stream-json", "--dangerously-skip-permissions"]),
      expect.objectContaining({
        env: expect.objectContaining({
          ANTHROPIC_API_KEY: "sk-test-key",
          PATH: "/usr/bin:/usr/local/bin",
          ANTHROPIC_BASE_URL: "https://proxy.example.test",
        }),
      }),
    );
  });

  it("skips dependency installation and bundled asset writes on follow-up runs when everything already exists", async () => {
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

    mockExecFile.mockImplementation(async (command: string, args?: string[]) => {
      if (command === "bash" && args?.[1]?.includes("pip3 show pandas")) {
        return { stdout: "INSTALLED", stderr: "", exitCode: 0 };
      }

      if (command === "bash" && args?.[1]?.includes("command -v soffice")) {
        return { stdout: "INSTALLED", stderr: "", exitCode: 0 };
      }

      return { stdout: "claude output", stderr: "", exitCode: 0 };
    });

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
    expect(mockExecFile).not.toHaveBeenCalledWith(
      "pip3",
      ["install", "pandas", "openpyxl", "xlsxwriter", "matplotlib"],
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

describe("launchBackgroundJob", () => {
  beforeEach(() => {
    vi.stubEnv("SANDBOX_CALLBACK_SECRET", "test-secret");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    vi.stubEnv("PATH", "/usr/bin");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("calls sprite.spawn with detachable: true and env", async () => {
    const mockSpawn = vi.fn();
    const mockExecFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const sprite = { spawn: mockSpawn, execFile: mockExecFile } as never;
    const jobId = "test-job-123";

    await launchBackgroundJob(sprite, jobId, { prompt: "analyze this", maxTurns: 20 });

    // Should create output directory
    expect(mockExecFile).toHaveBeenCalledWith("mkdir", ["-p", `/workspace/jobs/${jobId}`]);

    // Should call spawn with detachable: true
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [cmd, , opts] = mockSpawn.mock.calls[0];
    expect(cmd).toBe("bash");
    expect(opts.detachable).toBe(true);
    expect(opts.env).toHaveProperty("ANTHROPIC_API_KEY");
    expect(opts.env).toHaveProperty("CALLBACK_URL", "https://app.example.com/api/sandbox/callback");
    expect(opts.env).toHaveProperty("JOB_ID", jobId);
  });

  it("includes done/error markers and webhook curl in the wrapper script", async () => {
    const mockSpawn = vi.fn();
    const sprite = {
      spawn: mockSpawn,
      execFile: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    } as never;

    await launchBackgroundJob(sprite, "job-abc", { prompt: "test", maxTurns: 10 });

    const script = mockSpawn.mock.calls[0][1][1]; // args[1] is the -c script
    expect(script).toContain(".done");
    expect(script).toContain(".error");
    expect(script).toContain("curl");
    expect(script).toContain("CALLBACK_URL");
  });
});
