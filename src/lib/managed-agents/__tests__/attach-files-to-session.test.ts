import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { attachFileToSession } = vi.hoisted(() => ({
  attachFileToSession: vi.fn().mockResolvedValue({
    attached: true,
    anthropicFileId: "file_1",
  }),
}));

vi.mock("../attach-session-file", () => ({
  attachFileToSession,
}));

import { attachFilesToManagedSession } from "../adapter";

describe("attachFilesToManagedSession", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws when any attachment fetch fails", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as never;

    await expect(
      attachFilesToManagedSession({
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

    expect(attachFileToSession).not.toHaveBeenCalled();
  });
});
