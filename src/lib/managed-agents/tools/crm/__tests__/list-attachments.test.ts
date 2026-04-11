import { describe, expect, it } from "vitest";

import type { ToolContext } from "@/lib/managed-agents/tools/types";
import { createMockSupabase } from "@/lib/runner/tools/crm/__tests__/mock-supabase";

import { listRecordAttachmentsTool } from "../list-attachments";

const CLIENT_ID = "660e8400-e29b-41d4-a716-446655440000";
const CONTACT_ID = "550e8400-e29b-41d4-a716-446655440001";

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

describe("listRecordAttachmentsTool", () => {
  it("lists attachments for one CRM record with the explicit client_id filter", async () => {
    const attachments = [
      {
        attachment_id: "a1",
        filename: "report.pdf",
        file_category: "pdf",
        file_size: 2048,
        content_type: "application/pdf",
        created_at: "2026-04-05T00:00:00Z",
      },
    ];
    const { client, builders } = createMockSupabase({
      record_attachments: { data: attachments, error: null },
    });

    const result = await listRecordAttachmentsTool.execute(
      { record_type: "contact", record_id: CONTACT_ID },
      makeContext(client),
    );

    expect(result).toEqual({ success: true, attachments, count: 1 });
    expect(builders.record_attachments.eq).toHaveBeenCalledWith("client_id", CLIENT_ID);
  });
});
