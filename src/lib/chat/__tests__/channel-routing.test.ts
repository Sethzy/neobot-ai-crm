/**
 * Tests for channel mapping and inbound idempotency data access.
 * @module lib/chat/__tests__/channel-routing
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import {
  getThreadIdForExternalConversation,
  recordInboundDelivery,
  upsertExternalConversationThreadMap,
} from "../channel-routing";

function findMethodCall(
  client: ReturnType<typeof createMockSupabaseClient>,
  method: string,
): { method: string; args: unknown[] } | undefined {
  return client.calls.methods.find((call) => call.method === method);
}

describe("getThreadIdForExternalConversation", () => {
  it("returns mapped thread id when mapping exists", async () => {
    const client = createMockSupabaseClient({
      selectResult: {
        data: [{ thread_id: "thread-1" }],
        error: null,
      },
    });

    await expect(
      getThreadIdForExternalConversation(client as never, {
        clientId: "client-1",
        channel: "telegram",
        externalConversationId: "tg-1",
      }),
    ).resolves.toBe("thread-1");
    expect(client.calls.from).toContain("conversation_channel_mappings");
  });

  it("throws on lookup errors", async () => {
    const client = createMockSupabaseClient({
      selectResult: {
        data: null,
        error: { message: "RLS violation" },
      },
    });

    await expect(
      getThreadIdForExternalConversation(client as never, {
        clientId: "client-1",
        channel: "telegram",
        externalConversationId: "tg-1",
      }),
    ).rejects.toThrow("Failed to resolve channel mapping: RLS violation");
  });
});

describe("upsertExternalConversationThreadMap", () => {
  it("inserts a new mapping when none exists", async () => {
    const client = createMockSupabaseClient({
      selectResult: {
        data: [],
        error: null,
      },
      insertResult: {
        data: [],
        error: null,
      },
    });

    await expect(
      upsertExternalConversationThreadMap(client as never, {
        clientId: "client-1",
        channel: "web",
        externalConversationId: "external-1",
        threadId: "thread-1",
      }),
    ).resolves.toBeUndefined();
    expect(findMethodCall(client, "insert")?.args[0]).toEqual({
      client_id: "client-1",
      channel: "web",
      external_conversation_id: "external-1",
      thread_id: "thread-1",
    });
  });

  it("updates existing mapping when thread id changes", async () => {
    const client = createMockSupabaseClient({
      selectResult: {
        data: [{ mapping_id: "mapping-1", thread_id: "thread-old" }],
        error: null,
      },
      updateResult: {
        data: [],
        error: null,
      },
    });

    await expect(
      upsertExternalConversationThreadMap(client as never, {
        clientId: "client-1",
        channel: "web",
        externalConversationId: "external-1",
        threadId: "thread-new",
      }),
    ).resolves.toBeUndefined();
    expect(findMethodCall(client, "update")?.args[0]).toEqual({
      thread_id: "thread-new",
    });
    expect(
      client.calls.methods.some(
        (call) => call.method === "eq" &&
          call.args[0] === "mapping_id" &&
          call.args[1] === "mapping-1",
      ),
    ).toBe(true);
  });
});

describe("recordInboundDelivery", () => {
  it("returns true for a fresh delivery insert", async () => {
    const client = createMockSupabaseClient({
      insertResult: {
        data: [],
        error: null,
      },
    });

    await expect(
      recordInboundDelivery(client as never, {
        clientId: "client-1",
        channel: "telegram",
        deliveryId: "delivery-1",
        threadId: "thread-1",
      }),
    ).resolves.toBe(true);
  });

  it("returns false for duplicate delivery unique violations", async () => {
    const client = createMockSupabaseClient({
      insertResult: {
        data: null,
        error: { message: "duplicate key", code: "23505" },
      },
    });

    await expect(
      recordInboundDelivery(client as never, {
        clientId: "client-1",
        channel: "telegram",
        deliveryId: "delivery-1",
        threadId: "thread-1",
      }),
    ).resolves.toBe(false);
  });

  it("throws non-duplicate insert failures", async () => {
    const client = createMockSupabaseClient({
      insertResult: {
        data: null,
        error: { message: "permission denied", code: "42501" },
      },
    });

    await expect(
      recordInboundDelivery(client as never, {
        clientId: "client-1",
        channel: "telegram",
        deliveryId: "delivery-1",
        threadId: "thread-1",
      }),
    ).rejects.toThrow("Failed to record inbound delivery: permission denied");
  });
});
