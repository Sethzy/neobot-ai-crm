/**
 * Tests for per-user default messaging thread helpers.
 * @module lib/settings/profile/messaging-preferences.test
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetPrimaryThread } = vi.hoisted(() => ({
  mockGetPrimaryThread: vi.fn(),
}));

vi.mock("@/lib/chat/threads", () => ({
  getPrimaryThread: (...args: unknown[]) => mockGetPrimaryThread(...args),
}));

import {
  ensureUserProfile,
  getDefaultMessagingThreadForUser,
  listAvailableMessagingThreads,
  saveDefaultMessagingThreadForUser,
} from "./messaging-preferences";

describe("ensureUserProfile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("returns the existing profile row when one already exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        client_config_id: null,
        created_at: "2026-04-21T00:00:00.000Z",
        default_messaging_thread_id: "thread-1",
        id: "user-1",
        updated_at: "2026-04-21T00:00:00.000Z",
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const profile = await ensureUserProfile({ from } as never, "user-1");

    expect(profile.id).toBe("user-1");
  });

  it("creates the profile row on first access", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T00:00:00.000Z"));

    const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const eq = vi.fn(() => ({ maybeSingle }));
    const selectExisting = vi.fn(() => ({ eq }));
    const single = vi.fn().mockResolvedValue({
      data: {
        client_config_id: null,
        created_at: "2026-04-21T00:00:00.000Z",
        default_messaging_thread_id: null,
        id: "user-1",
        updated_at: "2026-04-21T00:00:00.000Z",
      },
      error: null,
    });
    const selectInserted = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select: selectInserted }));
    const from = vi.fn(() => ({
      insert,
      select: selectExisting,
    }));

    const profile = await ensureUserProfile({ from } as never, "user-1");

    expect(insert).toHaveBeenCalledWith({
      id: "user-1",
      created_at: "2026-04-21T00:00:00.000Z",
      updated_at: "2026-04-21T00:00:00.000Z",
    });
    expect(profile.default_messaging_thread_id).toBeNull();
  });
});

describe("getDefaultMessagingThreadForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the stored profile preference when it exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        client_config_id: null,
        created_at: null,
        default_messaging_thread_id: "thread-preferred",
        id: "user-1",
        updated_at: null,
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));

    const threadId = await getDefaultMessagingThreadForUser({ from } as never, {
      clientId: "client-1",
      userId: "user-1",
    });

    expect(threadId).toBe("thread-preferred");
    expect(mockGetPrimaryThread).not.toHaveBeenCalled();
  });

  it("falls back to the primary thread when no preference is stored", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        client_config_id: null,
        created_at: null,
        default_messaging_thread_id: null,
        id: "user-1",
        updated_at: null,
      },
      error: null,
    });
    const eq = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    mockGetPrimaryThread.mockResolvedValue({ thread_id: "thread-primary" });

    const threadId = await getDefaultMessagingThreadForUser({ from } as never, {
      clientId: "client-1",
      userId: "user-1",
    });

    expect(threadId).toBe("thread-primary");
    expect(mockGetPrimaryThread).toHaveBeenCalledWith({ from }, "client-1");
  });
});

describe("listAvailableMessagingThreads", () => {
  it("returns non-archived threads in UI-friendly shape", async () => {
    const orderUpdated = vi.fn().mockResolvedValue({
      data: [
        { thread_id: "thread-main", title: null, is_primary: true },
        { thread_id: "thread-2", title: "Buyers", is_primary: false },
      ],
      error: null,
    });
    const orderPrimary = vi.fn(() => ({ order: orderUpdated }));
    const eqArchived = vi.fn(() => ({ order: orderPrimary }));
    const eqClient = vi.fn(() => ({ eq: eqArchived }));
    const select = vi.fn(() => ({ eq: eqClient }));
    const from = vi.fn(() => ({ select }));

    const threads = await listAvailableMessagingThreads({ from } as never, "client-1");

    expect(threads).toEqual([
      { isPrimary: true, threadId: "thread-main", title: null },
      { isPrimary: false, threadId: "thread-2", title: "Buyers" },
    ]);
  });
});

describe("saveDefaultMessagingThreadForUser", () => {
  it("upserts the selected thread id into user_profiles", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-21T01:00:00.000Z"));

    const upsert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn(() => ({ upsert }));

    await saveDefaultMessagingThreadForUser({ from } as never, {
      threadId: "thread-2",
      userId: "user-1",
    });

    expect(upsert).toHaveBeenCalledWith({
      id: "user-1",
      default_messaging_thread_id: "thread-2",
      updated_at: "2026-04-21T01:00:00.000Z",
    }, {
      onConflict: "id",
    });
  });
});
