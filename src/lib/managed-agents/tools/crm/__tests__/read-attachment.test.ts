import { describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";

import { readRecordAttachmentTool } from "../read-attachment";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";

function createLookupBuilder(result: { data: unknown; error: { message: string } | null }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn(),
    then: (
      resolve: (value: { data: unknown; error: { message: string } | null }) => void,
      reject?: (reason: unknown) => void,
    ) => Promise.resolve(result).then(resolve, reject),
  };

  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.maybeSingle.mockReturnValue(builder);

  return builder;
}

function makeContext(input: {
  attachment: unknown;
  downloadResult?: { data: Blob | null; error: { message: string } | null };
}): ToolContext & {
  builder: ReturnType<typeof createLookupBuilder>;
  download: ReturnType<typeof vi.fn>;
} {
  const builder = createLookupBuilder({
    data: input.attachment,
    error: null,
  });
  const download = vi.fn().mockResolvedValue(
    input.downloadResult ?? { data: null, error: null },
  );

  return {
    supabase: {
      from: vi.fn().mockReturnValue(builder),
      storage: {
        from: vi.fn().mockReturnValue({
          download,
        }),
      },
    } as ToolContext["supabase"],
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
    builder,
    download,
  };
}

describe("readRecordAttachmentTool", () => {
  it("returns canonical path data and inline content for text attachments", async () => {
    const context = makeContext({
      attachment: {
        attachment_id: "a1",
        filename: "report.csv",
        storage_path: "attachments/deal/d1/report.csv",
        content_type: "text/csv",
        file_size: 12,
      },
      downloadResult: {
        data: {
          text: vi.fn().mockResolvedValue("a,b\n1,2"),
        } as unknown as Blob,
        error: null,
      },
    });

    const result = await readRecordAttachmentTool.execute(
      { attachment_id: "550e8400-e29b-41d4-a716-446655440001" },
      context,
    );

    expect(result).toEqual({
      success: true,
      attachment_id: "a1",
      filename: "report.csv",
      content_type: "text/csv",
      file_size: 12,
      storage_path: "attachments/deal/d1/report.csv",
      agent_path: "/agent/attachments/deal/d1/report.csv",
      download_url:
        "/api/files/download?path=attachments%2Fdeal%2Fd1%2Freport.csv&filename=report.csv",
      content: "a,b\n1,2",
    });

    expect(context.builder.eq).toHaveBeenNthCalledWith(1, "client_id", CLIENT_ID);
    expect(context.builder.eq).toHaveBeenNthCalledWith(
      2,
      "attachment_id",
      "550e8400-e29b-41d4-a716-446655440001",
    );
    expect(context.download).toHaveBeenCalledWith(`${CLIENT_ID}/attachments/deal/d1/report.csv`);
  });

  it("returns download metadata without copying or downloading binary attachments", async () => {
    const context = makeContext({
      attachment: {
        attachment_id: "a2",
        filename: "brochure.pdf",
        storage_path: "attachments/deal/d1/brochure.pdf",
        content_type: "application/pdf",
        file_size: 2048,
      },
    });

    const result = await readRecordAttachmentTool.execute(
      { attachment_id: "660e8400-e29b-41d4-a716-446655440001" },
      context,
    );

    expect(result).toEqual({
      success: true,
      attachment_id: "a2",
      filename: "brochure.pdf",
      content_type: "application/pdf",
      file_size: 2048,
      storage_path: "attachments/deal/d1/brochure.pdf",
      agent_path: "/agent/attachments/deal/d1/brochure.pdf",
      download_url:
        "/api/files/download?path=attachments%2Fdeal%2Fd1%2Fbrochure.pdf&filename=brochure.pdf",
      message:
        "Use storage_read on /agent/attachments/deal/d1/brochure.pdf to inspect the file. Use download_url when the user needs the raw file in their browser.",
    });

    expect(context.download).not.toHaveBeenCalled();
    expect(context.supabase.storage.from).not.toHaveBeenCalled();
  });
});
