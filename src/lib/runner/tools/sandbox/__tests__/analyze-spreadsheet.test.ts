/**
 * Tests for the sandbox spreadsheet analysis tool (async execution).
 * @module lib/runner/tools/sandbox/__tests__/analyze-spreadsheet
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindActiveSpriteSession,
  mockGetOrCreateSprite,
  mockLoadSkillFilesForSandbox,
  mockLaunchBackgroundJob,
  mockBuildAnalysisPrompt,
  mockTouchSpriteSession,
  mockUpsertSpriteSession,
  mockFindRunningJob,
  mockInsertSpriteJob,
  mockUpdateJobStatus,
} = vi.hoisted(() => ({
  mockFindActiveSpriteSession: vi.fn(),
  mockGetOrCreateSprite: vi.fn(),
  mockLoadSkillFilesForSandbox: vi.fn(),
  mockLaunchBackgroundJob: vi.fn(),
  mockBuildAnalysisPrompt: vi.fn().mockReturnValue("test prompt"),
  mockTouchSpriteSession: vi.fn(),
  mockUpsertSpriteSession: vi.fn(),
  mockFindRunningJob: vi.fn(),
  mockInsertSpriteJob: vi.fn(),
  mockUpdateJobStatus: vi.fn(),
}));

vi.mock("@/lib/sandbox/sprite-session", () => ({
  findActiveSpriteSession: mockFindActiveSpriteSession,
  upsertSpriteSession: mockUpsertSpriteSession,
  touchSpriteSession: mockTouchSpriteSession,
}));

vi.mock("@/lib/sandbox/sprites-client", () => ({
  getOrCreateSprite: mockGetOrCreateSprite,
}));

vi.mock("@/lib/sandbox/skill-loader", () => ({
  loadSkillFilesForSandbox: mockLoadSkillFilesForSandbox,
}));

vi.mock("@/lib/sandbox/run-claude-in-sprite", () => ({
  launchBackgroundJob: mockLaunchBackgroundJob,
  buildAnalysisPrompt: mockBuildAnalysisPrompt,
}));

vi.mock("@/lib/sandbox/sprite-jobs", () => ({
  findRunningJob: mockFindRunningJob,
  insertSpriteJob: mockInsertSpriteJob,
  updateJobStatus: mockUpdateJobStatus,
}));

vi.mock("@/lib/sandbox/sandbox-paths", () => ({
  jobOutputDir: vi.fn((id: string) => `/workspace/jobs/${id}`),
}));

import { createAnalyzeSpreadsheetTool } from "../analyze-spreadsheet";

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function createMockSprite() {
  const mockWriteFile = vi.fn().mockResolvedValue(undefined);
  const mockReadFile = vi.fn();
  const mockFilesystem = vi.fn(() => ({
    writeFile: mockWriteFile,
    readFile: mockReadFile,
  }));
  const mockExecFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

  return {
    sprite: {
      name: "thread-12345678",
      execFile: mockExecFile,
      spawn: vi.fn(),
      filesystem: mockFilesystem,
    },
    mockWriteFile,
    mockReadFile,
    mockFilesystem,
    mockExecFile,
  };
}

function setupDefaultMocks(sprite: ReturnType<typeof createMockSprite>["sprite"]) {
  mockFindActiveSpriteSession.mockResolvedValue(null);
  mockGetOrCreateSprite.mockResolvedValue({
    sprite,
    spriteName: "thread-12345678",
    isNew: true,
  });
  mockUpsertSpriteSession.mockResolvedValue(null);
  mockLoadSkillFilesForSandbox.mockResolvedValue([]);
  mockFindRunningJob.mockResolvedValue(null);
  mockInsertSpriteJob.mockResolvedValue(undefined);
  mockLaunchBackgroundJob.mockResolvedValue(undefined);
  mockUpdateJobStatus.mockResolvedValue(undefined);
  mockTouchSpriteSession.mockResolvedValue(undefined);
}

describe("createAnalyzeSpreadsheetTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("describes spreadsheet analysis and multi-turn iteration", () => {
    const tools = createAnalyzeSpreadsheetTool({} as never, "client-1", "12345678-aaaa-bbbb-cccc");

    expect(tools.analyze_spreadsheet.description).toContain("spreadsheet");
    expect(tools.analyze_spreadsheet.description).toContain("Excel");
    expect(tools.analyze_spreadsheet.description).toContain("multi-turn");
  });

  it("accepts structured spreadsheet inputs and rejects legacy fileUrls", () => {
    const tools = createAnalyzeSpreadsheetTool({} as never, "client-1", "12345678-aaaa-bbbb-cccc");

    expect(() =>
      tools.analyze_spreadsheet.inputSchema.parse({
        task: "Compare these deals",
        files: [{ url: "https://example.com/a.xlsx", filename: "a.xlsx", mediaType: XLSX_MIME }],
      }),
    ).not.toThrow();

    expect(() =>
      tools.analyze_spreadsheet.inputSchema.parse({
        task: "Compare these deals",
        fileUrls: ["https://example.com/a.xlsx"],
      }),
    ).toThrow();
  });

  it("returns an env error when SPRITES_TOKEN is not configured", async () => {
    vi.stubEnv("SPRITES_TOKEN", "");
    const tools = createAnalyzeSpreadsheetTool({} as never, "client-1", "12345678-aaaa-bbbb-cccc");

    const result = await tools.analyze_spreadsheet.execute({
      task: "Compare these deals",
      files: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("SPRITES_TOKEN");
  });

  it("returns immediately with status 'started' instead of blocking", async () => {
    vi.stubEnv("SPRITES_TOKEN", "sprite-token");
    const { sprite } = createMockSprite();
    setupDefaultMocks(sprite);
    mockLoadSkillFilesForSandbox.mockResolvedValue([
      { path: "re-analyst/SKILL.md", content: "# Preferences" },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3]).buffer),
      }),
    );

    const tools = createAnalyzeSpreadsheetTool({} as never, "client-1", "12345678-aaaa-bbbb-cccc");
    const result = await tools.analyze_spreadsheet.execute({
      task: "Compare these deals",
      files: [{ url: "https://example.com/a.xlsx", filename: "a.xlsx", mediaType: XLSX_MIME }],
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("started");
    expect(result.message).toContain("started");
    expect(mockInsertSpriteJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        client_id: "client-1",
        thread_id: "12345678-aaaa-bbbb-cccc",
        sprite_name: "thread-12345678",
        job_type: "analyze",
      }),
    );
    expect(mockLaunchBackgroundJob).toHaveBeenCalledTimes(1);
    expect(mockUpdateJobStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "running",
    );
  });

  it("rejects if a job is already running on the same sprite", async () => {
    vi.stubEnv("SPRITES_TOKEN", "sprite-token");
    const { sprite } = createMockSprite();
    setupDefaultMocks(sprite);
    mockFindRunningJob.mockResolvedValue({ id: "existing-job" });

    const tools = createAnalyzeSpreadsheetTool({} as never, "client-1", "12345678-aaaa-bbbb-cccc");
    const result = await tools.analyze_spreadsheet.execute({
      task: "Analyze",
      files: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("already running");
    expect(mockLaunchBackgroundJob).not.toHaveBeenCalled();
  });

  it("passes the existing session sprite name so follow-up runs reuse the same Sprite", async () => {
    vi.stubEnv("SPRITES_TOKEN", "sprite-token");
    const { sprite } = createMockSprite();
    setupDefaultMocks(sprite);

    mockFindActiveSpriteSession.mockResolvedValue({
      sprite_name: "thread-existing",
    });
    mockGetOrCreateSprite.mockResolvedValue({
      sprite,
      spriteName: "thread-existing",
      isNew: false,
    });

    const tools = createAnalyzeSpreadsheetTool({} as never, "client-1", "12345678-aaaa-bbbb-cccc");
    await tools.analyze_spreadsheet.execute({
      task: "Adjust the model",
      files: [],
    });

    expect(mockGetOrCreateSprite).toHaveBeenCalledWith({
      token: "sprite-token",
      existingSpriteName: "thread-existing",
      spriteName: "thread-12345678",
    });
  });

  it("returns a download error when a runner-side file fetch fails", async () => {
    vi.stubEnv("SPRITES_TOKEN", "sprite-token");
    const { sprite } = createMockSprite();
    setupDefaultMocks(sprite);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      }),
    );

    const tools = createAnalyzeSpreadsheetTool({} as never, "client-1", "12345678-aaaa-bbbb-cccc");
    const result = await tools.analyze_spreadsheet.execute({
      task: "Compare these deals",
      files: [{ url: "https://example.com/a.xlsx", filename: "a.xlsx", mediaType: XLSX_MIME }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to download input file");
  });

  it("blocks private spreadsheet input URLs before fetching them", async () => {
    vi.stubEnv("SPRITES_TOKEN", "sprite-token");
    const { sprite } = createMockSprite();
    setupDefaultMocks(sprite);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const tools = createAnalyzeSpreadsheetTool({} as never, "client-1", "12345678-aaaa-bbbb-cccc");
    const result = await tools.analyze_spreadsheet.execute({
      task: "Compare these deals",
      files: [{ url: "http://127.0.0.1/model.xlsx", filename: "model.xlsx", mediaType: XLSX_MIME }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Blocked private or unsafe URL "http://127.0.0.1/model.xlsx".');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns an error when sprite-session persistence fails", async () => {
    vi.stubEnv("SPRITES_TOKEN", "sprite-token");
    mockFindActiveSpriteSession.mockRejectedValue(new Error("db unavailable"));

    const tools = createAnalyzeSpreadsheetTool({} as never, "client-1", "12345678-aaaa-bbbb-cccc");
    const result = await tools.analyze_spreadsheet.execute({
      task: "Compare these deals",
      files: [],
    });

    expect(result).toEqual({
      success: false,
      error: "db unavailable",
    });
  });

  it("marks job as failed when launchBackgroundJob throws", async () => {
    vi.stubEnv("SPRITES_TOKEN", "sprite-token");
    const { sprite } = createMockSprite();
    setupDefaultMocks(sprite);
    mockLaunchBackgroundJob.mockRejectedValue(new Error("spawn failed"));

    const tools = createAnalyzeSpreadsheetTool({} as never, "client-1", "12345678-aaaa-bbbb-cccc");
    const result = await tools.analyze_spreadsheet.execute({
      task: "Compare these deals",
      files: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to start");
    expect(mockUpdateJobStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "failed",
    );
  });
});
