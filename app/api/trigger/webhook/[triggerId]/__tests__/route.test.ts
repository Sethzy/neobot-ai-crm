/**
 * Tests for the public webhook trigger route.
 * @module app/api/trigger/webhook/[triggerId]/__tests__/route
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { signWebhookBody } from "@/lib/triggers/webhook-auth";

const {
  mockAfter,
  mockCheckRateLimit,
  mockCreateAdminClient,
  mockClaimWebhookTrigger,
  mockExecuteTrigger,
} = vi.hoisted(() => ({
  mockAfter: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockCreateAdminClient: vi.fn(),
  mockClaimWebhookTrigger: vi.fn(),
  mockExecuteTrigger: vi.fn(),
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

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

vi.mock("@/lib/triggers/webhook-claim", () => ({
  claimWebhookTrigger: mockClaimWebhookTrigger,
}));

vi.mock("@/lib/triggers/executor", () => ({
  executeTrigger: mockExecuteTrigger,
}));

function createMockSupabase(triggerOverride?: Record<string, unknown> | null) {
  const selectChain = {
    select: vi.fn(() => selectChain),
    eq: vi.fn(() => selectChain),
    single: vi.fn().mockResolvedValue({
      data: triggerOverride,
      error: triggerOverride ? null : { message: "Not found" },
    }),
  };

  return {
    from: vi.fn((table: string) => {
      if (table === "agent_triggers") {
        return selectChain;
      }

      throw new Error(`Unexpected table: ${table}`);
    }),
    selectChain,
  };
}

describe("POST /api/trigger/webhook/[triggerId]", () => {
  const triggerRow = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    client_id: "660e8400-e29b-41d4-a716-446655440000",
    thread_id: "770e8400-e29b-41d4-a716-446655440000",
    trigger_type: "webhook",
    name: "Inbound leads",
    instruction_path: "state/triggers/inbound-leads.md",
    invocation_message: "Review the inbound lead and triage it",
    webhook_secret: "super-secret",
    enabled: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockResolvedValue({ allowed: true, retryAfter: null });
    mockAfter.mockImplementation(async (callback: () => Promise<void> | void) => {
      await callback();
    });
    mockCreateAdminClient.mockResolvedValue(createMockSupabase(triggerRow));
    mockClaimWebhookTrigger.mockResolvedValue({
      currentRunId: "880e8400-e29b-41d4-a716-446655440000",
    });
    mockExecuteTrigger.mockResolvedValue({ status: "completed" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 404 when the webhook trigger does not exist", async () => {
    mockCreateAdminClient.mockResolvedValue(createMockSupabase(null));
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/trigger/webhook/unknown", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ triggerId: "550e8400-e29b-41d4-a716-446655440000" }),
      },
    );

    expect(response.status).toBe(404);
  });

  it("returns 401 when the webhook signature is invalid", async () => {
    const { POST } = await import("../route");

    const response = await POST(
      new Request("http://localhost/api/trigger/webhook/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sunder-signature": "sha256=deadbeef",
        },
        body: JSON.stringify({ lead: "Alice" }),
      }),
      {
        params: Promise.resolve({ triggerId: triggerRow.id }),
      },
    );

    expect(response.status).toBe(401);
    expect(mockClaimWebhookTrigger).not.toHaveBeenCalled();
    expect(mockExecuteTrigger).not.toHaveBeenCalled();
  });

  it("returns 409 when the webhook trigger is already being processed", async () => {
    mockClaimWebhookTrigger.mockResolvedValueOnce(null);
    const { POST } = await import("../route");
    const body = JSON.stringify({ lead: "Alice" });

    const response = await POST(
      new Request("http://localhost/api/trigger/webhook/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sunder-signature": `sha256=${signWebhookBody(triggerRow.webhook_secret, body)}`,
        },
        body,
      }),
      {
        params: Promise.resolve({ triggerId: triggerRow.id }),
      },
    );

    expect(response.status).toBe(409);
    expect(mockExecuteTrigger).not.toHaveBeenCalled();
  });

  it("accepts a valid webhook, claims it, and runs execution in after()", async () => {
    const { POST } = await import("../route");
    const body = JSON.stringify({
      lead: "Alice",
      source: "PropertyGuru",
    });

    const response = await POST(
      new Request("http://localhost/api/trigger/webhook/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sunder-signature": signWebhookBody(triggerRow.webhook_secret, body),
        },
        body,
      }),
      {
        params: Promise.resolve({ triggerId: triggerRow.id }),
      },
    );

    expect(response.status).toBe(202);
    expect(mockClaimWebhookTrigger).toHaveBeenCalledWith(
      expect.anything(),
      triggerRow.id,
    );
    expect(mockAfter).toHaveBeenCalledTimes(1);
    expect(mockExecuteTrigger).toHaveBeenCalledWith({
      supabase: expect.anything(),
      payload: {
        triggerId: triggerRow.id,
        clientId: triggerRow.client_id,
        threadId: triggerRow.thread_id,
        currentRunId: "880e8400-e29b-41d4-a716-446655440000",
        triggerType: "webhook",
        triggerName: triggerRow.name,
        instructionPath: triggerRow.instruction_path,
        invocationMessage: triggerRow.invocation_message,
        triggerPayload: {
          lead: "Alice",
          source: "PropertyGuru",
        },
      },
    });
  });
});
