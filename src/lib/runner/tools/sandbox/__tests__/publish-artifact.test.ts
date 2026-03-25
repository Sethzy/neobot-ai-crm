/**
 * Tests for the publish_artifact sandbox tool (async execution).
 * @module lib/runner/tools/sandbox/__tests__/publish-artifact
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockFindActiveSpriteSession,
  mockGetOrCreateSprite,
  mockLoadSkillFilesForSandbox,
  mockLaunchArtifactBackgroundJob,
  mockWritePropertyDataToSprite,
  mockDownloadPhotosToSprite,
  mockWriteSkillFilesToSprite,
  mockEnsureDevServerService,
  mockBuildArtifactPrompt,
  mockTouchSpriteSession,
  mockUpsertSpriteSession,
  mockFindRunningJob,
  mockInsertSpriteJob,
  mockUpdateJobStatus,
  mockGetPropertyShowcaseTemplateFiles,
} = vi.hoisted(() => ({
  mockFindActiveSpriteSession: vi.fn(),
  mockGetOrCreateSprite: vi.fn(),
  mockLoadSkillFilesForSandbox: vi.fn(),
  mockLaunchArtifactBackgroundJob: vi.fn(),
  mockWritePropertyDataToSprite: vi.fn(),
  mockDownloadPhotosToSprite: vi.fn().mockResolvedValue([]),
  mockWriteSkillFilesToSprite: vi.fn(),
  mockEnsureDevServerService: vi.fn(),
  mockBuildArtifactPrompt: vi.fn().mockReturnValue("test prompt"),
  mockTouchSpriteSession: vi.fn(),
  mockUpsertSpriteSession: vi.fn(),
  mockFindRunningJob: vi.fn(),
  mockInsertSpriteJob: vi.fn(),
  mockUpdateJobStatus: vi.fn(),
  mockGetPropertyShowcaseTemplateFiles: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/sandbox/sprite-session", () => ({
  findActiveSpriteSession: mockFindActiveSpriteSession,
  touchSpriteSession: mockTouchSpriteSession,
  upsertSpriteSession: mockUpsertSpriteSession,
}));

vi.mock("@/lib/sandbox/sprites-client", () => ({
  getOrCreateSprite: mockGetOrCreateSprite,
}));

vi.mock("@/lib/sandbox/skill-loader", () => ({
  loadSkillFilesForSandbox: mockLoadSkillFilesForSandbox,
}));

vi.mock("@/lib/sandbox/artifact-runner", () => ({
  launchArtifactBackgroundJob: mockLaunchArtifactBackgroundJob,
  writePropertyDataToSprite: mockWritePropertyDataToSprite,
  downloadPhotosToSprite: mockDownloadPhotosToSprite,
  writeSkillFilesToSprite: mockWriteSkillFilesToSprite,
  ensureDevServerService: mockEnsureDevServerService,
}));

vi.mock("@/lib/sandbox/artifact-prompt", () => ({
  buildArtifactPrompt: mockBuildArtifactPrompt,
}));

vi.mock("@/lib/sandbox/sprite-jobs", () => ({
  findRunningJob: mockFindRunningJob,
  insertSpriteJob: mockInsertSpriteJob,
  updateJobStatus: mockUpdateJobStatus,
}));

vi.mock("@/lib/sandbox/sandbox-paths", () => ({
  jobOutputDir: vi.fn((id: string) => `/workspace/jobs/${id}`),
}));

vi.mock("@/lib/sandbox/templates/property-showcase/template-files", () => ({
  getPropertyShowcaseTemplateFiles: mockGetPropertyShowcaseTemplateFiles,
}));

import { createPublishArtifactTool } from "../publish-artifact";

function createMockSprite() {
  return {
    name: "thread-thread-a",
    url: "https://preview.example.test",
    filesystem: vi.fn(() => ({
      writeFile: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn(),
    })),
    execFile: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
    spawn: vi.fn(),
    listServices: vi.fn().mockResolvedValue([]),
    createService: vi.fn().mockResolvedValue({ processAll: vi.fn().mockResolvedValue(undefined) }),
    startService: vi.fn().mockResolvedValue({ processAll: vi.fn().mockResolvedValue(undefined) }),
    updateURLSettings: vi.fn().mockResolvedValue(undefined),
  };
}

describe("createPublishArtifactTool", () => {
  const mockSupabase = {} as never;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SPRITES_TOKEN = "sprites-token";

    const sprite = createMockSprite();
    mockFindActiveSpriteSession.mockResolvedValue(null);
    mockGetOrCreateSprite.mockResolvedValue({
      sprite,
      spriteName: "thread-thread-a",
      isNew: true,
    });
    mockLoadSkillFilesForSandbox.mockResolvedValue([]);
    mockFindRunningJob.mockResolvedValue(null);
    mockInsertSpriteJob.mockResolvedValue(undefined);
    mockLaunchArtifactBackgroundJob.mockResolvedValue(undefined);
    mockUpdateJobStatus.mockResolvedValue(undefined);
    mockWritePropertyDataToSprite.mockResolvedValue(undefined);
    mockWriteSkillFilesToSprite.mockResolvedValue(undefined);
    mockEnsureDevServerService.mockResolvedValue(undefined);
    mockUpsertSpriteSession.mockResolvedValue(null);
    mockTouchSpriteSession.mockResolvedValue(undefined);
  });

  it("exposes description, inputSchema, and execute", () => {
    const tools = createPublishArtifactTool(mockSupabase, "client-1", "thread-1");

    expect(tools.publish_artifact.description).toContain("web page");
    expect(tools.publish_artifact.description).toContain("preview");
    expect(tools.publish_artifact.inputSchema).toBeDefined();
    expect(tools.publish_artifact.execute).toBeDefined();
  });

  it("validates task, propertyData, optional photoUrls, and shipIt", () => {
    const tools = createPublishArtifactTool(mockSupabase, "client-1", "thread-1");

    expect(
      tools.publish_artifact.inputSchema.parse({
        task: "Build a showcase.",
        propertyData: { address: "42 Noriega Street" },
        photoUrls: ["https://example.com/hero.jpg"],
        shipIt: true,
      }),
    ).toEqual({
      task: "Build a showcase.",
      propertyData: { address: "42 Noriega Street" },
      photoUrls: ["https://example.com/hero.jpg"],
      shipIt: true,
    });
  });

  it("returns an error when SPRITES_TOKEN is missing", async () => {
    delete process.env.SPRITES_TOKEN;
    const tools = createPublishArtifactTool(mockSupabase, "client-1", "thread-1");

    const result = await tools.publish_artifact.execute({
      task: "Build a showcase.",
      propertyData: { address: "42 Noriega Street" },
    });

    expect(result).toEqual({
      success: false,
      error: "Missing SPRITES_TOKEN environment variable.",
    });
  });

  it("returns immediately with status 'started' and launches background job", async () => {
    const tools = createPublishArtifactTool(mockSupabase, "client-1", "thread-abcdef123456");

    const result = await tools.publish_artifact.execute({
      task: "Build a showcase.",
      propertyData: { address: "42 Noriega Street" },
    });

    expect(result).toMatchObject({
      success: true,
      status: "started",
      previewUrl: "https://preview.example.test",
    });
    expect(result.message).toContain("started");
    expect(mockInsertSpriteJob).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        client_id: "client-1",
        thread_id: "thread-abcdef123456",
        sprite_name: "thread-thread-a",
        job_type: "artifact",
      }),
    );
    expect(mockLaunchArtifactBackgroundJob).toHaveBeenCalledTimes(1);
    expect(mockUpdateJobStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "running",
    );
    // Dev server is NOT started on new sprites — /workspace/app doesn't exist yet
    expect(mockEnsureDevServerService).not.toHaveBeenCalled();
    expect(mockTouchSpriteSession).toHaveBeenCalledWith(mockSupabase, "thread-thread-a");
  });

  it("rejects if a job is already running on the same sprite", async () => {
    mockFindRunningJob.mockResolvedValue({ id: "existing-job" });

    const tools = createPublishArtifactTool(mockSupabase, "client-1", "thread-1");
    const result = await tools.publish_artifact.execute({
      task: "Build a showcase.",
      propertyData: { address: "42 Noriega Street" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("already running");
    expect(mockLaunchArtifactBackgroundJob).not.toHaveBeenCalled();
  });

  it("reuses the active sprite on follow-up runs", async () => {
    mockFindActiveSpriteSession.mockResolvedValue({
      sprite_name: "thread-thread-a",
    });
    const sprite = createMockSprite();
    mockGetOrCreateSprite.mockResolvedValue({
      sprite,
      spriteName: "thread-thread-a",
      isNew: false,
    });

    const tools = createPublishArtifactTool(mockSupabase, "client-1", "thread-abcdef123456");
    await tools.publish_artifact.execute({
      task: "Swap the hero image.",
      propertyData: { address: "42 Noriega Street" },
      photoUrls: ["https://example.com/new-hero.jpg"],
    });

    expect(mockGetOrCreateSprite).toHaveBeenCalledWith({
      token: "sprites-token",
      existingSpriteName: "thread-thread-a",
      spriteName: "thread-thread-a",
    });
    expect(mockBuildArtifactPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        isFollowUp: true,
      }),
    );
  });

  it("marks job as failed when launchArtifactBackgroundJob throws", async () => {
    mockLaunchArtifactBackgroundJob.mockRejectedValue(new Error("spawn failed"));

    const tools = createPublishArtifactTool(mockSupabase, "client-1", "thread-1");
    const result = await tools.publish_artifact.execute({
      task: "Build a showcase.",
      propertyData: { address: "42 Noriega Street" },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Failed to start");
    expect(mockUpdateJobStatus).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(String),
      "failed",
    );
  });

  it("returns a failure when sprite-session persistence fails", async () => {
    mockFindActiveSpriteSession.mockRejectedValue(new Error("db unavailable"));

    const tools = createPublishArtifactTool(mockSupabase, "client-1", "thread-1");
    const result = await tools.publish_artifact.execute({
      task: "Build a showcase.",
      propertyData: { address: "42 Noriega Street" },
    });

    expect(result).toEqual({
      success: false,
      error: "db unavailable",
    });
  });
});
