import { beforeEach, describe, expect, it, vi } from "vitest";

const { mountUploadedFilesToSession, uploadFilePartsToAnthropic } = vi.hoisted(() => ({
  uploadFilePartsToAnthropic: vi.fn(),
  mountUploadedFilesToSession: vi.fn(),
}));

vi.mock("../upload-files-for-session", () => ({
  uploadFilePartsToAnthropic,
  mountUploadedFilesToSession,
}));

import { attachFilesToManagedSession } from "../adapter";

describe("attachFilesToManagedSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadFilePartsToAnthropic.mockResolvedValue([
      { fileId: "file_123", filename: "y.pdf" },
    ]);
    mountUploadedFilesToSession.mockResolvedValue(undefined);
  });

  it("throws when any attachment fetch fails", async () => {
    uploadFilePartsToAnthropic.mockRejectedValueOnce(
      new Error("Failed to fetch attachment y.pdf (500)"),
    );

    await expect(
      attachFilesToManagedSession({
        anthropic: {} as never,
        sessionId: "sess_x",
        fileParts: [
          {
            type: "file",
            url: "https://x/y.pdf",
            mediaType: "application/pdf",
            filename: "y.pdf",
          },
        ],
        logLabel: "test",
      }),
    ).rejects.toThrow(/Failed to fetch attachment/);

    expect(mountUploadedFilesToSession).not.toHaveBeenCalled();
  });

  it("throws when mounting uploaded files fails", async () => {
    mountUploadedFilesToSession.mockRejectedValueOnce(new Error("mount failed"));

    await expect(
      attachFilesToManagedSession({
        anthropic: {} as never,
        sessionId: "sess_x",
        fileParts: [
          {
            type: "file",
            url: "https://x/y.pdf",
            mediaType: "application/pdf",
            filename: "y.pdf",
          },
        ],
        logLabel: "test",
      }),
    ).rejects.toThrow("mount failed");
  });
});
