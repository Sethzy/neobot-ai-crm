import { beforeEach, describe, expect, it, vi } from "vitest";

import { attachFileToSession } from "../attach-session-file";

const filesUpload = vi.fn();
const resourcesAdd = vi.fn();

vi.mock("../anthropic-client", () => ({
  getAnthropicClient: () => ({
    beta: {
      files: { upload: filesUpload },
      sessions: { resources: { add: resourcesAdd } },
    },
  }),
}));

describe("attachFileToSession", () => {
  beforeEach(() => {
    filesUpload.mockReset().mockResolvedValue({ id: "file_123" });
    resourcesAdd.mockReset().mockResolvedValue({});
  });

  it("uploads to Anthropic and attaches the returned file id as a session resource", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });

    await attachFileToSession({
      sessionId: "session_abc",
      file: blob,
      filename: "notes.txt",
    });

    expect(filesUpload).toHaveBeenCalledWith(
      expect.objectContaining({ file: expect.anything() }),
    );
    expect(resourcesAdd).toHaveBeenCalledWith("session_abc", {
      type: "file",
      file_id: "file_123",
    });
  });

  it("surfaces the Anthropic file id in the return value", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });

    const result = await attachFileToSession({
      sessionId: "session_abc",
      file: blob,
      filename: "notes.txt",
    });

    expect(result).toEqual({
      attached: true,
      anthropicFileId: "file_123",
    });
  });

  it("returns attached false when no sessionId is provided", async () => {
    const blob = new Blob(["hello"], { type: "text/plain" });

    const result = await attachFileToSession({
      sessionId: null,
      file: blob,
      filename: "notes.txt",
    });

    expect(result).toEqual({ attached: false });
    expect(filesUpload).not.toHaveBeenCalled();
    expect(resourcesAdd).not.toHaveBeenCalled();
  });
});
