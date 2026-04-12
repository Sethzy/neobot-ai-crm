import { beforeEach, describe, expect, it, vi } from "vitest";

import { uploadFilePartsToAnthropic } from "../upload-files-for-session";

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
