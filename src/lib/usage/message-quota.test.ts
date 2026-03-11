/**
 * Tests for message quota helper wrappers.
 * @module lib/usage/message-quota.test
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import {
  consumeMessageQuota,
  formatMessageQuotaResetDate,
  getMessageQuotaStatus,
  messageQuotaErrorCodes,
} from "./message-quota";

describe("message quota helpers", () => {
  it("maps get_message_quota_status rows into the app shape", async () => {
    const supabase = createMockSupabaseClient({
      rpcResults: {
        get_message_quota_status: {
          data: [{
            client_id: "client-1",
            plan_name: "Pro",
            monthly_message_limit: 500,
            messages_used: 123,
            messages_remaining: 377,
            period_start: "2026-03-01",
            next_reset_date: "2026-04-01",
          }],
          error: null,
        },
      },
    });

    await expect(
      getMessageQuotaStatus(supabase as never, "client-1"),
    ).resolves.toEqual({
      clientId: "client-1",
      planName: "Pro",
      monthlyMessageLimit: 500,
      messagesUsed: 123,
      messagesRemaining: 377,
      periodStart: "2026-03-01",
      nextResetDate: "2026-04-01",
    });
  });

  it("maps consume_message_quota rows and preserves exhausted responses", async () => {
    const supabase = createMockSupabaseClient({
      rpcResults: {
        consume_message_quota: {
          data: [{
            allowed: false,
            client_id: "client-1",
            plan_name: "Free",
            monthly_message_limit: 100,
            messages_used: 100,
            messages_remaining: 0,
            period_start: "2026-03-01",
            next_reset_date: "2026-04-01",
          }],
          error: null,
        },
      },
    });

    await expect(
      consumeMessageQuota(supabase as never, "client-1"),
    ).resolves.toEqual({
      allowed: false,
      clientId: "client-1",
      planName: "Free",
      monthlyMessageLimit: 100,
      messagesUsed: 100,
      messagesRemaining: 0,
      periodStart: "2026-03-01",
      nextResetDate: "2026-04-01",
    });
  });

  it("formats the reset date for Singapore-facing UI copy", () => {
    expect(formatMessageQuotaResetDate("2026-04-01")).toBe("1 Apr 2026");
  });

  it("throws a structured error when the quota rpc fails", async () => {
    const supabase = createMockSupabaseClient({
      rpcResults: {
        consume_message_quota: {
          data: null,
          error: { message: "permission denied" },
        },
      },
    });

    await expect(consumeMessageQuota(supabase as never, "client-1")).rejects.toMatchObject({
      code: messageQuotaErrorCodes.loadFailed,
      message: "permission denied",
    });
  });
});
