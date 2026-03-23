/**
 * Tests for the sandbox spreadsheet analysis tool.
 * @module lib/runner/tools/sandbox/__tests__/analyze-spreadsheet
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindActiveSpriteSession,
  mockGetOrCreateSprite,
  mockLoadSkillFilesForSandbox,
  mockRunClaudeInSprite,
  mockTouchSpriteSession,
  mockUpsertSpriteSession,
  mockCreateAgentFileClient,
} = vi.hoisted(() => ({
  mockFindActiveSpriteSession: vi.fn(),
  mockGetOrCreateSprite: vi.fn(),
  mockLoadSkillFilesForSandbox: vi.fn(),
  mockRunClaudeInSprite: vi.fn(),
  mockTouchSpriteSession: vi.fn(),
  mockUpsertSpriteSession: vi.fn(),
  mockCreateAgentFileClient: vi.fn(),
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
  runClaudeInSprite: mockRunClaudeInSprite,
}));

vi.mock("@/lib/storage/agent-files", () => ({
  createAgentFileClient: mockCreateAgentFileClient,
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
      filesystem: mockFilesystem,
    },
    mockWriteFile,
    mockReadFile,
    mockFilesystem,
    mockExecFile,
  };
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

  it("downloads runner-side files, writes them into the Sprite, and uploads the output", async () => {
    vi.stubEnv("SPRITES_TOKEN", "sprite-token");
    const { sprite, mockWriteFile, mockReadFile } = createMockSprite();
    const uploadArtifact = vi.fn().mockResolvedValue({
      storagePath: "client-1/artifacts/result.xlsx",
      downloadUrl: "https://storage.example.com/signed/result.xlsx",
    });

    mockFindActiveSpriteSession.mockResolvedValue(null);
    mockGetOrCreateSprite.mockResolvedValue({
      sprite,
      spriteName: "thread-12345678",
      isNew: true,
    });
    mockUpsertSpriteSession.mockResolvedValue(null);
    mockLoadSkillFilesForSandbox.mockResolvedValue([{ path: "re-analyst/SKILL.md", content: "# Preferences" }]);
    mockRunClaudeInSprite.mockResolvedValue({
      success: true,
      summary: "Workbook ready",
      spriteName: "thread-12345678",
      outputFiles: [],
      cliOutput: "done",
    });
    mockReadFile.mockResolvedValue(Buffer.from("xlsx"));
    mockTouchSpriteSession.mockResolvedValue(undefined);
    mockCreateAgentFileClient.mockReturnValue({ uploadArtifact });
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

    expect(fetch).toHaveBeenCalledWith("https://example.com/a.xlsx");
    expect(mockWriteFile).toHaveBeenCalledWith("/workspace/input/a.xlsx", expect.any(Buffer));
    expect(mockRunClaudeInSprite).toHaveBeenCalledWith(
      sprite,
      expect.objectContaining({
        task: "Compare these deals",
        inputFilenames: ["a.xlsx"],
        userSkillSlug: "re-analyst",
      }),
    );
    expect(uploadArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringContaining("artifacts/sandbox/result-"),
        contentType: XLSX_MIME,
        expiresInSeconds: 2_592_000,
        downloadFilename: "result.xlsx",
      }),
    );
    expect(result).toEqual({
      success: true,
      summary: "Workbook ready",
      outputFiles: [
        {
          filename: "result.xlsx",
          storagePath: "client-1/artifacts/result.xlsx",
          downloadUrl: "https://storage.example.com/signed/result.xlsx",
          mediaType: XLSX_MIME,
        },
      ],
      spriteName: "thread-12345678",
    });
  });

  it("passes the existing session sprite name so follow-up runs reuse the same Sprite", async () => {
    vi.stubEnv("SPRITES_TOKEN", "sprite-token");
    const { sprite, mockReadFile } = createMockSprite();

    mockFindActiveSpriteSession.mockResolvedValue({
      sprite_name: "thread-existing",
    });
    mockGetOrCreateSprite.mockResolvedValue({
      sprite,
      spriteName: "thread-existing",
      isNew: false,
    });
    mockLoadSkillFilesForSandbox.mockResolvedValue([]);
    mockRunClaudeInSprite.mockResolvedValue({
      success: true,
      summary: "Workbook ready",
      spriteName: "thread-existing",
      outputFiles: [],
      cliOutput: "done",
    });
    mockReadFile.mockResolvedValue(Buffer.from("xlsx"));
    mockCreateAgentFileClient.mockReturnValue({
      uploadArtifact: vi.fn().mockResolvedValue({
        storagePath: "client-1/artifacts/result.xlsx",
        downloadUrl: "https://storage.example.com/signed/result.xlsx",
      }),
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

    mockFindActiveSpriteSession.mockResolvedValue(null);
    mockGetOrCreateSprite.mockResolvedValue({
      sprite,
      spriteName: "thread-12345678",
      isNew: true,
    });
    mockLoadSkillFilesForSandbox.mockResolvedValue([]);
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

  it("returns an error when the Sprite did not produce result.xlsx", async () => {
    vi.stubEnv("SPRITES_TOKEN", "sprite-token");
    const { sprite, mockReadFile } = createMockSprite();

    mockFindActiveSpriteSession.mockResolvedValue(null);
    mockGetOrCreateSprite.mockResolvedValue({
      sprite,
      spriteName: "thread-12345678",
      isNew: true,
    });
    mockLoadSkillFilesForSandbox.mockResolvedValue([]);
    mockRunClaudeInSprite.mockResolvedValue({
      success: true,
      summary: "Workbook ready",
      spriteName: "thread-12345678",
      outputFiles: [],
      cliOutput: "done",
    });
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
    mockCreateAgentFileClient.mockReturnValue({ uploadArtifact: vi.fn() });

    const tools = createAnalyzeSpreadsheetTool({} as never, "client-1", "12345678-aaaa-bbbb-cccc");
    const result = await tools.analyze_spreadsheet.execute({
      task: "Compare these deals",
      files: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("result.xlsx");
  });

  it("returns an upload error when signing or upload fails", async () => {
    vi.stubEnv("SPRITES_TOKEN", "sprite-token");
    const { sprite, mockReadFile } = createMockSprite();

    mockFindActiveSpriteSession.mockResolvedValue(null);
    mockGetOrCreateSprite.mockResolvedValue({
      sprite,
      spriteName: "thread-12345678",
      isNew: true,
    });
    mockLoadSkillFilesForSandbox.mockResolvedValue([]);
    mockRunClaudeInSprite.mockResolvedValue({
      success: true,
      summary: "Workbook ready",
      spriteName: "thread-12345678",
      outputFiles: [],
      cliOutput: "done",
    });
    mockReadFile.mockResolvedValue(Buffer.from("xlsx"));
    mockCreateAgentFileClient.mockReturnValue({
      uploadArtifact: vi.fn().mockRejectedValue(new Error("upload failed")),
    });

    const tools = createAnalyzeSpreadsheetTool({} as never, "client-1", "12345678-aaaa-bbbb-cccc");
    const result = await tools.analyze_spreadsheet.execute({
      task: "Compare these deals",
      files: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("upload failed");
  });
});
