/**
 * Tests for the publish_artifact sandbox tool.
 * @module lib/runner/tools/sandbox/__tests__/publish-artifact
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCreateAgentFileClient,
  mockFindActiveSpriteSession,
  mockGetOrCreateSprite,
  mockLoadSkillFilesForSandbox,
  mockRunArtifactInSprite,
  mockTouchSpriteSession,
  mockUpsertSpriteSession,
} = vi.hoisted(() => ({
  mockCreateAgentFileClient: vi.fn(),
  mockFindActiveSpriteSession: vi.fn(),
  mockGetOrCreateSprite: vi.fn(),
  mockLoadSkillFilesForSandbox: vi.fn(),
  mockRunArtifactInSprite: vi.fn(),
  mockTouchSpriteSession: vi.fn(),
  mockUpsertSpriteSession: vi.fn(),
}));

vi.mock("@/lib/storage/agent-files", () => ({
  createAgentFileClient: mockCreateAgentFileClient,
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
  runArtifactInSprite: mockRunArtifactInSprite,
}));

import { createPublishArtifactTool } from "../publish-artifact";

describe("createPublishArtifactTool", () => {
  const mockSupabase = {} as never;
  const mockUploadArtifact = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SPRITES_TOKEN = "sprites-token";

    mockCreateAgentFileClient.mockReturnValue({
      uploadArtifact: mockUploadArtifact,
    });
    mockFindActiveSpriteSession.mockResolvedValue(null);
    mockGetOrCreateSprite.mockResolvedValue({
      sprite: { name: "thread-thread-a", url: "https://preview.example.test" },
      spriteName: "thread-thread-a",
      isNew: true,
    });
    mockLoadSkillFilesForSandbox.mockResolvedValue([]);
    mockRunArtifactInSprite.mockResolvedValue({
      success: true,
      summary: "Preview updated.",
      previewUrl: "https://preview.example.test",
    });
    mockUpsertSpriteSession.mockResolvedValue(null);
    mockTouchSpriteSession.mockResolvedValue(undefined);
    mockUploadArtifact.mockResolvedValue({
      storagePath: "client-1/artifacts/sandbox/property-showcase.html",
      downloadUrl: "https://storage.example.test/signed/property-showcase.html",
    });
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

  it("uses the PR52 sprite-session and sprites-client split on the first run", async () => {
    const tools = createPublishArtifactTool(mockSupabase, "client-1", "thread-abcdef123456");

    const result = await tools.publish_artifact.execute({
      task: "Build a showcase.",
      propertyData: { address: "42 Noriega Street" },
    });

    expect(result).toMatchObject({
      success: true,
      previewUrl: "https://preview.example.test",
      published: false,
    });
    expect(mockFindActiveSpriteSession).toHaveBeenCalledWith(
      mockSupabase,
      "thread-abcdef123456",
    );
    expect(mockGetOrCreateSprite).toHaveBeenCalledWith({
      token: "sprites-token",
      existingSpriteName: undefined,
      spriteName: "thread-thread-a",
    });
    expect(mockLoadSkillFilesForSandbox).toHaveBeenCalledWith(
      mockSupabase,
      "client-1",
      "frontend-design",
    );
    expect(mockRunArtifactInSprite).toHaveBeenCalledWith(
      expect.objectContaining({ name: "thread-thread-a" }),
      expect.objectContaining({
        task: "Build a showcase.",
        propertyData: { address: "42 Noriega Street" },
        photoUrls: [],
        userSkillFiles: [],
        isNew: true,
      }),
    );
    expect(mockUpsertSpriteSession).toHaveBeenCalledWith(
      mockSupabase,
      expect.objectContaining({
        client_id: "client-1",
        thread_id: "thread-abcdef123456",
        sprite_name: "thread-thread-a",
        status: "running",
        preview_url: "https://preview.example.test",
      }),
    );
    expect(mockTouchSpriteSession).toHaveBeenCalledWith(mockSupabase, "thread-thread-a");
  });

  it("reuses the active sprite on follow-up runs", async () => {
    mockFindActiveSpriteSession.mockResolvedValue({
      sprite_name: "thread-thread-a",
    });
    mockGetOrCreateSprite.mockResolvedValue({
      sprite: { name: "thread-thread-a", url: "https://preview.example.test" },
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
    expect(mockRunArtifactInSprite).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        isNew: false,
        photoUrls: ["https://example.com/new-hero.jpg"],
      }),
    );
  });

  it("uploads built HTML through createAgentFileClient on ship-it and returns a signed URL", async () => {
    mockRunArtifactInSprite.mockResolvedValue({
      success: true,
      summary: "Final page built.",
      previewUrl: "https://preview.example.test",
      outputHtml: "<html>final</html>",
    });

    const tools = createPublishArtifactTool(mockSupabase, "client-1", "thread-1");
    const result = await tools.publish_artifact.execute({
      task: "Ship it.",
      propertyData: { address: "42 Noriega Street" },
      shipIt: true,
    });

    expect(mockUploadArtifact).toHaveBeenCalledWith(
      expect.objectContaining({
        path: expect.stringMatching(/^artifacts\/sandbox\/property-showcase-\d+\.html$/),
        content: "<html>final</html>",
        contentType: "text/html; charset=utf-8",
        expiresInSeconds: 60 * 60 * 24 * 30,
        downloadFilename: "property-showcase.html",
      }),
    );
    expect(result).toMatchObject({
      success: true,
      previewUrl: "https://preview.example.test",
      published: true,
      publishedUrl: "https://storage.example.test/signed/property-showcase.html",
    });
    expect(result.publicationNote).toContain("30 days");
  });

  it("returns a tool failure when the runner reports a download or build problem", async () => {
    mockRunArtifactInSprite.mockResolvedValue({
      success: false,
      error: "Failed to download photo \"https://example.com/missing.jpg\" (status 404).",
      summary: "",
      previewUrl: "https://preview.example.test",
    });

    const tools = createPublishArtifactTool(mockSupabase, "client-1", "thread-1");
    const result = await tools.publish_artifact.execute({
      task: "Build a showcase.",
      propertyData: { address: "42 Noriega Street" },
      photoUrls: ["https://example.com/missing.jpg"],
    });

    expect(result).toEqual({
      success: false,
      error: 'Failed to download photo "https://example.com/missing.jpg" (status 404).',
    });
  });

  it("returns a failure when ship-it mode does not produce an output artifact", async () => {
    mockRunArtifactInSprite.mockResolvedValue({
      success: false,
      error: "Sandbox run completed but /tmp/output.html was not produced.",
      summary: "",
      previewUrl: "https://preview.example.test",
    });

    const tools = createPublishArtifactTool(mockSupabase, "client-1", "thread-1");
    const result = await tools.publish_artifact.execute({
      task: "Ship it.",
      propertyData: { address: "42 Noriega Street" },
      shipIt: true,
    });

    expect(result).toEqual({
      success: false,
      error: "Sandbox run completed but /tmp/output.html was not produced.",
    });
  });

  it("returns a failure when artifact upload fails", async () => {
    mockRunArtifactInSprite.mockResolvedValue({
      success: true,
      summary: "Final page built.",
      previewUrl: "https://preview.example.test",
      outputHtml: "<html>final</html>",
    });
    mockUploadArtifact.mockRejectedValue(new Error("Storage quota exceeded"));

    const tools = createPublishArtifactTool(mockSupabase, "client-1", "thread-1");
    const result = await tools.publish_artifact.execute({
      task: "Ship it.",
      propertyData: { address: "42 Noriega Street" },
      shipIt: true,
    });

    expect(result).toEqual({
      success: false,
      error: "Storage quota exceeded",
    });
  });
});
