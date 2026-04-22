/**
 * @module app/api/webhook/anthropic/__tests__/route.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAfter,
  mockCreateAdminClient,
  mockGetAnthropicClient,
  mockRecoverOrphanedRun,
  mockReconcilePendingApprovals,
  mockVerifyWebhookSignature,
} = vi.hoisted(() => ({
  mockAfter: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockGetAnthropicClient: vi.fn(),
  mockRecoverOrphanedRun: vi.fn(),
  mockReconcilePendingApprovals: vi.fn(),
  mockVerifyWebhookSignature: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: mockAfter,
  };
});

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock("@/lib/managed-agents/anthropic-client", () => ({
  getAnthropicClient: mockGetAnthropicClient,
}));

vi.mock("@/lib/managed-agents/recover-orphaned-run", () => ({
  recoverOrphanedRun: mockRecoverOrphanedRun,
}));

vi.mock("@/lib/managed-agents/reconcile-pending-approvals", () => ({
  reconcilePendingApprovals: mockReconcilePendingApprovals,
}));

vi.mock("@/lib/managed-agents/webhook-verify", () => ({
  verifyWebhookSignature: mockVerifyWebhookSignature,
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({
    ANTHROPIC_WEBHOOK_SECRET: "whsec_test",
  }),
}));

import { POST } from "../route";

function createSupabase(runRow: Record<string, unknown> | null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: runRow, error: null }),
              })),
            })),
          })),
        })),
      })),
    })),
  } as never;
}

function webhookRequest(stopReasonType: string) {
  return new Request("http://localhost/api/webhook/anthropic", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "webhook-id": "wh_1",
      "webhook-timestamp": "123",
      "webhook-signature": "sig",
    },
    body: JSON.stringify({
      type: "session.status_idled",
      data: {
        session_id: "sess_1",
        stop_reason: { type: stopReasonType },
      },
    }),
  });
}

describe("POST /api/webhook/anthropic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAfter.mockImplementation(async (callback: () => Promise<void> | void) => {
      await callback();
    });
    mockVerifyWebhookSignature.mockReturnValue(true);
    mockGetAnthropicClient.mockReturnValue({ beta: {} });
    mockRecoverOrphanedRun.mockResolvedValue({
      recovered: true,
      reason: "full recovery completed",
    });
    mockReconcilePendingApprovals.mockResolvedValue({
      reconciled: true,
      reason: "pending approvals reconciled",
    });
  });

  it("reconciles pending approvals on requires_action", async () => {
    mockCreateAdminClient.mockResolvedValue(
      createSupabase({
        run_id: "run_1",
        thread_id: "thread_1",
        client_id: "client_1",
        status: "running",
        model: "claude-haiku-4-5",
      }),
    );

    const response = await POST(webhookRequest("requires_action"));

    expect(response.status).toBe(200);
    expect(mockReconcilePendingApprovals).toHaveBeenCalledWith(
      expect.objectContaining({
        run: expect.objectContaining({
          runId: "run_1",
          sessionId: "sess_1",
        }),
      }),
    );
    expect(mockRecoverOrphanedRun).not.toHaveBeenCalled();
  });

  it("recovers orphaned runs on end_turn", async () => {
    mockCreateAdminClient.mockResolvedValue(
      createSupabase({
        run_id: "run_1",
        thread_id: "thread_1",
        client_id: "client_1",
        status: "running",
        model: "claude-haiku-4-5",
      }),
    );

    const response = await POST(webhookRequest("end_turn"));

    expect(response.status).toBe(200);
    expect(mockRecoverOrphanedRun).toHaveBeenCalledWith(
      expect.objectContaining({
        stopReasonType: "end_turn",
      }),
    );
    expect(mockReconcilePendingApprovals).not.toHaveBeenCalled();
  });
});
