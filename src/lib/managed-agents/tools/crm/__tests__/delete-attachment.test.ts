import { describe, expect, it, vi } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";

import { deleteRecordAttachmentTool } from "../delete-attachment";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const CONTACT_ID = "550e8400-e29b-41d4-a716-446655440001";
const ATTACHMENT_ID = "550e8400-e29b-41d4-a716-446655440010";

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

describe("deleteRecordAttachmentTool", () => {
  it("deletes the attachment row and removes the storage object", async () => {
    const deleted = {
      attachment_id: ATTACHMENT_ID,
      client_id: CLIENT_ID,
      record_type: "contact",
      record_id: CONTACT_ID,
      storage_path: `attachments/contact/${CONTACT_ID}/uuid-1`,
    };
    const remove = vi.fn().mockResolvedValue({ error: null });
    const { client, builders } = createMockSupabase({
      record_attachments: { data: deleted, error: null },
    });

    client.storage = {
      from: vi.fn().mockReturnValue({
        download: vi.fn(),
        upload: vi.fn(),
        remove,
      }),
    } as never;

    const result = await deleteRecordAttachmentTool.execute(
      { attachment_id: ATTACHMENT_ID },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, deleted_id: ATTACHMENT_ID });
    expect(builders.record_attachments.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });
});
