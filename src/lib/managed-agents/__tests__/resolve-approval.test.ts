import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveApprovalById } from "../resolve-approval";

const sessionsEventsSend = vi.fn().mockResolvedValue(undefined);

vi.mock("../anthropic-client", () => ({
  getAnthropicClient: () => ({
    beta: {
      sessions: {
        events: { send: sessionsEventsSend },
      },
    },
  }),
}));

function mockSupabase(
  event:
    | {
        session_id: string | null;
        tool_use_id: string | null;
        thread_id: string;
        client_id: string;
        status: "pending" | "approved" | "denied";
      }
    | null,
) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table !== "approval_events") {
        throw new Error(`Unexpected table: ${table}`);
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: event, error: null }),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: null }),
            }),
          }),
        }),
      };
    }),
  } as never;
}

describe("resolveApprovalById", () => {
  beforeEach(() => {
    sessionsEventsSend.mockClear();
  });

  it("forwards an allow decision to Anthropic and marks the event approved", async () => {
    const supabase = mockSupabase({
      session_id: "session_123",
      tool_use_id: "toolu_abc",
      thread_id: "thread_1",
      client_id: "client_1",
      status: "pending",
    });

    const result = await resolveApprovalById(supabase, {
      clientId: "client_1",
      approvalId: "approval_xyz",
      approved: true,
    });

    expect(result).toEqual({
      success: true,
      status: "updated",
      threadId: "thread_1",
    });
    expect(sessionsEventsSend).toHaveBeenCalledWith("session_123", {
      events: [
        {
          type: "user.tool_confirmation",
          tool_use_id: "toolu_abc",
          result: "allow",
        },
      ],
    });
  });

  it("forwards a deny decision with the default deny_message", async () => {
    const supabase = mockSupabase({
      session_id: "session_123",
      tool_use_id: "toolu_abc",
      thread_id: "thread_1",
      client_id: "client_1",
      status: "pending",
    });

    await resolveApprovalById(supabase, {
      clientId: "client_1",
      approvalId: "approval_xyz",
      approved: false,
    });

    expect(sessionsEventsSend).toHaveBeenCalledWith("session_123", {
      events: [
        {
          type: "user.tool_confirmation",
          tool_use_id: "toolu_abc",
          result: "deny",
          deny_message: "User denied this action.",
        },
      ],
    });
  });

  it("returns missing when approval_id is not found", async () => {
    const result = await resolveApprovalById(mockSupabase(null), {
      clientId: "client_1",
      approvalId: "approval_xyz",
      approved: true,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("missing");
    expect(sessionsEventsSend).not.toHaveBeenCalled();
  });

  it("returns already_resolved without re-sending when status is not pending", async () => {
    const supabase = mockSupabase({
      session_id: "session_123",
      tool_use_id: "toolu_abc",
      thread_id: "thread_1",
      client_id: "client_1",
      status: "approved",
    });

    const result = await resolveApprovalById(supabase, {
      clientId: "client_1",
      approvalId: "approval_xyz",
      approved: true,
    });

    expect(result).toEqual({
      success: true,
      status: "already_resolved",
      threadId: "thread_1",
    });
    expect(sessionsEventsSend).not.toHaveBeenCalled();
  });
});
