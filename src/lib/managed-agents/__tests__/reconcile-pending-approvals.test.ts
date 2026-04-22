/**
 * @module lib/managed-agents/__tests__/reconcile-pending-approvals.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/approvals/queries", () => ({
  createApprovalEvent: vi.fn().mockResolvedValue({ success: true, status: "created" }),
}));

vi.mock("@/lib/chat/messages", () => ({
  upsertMessage: vi.fn().mockResolvedValue({ message_id: "msg_1" }),
}));

vi.mock("@/lib/channels/deliver", () => ({
  deliverToExternalChannels: vi.fn().mockResolvedValue(undefined),
}));

const { createApprovalEvent } = await import("@/lib/approvals/queries");
const { upsertMessage } = await import("@/lib/chat/messages");
const { reconcilePendingApprovals } = await import("../reconcile-pending-approvals");

function makeAnthropic(events: unknown[]) {
  return {
    beta: {
      sessions: {
        events: {
          list: vi.fn().mockResolvedValue({ data: events }),
        },
      },
    },
  } as never;
}

describe("reconcilePendingApprovals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists request_approval rows and the assistant approval message", async () => {
    const result = await reconcilePendingApprovals({
      supabase: {} as never,
      anthropic: makeAnthropic([
        {
          id: "user_1",
          type: "user.message",
          content: [{ type: "text", text: "Delete duplicates" }],
        },
        {
          id: "toolu_request_1",
          type: "agent.custom_tool_use",
          name: "request_approval",
          input: {
            summary: "Delete 3 duplicate contacts",
            action_type: "crm.delete_records",
          },
        },
        {
          id: "idle_1",
          type: "session.status_idle",
          stop_reason: { type: "requires_action" },
        },
      ]),
      run: {
        runId: "run_1",
        threadId: "thread_1",
        clientId: "client_1",
        sessionId: "sess_1",
      },
    });

    expect(result).toEqual({
      reconciled: true,
      reason: "pending approvals reconciled",
    });
    expect(createApprovalEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        approvalId: "toolu_request_1",
        toolName: "request_approval",
      }),
    );
    expect(upsertMessage).toHaveBeenCalledOnce();
  });

  it("returns a no-op when no request_approval event exists", async () => {
    const result = await reconcilePendingApprovals({
      supabase: {} as never,
      anthropic: makeAnthropic([
        {
          id: "user_1",
          type: "user.message",
          content: [{ type: "text", text: "Hello" }],
        },
        {
          id: "idle_1",
          type: "session.status_idle",
          stop_reason: { type: "requires_action" },
        },
      ]),
      run: {
        runId: "run_1",
        threadId: "thread_1",
        clientId: "client_1",
        sessionId: "sess_1",
      },
    });

    expect(result).toEqual({
      reconciled: false,
      reason: "no request_approval event found",
    });
    expect(createApprovalEvent).not.toHaveBeenCalled();
    expect(upsertMessage).not.toHaveBeenCalled();
  });
});
