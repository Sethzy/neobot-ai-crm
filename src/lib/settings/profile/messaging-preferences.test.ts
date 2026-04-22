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

    await ensureUserProfile({ from } as never, "user-1");

    expect(insert).toHaveBeenCalledWith({
      id: "user-1",
      created_at: "2026-04-21T00:00:00.000Z",
      updated_at: "2026-04-21T00:00:00.000Z",
    });
  });
});

describe("getDefaultMessagingThreadForUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("always resolves the primary thread when the profile row exists", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        client_config_id: null,
        created_at: null,
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

    mockGetPrimaryThread.mockResolvedValue({ thread_id: "thread-primary" });

    expect(threadId).toBe("thread-primary");
    expect(mockGetPrimaryThread).toHaveBeenCalledWith({ from }, "client-1");
  });
});
