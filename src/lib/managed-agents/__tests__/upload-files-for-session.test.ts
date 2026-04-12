import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  mountUploadedFilesToSession,
  uploadFilePartsToAnthropic,
} from "../upload-files-for-session";

describe("uploadFilePartsToAnthropic", () => {
  const upload = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    upload.mockResolvedValue({ id: "file_123" });
  });

  it("uploads fetched file parts to Anthropic and returns their file ids", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(new Blob(["pdf"], { type: "application/pdf" }), {
        status: 200,
      }),
    );

    const anthropic = {
      beta: {
        files: { upload },
      },
    } as never;

    const uploaded = await uploadFilePartsToAnthropic(anthropic, [
      {
        type: "file",
        url: "https://storage.example.com/y.pdf",
        mediaType: "application/pdf",
        filename: "y.pdf",
      },
    ]);

    expect(uploaded).toEqual([{ fileId: "file_123", filename: "y.pdf" }]);
    expect(upload).toHaveBeenCalledWith(
      expect.objectContaining({
        file: expect.any(File),
      }),
    );
  });
});

describe("mountUploadedFilesToSession", () => {
  const add = vi.fn();
  const remove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    add.mockReset().mockResolvedValue({ id: "sesrsc_1" });
    remove.mockReset().mockResolvedValue({ id: "deleted_1" });
  });

  it("mounts uploaded file ids onto the session", async () => {
    const anthropic = {
      beta: {
        sessions: {
          resources: {
            add,
            delete: remove,
          },
        },
      },
    } as never;

    await mountUploadedFilesToSession({
      anthropic,
      sessionId: "sess_1",
      uploadedFiles: [{ fileId: "file_123", filename: "brief.pdf" }],
      logLabel: "test",
    });

    expect(add).toHaveBeenCalledWith("sess_1", {
      type: "file",
      file_id: "file_123",
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it("rolls back mounted resources when a later add fails", async () => {
    add
      .mockResolvedValueOnce({ id: "sesrsc_1" })
      .mockRejectedValueOnce(new Error("mount failed"));
    const anthropic = {
      beta: {
        sessions: {
          resources: {
            add,
            delete: remove,
          },
        },
      },
    } as never;

    await expect(
      mountUploadedFilesToSession({
        anthropic,
        sessionId: "sess_1",
        uploadedFiles: [
          { fileId: "file_123", filename: "brief.pdf" },
          { fileId: "file_456", filename: "notes.pdf" },
        ],
        logLabel: "test",
      }),
    ).rejects.toThrow("mount failed");

    expect(remove).toHaveBeenCalledWith("sesrsc_1", {
      session_id: "sess_1",
    });
  });
});
