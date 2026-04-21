/**
 * Tests for user-scoped Telegram connection persistence helpers.
 * @module lib/channels/telegram/user-connections.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearTelegramPairingSessionsForUser,
  createTelegramPairingSession,
  deleteTelegramChannelMapping,
  findTelegramPairingSession,
  getTelegramConnectionForUser,
  getTelegramReadiness,
  markTelegramPairingSessionConsumed,
  upsertTelegramChannelMapping,
  upsertTelegramConnection,
  updateTelegramConnectionTargetThread,
} from "./user-connections";

describe("getTelegramReadiness", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("reports missing env vars before Telegram is configured", () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;

    expect(getTelegramReadiness()).toEqual({
      isConfigured: false,
      missingVariables: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET"],
    });
  });

  it("reports configured when both required env vars exist", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:ABC";
    process.env.TELEGRAM_WEBHOOK_SECRET = "secret";

    expect(getTelegramReadiness()).toEqual({
      isConfigured: true,
      missingVariables: [],
    });
  });
});

describe("Telegram connection helpers", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("loads the current user's Telegram connection", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        client_id: "client-1",
        external_conversation_id: "12345",
        target_thread_id: "thread-1",
        user_id: "user-1",
      },
      error: null,
    });
    const eqUser = vi.fn(() => ({ maybeSingle }));
    const eqChannel = vi.fn(() => ({ eq: eqUser }));
    const select = vi.fn(() => ({ eq: eqChannel }));
    const from = vi.fn(() => ({ select }));

    const connection = await getTelegramConnectionForUser({ from } as never, "user-1");

    expect(from).toHaveBeenCalledWith("messaging_channel_connections");
    expect(eqChannel).toHaveBeenCalledWith("channel", "telegram");
    expect(eqUser).toHaveBeenCalledWith("user_id", "user-1");
    expect(connection).toEqual({
      clientId: "client-1",
      externalConversationId: "12345",
      targetThreadId: "thread-1",
      userId: "user-1",
    });
  });

  it("upserts a user-owned Telegram connection keyed by user and channel", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        client_id: "client-1",
        external_conversation_id: "12345",
        target_thread_id: "thread-2",
        user_id: "user-1",
      },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const upsert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ upsert }));

    const connection = await upsertTelegramConnection({ from } as never, {
      clientId: "client-1",
      externalConversationId: "12345",
      targetThreadId: "thread-2",
      userId: "user-1",
    });

    expect(upsert).toHaveBeenCalledWith({
      user_id: "user-1",
      client_id: "client-1",
      channel: "telegram",
      external_conversation_id: "12345",
      target_thread_id: "thread-2",
    }, {
      onConflict: "user_id,channel",
    });
    expect(connection?.targetThreadId).toBe("thread-2");
  });

  it("updates the target thread for the current user's Telegram connection", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        client_id: "client-1",
        external_conversation_id: "12345",
        target_thread_id: "thread-9",
        user_id: "user-1",
      },
      error: null,
    });
    const select = vi.fn(() => ({ maybeSingle }));
    const eqUser = vi.fn(() => ({ select }));
    const eqChannel = vi.fn(() => ({ eq: eqUser }));
    const update = vi.fn(() => ({ eq: eqChannel }));
    const from = vi.fn(() => ({ update }));

    const connection = await updateTelegramConnectionTargetThread({ from } as never, {
      targetThreadId: "thread-9",
      userId: "user-1",
    });

    expect(update).toHaveBeenCalledWith({ target_thread_id: "thread-9" });
    expect(connection?.targetThreadId).toBe("thread-9");
  });

  it("upserts the legacy routing table by global Telegram chat id", async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));

    await upsertTelegramChannelMapping({ from } as never, {
      chatId: "12345",
      clientId: "client-1",
      threadId: "thread-1",
    });

    expect(upsert).toHaveBeenCalledWith({
      client_id: "client-1",
      channel: "telegram",
      external_conversation_id: "12345",
      thread_id: "thread-1",
    }, {
      onConflict: "channel,external_conversation_id",
    });
  });

  it("deletes the legacy routing row by Telegram chat id", async () => {
    const eqChat = vi.fn().mockResolvedValue({ error: null });
    const eqChannel = vi.fn(() => ({ eq: eqChat }));
    const deleteRow = vi.fn(() => ({ eq: eqChannel }));
    const from = vi.fn(() => ({ delete: deleteRow }));

    await deleteTelegramChannelMapping({ from } as never, { chatId: "12345" });

    expect(eqChannel).toHaveBeenCalledWith("channel", "telegram");
    expect(eqChat).toHaveBeenCalledWith("external_conversation_id", "12345");
  });
});

describe("Telegram pairing session helpers", () => {
  it("deletes stale pairing sessions for the user before issuing a new one", async () => {
    const eqUser = vi.fn().mockResolvedValue({ error: null });
    const deleteRow = vi.fn(() => ({ eq: eqUser }));
    const from = vi.fn(() => ({ delete: deleteRow }));

    await clearTelegramPairingSessionsForUser({ from } as never, "user-1");

    expect(eqUser).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("creates a new pairing session with both token types", async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        client_id: "client-1",
        consumed_at: null,
        created_at: "2026-04-21T00:00:00.000Z",
        deep_link_token: "deep-token",
        display_code: "GW-22E14A",
        expires_at: "2026-04-21T00:10:00.000Z",
        id: "session-1",
        target_thread_id: "thread-1",
        user_id: "user-1",
      },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    const from = vi.fn(() => ({ insert }));

    const session = await createTelegramPairingSession({ from } as never, {
      clientId: "client-1",
      deepLinkToken: "deep-token",
      displayCode: "GW-22E14A",
      expiresAt: "2026-04-21T00:10:00.000Z",
      targetThreadId: "thread-1",
      userId: "user-1",
    });

    expect(insert).toHaveBeenCalledWith({
      user_id: "user-1",
      client_id: "client-1",
      target_thread_id: "thread-1",
      deep_link_token: "deep-token",
      display_code: "GW-22E14A",
      expires_at: "2026-04-21T00:10:00.000Z",
    });
    expect(session.displayCode).toBe("GW-22E14A");
  });

  it("looks up manual codes via display_code instead of deep_link_token", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await findTelegramPairingSession({ from } as never, "gw-22e14a");

    expect(eq).toHaveBeenCalledWith("display_code", "GW-22E14A");
  });

  it("looks up deep-link payloads via deep_link_token", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    await findTelegramPairingSession({ from } as never, "pair-token-123");

    expect(eq).toHaveBeenCalledWith("deep_link_token", "pair-token-123");
  });

  it("marks a pairing session consumed with the current timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T00:05:00.000Z"));

    const eq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));

    await markTelegramPairingSessionConsumed({ from } as never, "session-1");

    expect(update).toHaveBeenCalledWith({
      consumed_at: "2026-04-21T00:05:00.000Z",
    });
    expect(eq).toHaveBeenCalledWith("id", "session-1");
  });
});
