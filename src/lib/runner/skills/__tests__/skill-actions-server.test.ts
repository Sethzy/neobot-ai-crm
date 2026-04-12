/**
 * Tests for server-side skill actions that touch authenticated storage.
 *
 * @module lib/runner/skills/__tests__/skill-actions-server
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRevalidatePath = vi.fn();
const mockResolveClientId = vi.fn();
const mockCreateClient = vi.fn();
const mockUploadFile = vi.fn();
const mockCreateAgentFileClient = vi.fn();
const mockReadForkMetadata = vi.fn();
const mockWriteForkMetadata = vi.fn();
const mockReadFileSync = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/chat/client-id", () => ({
  resolveClientId: mockResolveClientId,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mockCreateClient,
}));

vi.mock("@/lib/storage/agent-files", () => ({
  AGENT_FILES_BUCKET: "agent-files",
  createAgentFileClient: mockCreateAgentFileClient,
}));

vi.mock("../fork-metadata", () => ({
  readForkMetadata: mockReadForkMetadata,
  writeForkMetadata: mockWriteForkMetadata,
}));

vi.mock("node:fs", () => ({
  default: {
    readFileSync: mockReadFileSync,
  },
}));

describe("saveSkillContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveClientId.mockResolvedValue("client-1");
    mockCreateClient.mockResolvedValue({ storage: { from: vi.fn() } });
    mockCreateAgentFileClient.mockReturnValue({
      uploadFile: mockUploadFile,
    });
    mockUploadFile.mockResolvedValue(undefined);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({
        "call-prep": {
          skillId: "skill_cp",
          displayTitle: "sunder-skill:call-prep",
          latestVersion: "v-current",
        },
      }),
    );
  });

  it("repairs missing fork metadata after saving customized content", async () => {
    mockReadForkMetadata.mockResolvedValue(null);
    const { saveSkillContent } = await import("../skill-actions");

    const result = await saveSkillContent(
      "call-prep",
      [
        "---",
        "name: call-prep",
        "description: Prepare for a call.",
        "---",
        "# Customized",
      ].join("\n"),
    );

    expect(result).toEqual({ success: true });
    expect(mockUploadFile).toHaveBeenCalledWith(
      "skills/call-prep/SKILL.md",
      expect.stringContaining("# Customized"),
    );
    expect(mockWriteForkMetadata).toHaveBeenCalledWith(
      expect.anything(),
      "client-1",
      "call-prep",
      expect.objectContaining({
        forkedFromVersion: "v-current",
      }),
    );
    expect(mockRevalidatePath).toHaveBeenCalledWith("/skills");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/skills/call-prep");
  });

  it("does not rewrite fork metadata when the sidecar already exists", async () => {
    mockReadForkMetadata.mockResolvedValue({
      forkedFromVersion: "v-existing",
      forkedAt: "2026-04-12T00:00:00.000Z",
    });
    const { saveSkillContent } = await import("../skill-actions");

    const result = await saveSkillContent(
      "call-prep",
      [
        "---",
        "name: call-prep",
        "description: Prepare for a call.",
        "---",
        "# Customized",
      ].join("\n"),
    );

    expect(result).toEqual({ success: true });
    expect(mockWriteForkMetadata).not.toHaveBeenCalled();
  });
});
