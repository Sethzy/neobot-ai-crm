import { afterEach, describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";

import { attachFileToRecordTool } from "../attach-file";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const CONTACT_ID = "550e8400-e29b-41d4-a716-446655440001";
const ATTACHMENT_ID = "550e8400-e29b-41d4-a716-446655440010";
const STORAGE_UUID = "00000000-0000-0000-0000-000000000099";

function makeContext(
  client: ReturnType<typeof createMockSupabase>["client"],
): ToolContext {
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: client as any,
    clientId: CLIENT_ID,
    threadId: "thread-1",
    isChatContext: true,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("attachFileToRecordTool", () => {
  it("copies a workspace file and creates the attachment row", async () => {
    vi.stubGlobal("crypto", {
      ...crypto,
      randomUUID: () => STORAGE_UUID,
    });

    const created = {
      attachment_id: ATTACHMENT_ID,
      client_id: CLIENT_ID,
      record_type: "contact",
      record_id: CONTACT_ID,
      filename: "report.pdf",
      storage_path: `attachments/contact/${CONTACT_ID}/${STORAGE_UUID}`,
      content_type: "application/pdf",
      file_size: 2048,
      file_category: "pdf",
      created_at: "2026-04-05T00:00:00Z",
      updated_at: "2026-04-05T00:00:00Z",
    };

    const sourceBlob = {
      type: "application/pdf",
      size: 2048,
      arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode("file content").buffer),
    };

    const download = vi.fn().mockResolvedValue({ data: sourceBlob, error: null });
    const upload = vi.fn().mockResolvedValue({ error: null });
    const remove = vi.fn().mockResolvedValue({ error: null });

    const { client, builders } = createMockSupabase({
      record_attachments: { data: created, error: null },
    });

    client.storage = {
      from: vi.fn().mockReturnValue({ download, upload, remove }),
    } as never;

    const result = await attachFileToRecordTool.execute(
      {
        source_path: "/agent/home/report.pdf",
        record_type: "contact",
        record_id: CONTACT_ID,
        filename: "report.pdf",
      },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, attachment: created });
    expect(builders.record_attachments.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: CLIENT_ID,
        record_type: "contact",
        record_id: CONTACT_ID,
      }),
    );
  });
});
