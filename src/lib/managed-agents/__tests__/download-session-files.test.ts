import { beforeEach, describe, expect, it, vi } from "vitest";

import { downloadSessionFiles } from "../download-session-files";

const filesList = vi.fn();
const filesDownload = vi.fn();
const storageUpload = vi.fn();
const createSignedUrl = vi.fn();

vi.mock("../anthropic-client", () => ({
  getAnthropicClient: () => ({
    beta: {
      files: {
        list: filesList,
        download: filesDownload,
      },
    },
  }),
}));

function mockSupabase() {
  return {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: storageUpload,
        createSignedUrl,
      }),
    },
  } as never;
}

describe("downloadSessionFiles", () => {
  beforeEach(() => {
    vi.useRealTimers();
    filesList.mockReset();
    filesDownload.mockReset();
    storageUpload.mockReset().mockResolvedValue({ error: null });
    createSignedUrl.mockReset().mockResolvedValue({
      data: { signedUrl: "https://signed.example" },
      error: null,
    });
  });

  it("lists files, downloads each, and mirrors to Supabase Storage", async () => {
    filesList.mockResolvedValue({
      data: [
        { id: "file_1", filename: "report.pdf", mime_type: "application/pdf" },
      ],
    });
    filesDownload.mockResolvedValue(
      new Response(new Blob(["pdf bytes"], { type: "application/pdf" })),
    );

    const result = await downloadSessionFiles({
      supabase: mockSupabase(),
      clientId: "client_1",
      sessionId: "session_abc",
    });

    expect(filesList).toHaveBeenCalledWith({ scope_id: "session_abc", betas: ["managed-agents-2026-04-01"] });
    expect(filesDownload).toHaveBeenCalledWith("file_1");
    expect(storageUpload).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        anthropicFileId: "file_1",
        filename: "report.pdf",
        mediaType: "application/pdf",
        storagePath: "sessions/session_abc/report.pdf",
        signedUrl: "https://signed.example",
      },
    ]);
  });

  it("retries listing with exponential backoff when empty", async () => {
    filesList
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [{ id: "file_1", filename: "late.pdf", mime_type: "application/pdf" }],
      });
    filesDownload.mockResolvedValue(new Response(new Blob(["bytes"])));

    vi.useFakeTimers();

    const promise = downloadSessionFiles({
      supabase: mockSupabase(),
      clientId: "client_1",
      sessionId: "session_abc",
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(filesList).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(1);
  });

  it("returns an empty list after retries are exhausted", async () => {
    filesList.mockResolvedValue({ data: [] });

    vi.useFakeTimers();

    const promise = downloadSessionFiles({
      supabase: mockSupabase(),
      clientId: "client_1",
      sessionId: "session_abc",
    });

    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual([]);
    expect(filesDownload).not.toHaveBeenCalled();
  });
});
