/**
 * Tests for Telegram/server-side approval continuation.
 * @module lib/approvals/continue-after-approval.test
 */
import { describe, expect, it, vi } from "vitest";

import { resolveAndContinueApproval } from "./continue-after-approval";

vi.mock("@/lib/approvals/queries", () => ({
  resolveApprovalEvent: vi.fn(),
}));

vi.mock("@/lib/runner/run-agent", () => ({
  runAgent: vi.fn().mockResolvedValue({ status: "queued" }),
}));

describe("resolveAndContinueApproval", () => {
  it("resolves approval and triggers a continuation run when approved", async () => {
    const { resolveApprovalEvent } = await import("@/lib/approvals/queries");
    const { runAgent } = await import("@/lib/runner/run-agent");

    vi.mocked(resolveApprovalEvent).mockResolvedValueOnce({
      success: true,
      status: "updated",
      event: { approval_id: "a1", tool_name: "delete_contact" } as never,
    });

    const result = await resolveAndContinueApproval({} as never, {
      clientId: "c1",
      threadId: "t1",
      approvalId: "a1",
      approved: true,
    });

    expect(result).toEqual({ success: true, status: "continued" });
    expect(runAgent).toHaveBeenCalledWith(
      {
        clientId: "c1",
        threadId: "t1",
        triggerType: "chat",
        input: "",
        channel: "telegram",
        consumeMessageQuota: false,
      },
      expect.anything(),
    );
  });

  it("does not trigger a continuation run when approval is denied", async () => {
    const { resolveApprovalEvent } = await import("@/lib/approvals/queries");
    const { runAgent } = await import("@/lib/runner/run-agent");

    vi.mocked(resolveApprovalEvent).mockResolvedValueOnce({
      success: true,
      status: "updated",
      event: { approval_id: "a1" } as never,
    });
    vi.mocked(runAgent).mockClear();

    const result = await resolveAndContinueApproval({} as never, {
      clientId: "c1",
      threadId: "t1",
      approvalId: "a1",
      approved: false,
    });

    expect(result).toEqual({ success: true, status: "continued" });
    expect(runAgent).not.toHaveBeenCalled();
  });

  it("returns failure when the approval cannot be resolved", async () => {
    const { resolveApprovalEvent } = await import("@/lib/approvals/queries");

    vi.mocked(resolveApprovalEvent).mockResolvedValueOnce({
      success: false,
      status: "missing",
      error: "Not found",
    });

    const result = await resolveAndContinueApproval({} as never, {
      clientId: "c1",
      threadId: "t1",
      approvalId: "a1",
      approved: true,
    });

    expect(result).toEqual({ success: false, status: "missing" });
  });

  it("treats already-resolved approvals as idempotent", async () => {
    const { resolveApprovalEvent } = await import("@/lib/approvals/queries");
    const { runAgent } = await import("@/lib/runner/run-agent");

    vi.mocked(resolveApprovalEvent).mockResolvedValueOnce({
      success: true,
      status: "already_resolved",
      event: { status: "approved" } as never,
    });
    vi.mocked(runAgent).mockClear();

    const result = await resolveAndContinueApproval({} as never, {
      clientId: "c1",
      threadId: "t1",
      approvalId: "a1",
      approved: true,
    });

    expect(result).toEqual({ success: true, status: "already_resolved" });
    expect(runAgent).not.toHaveBeenCalled();
  });
});
