/**
 * Tests for Sprite session persistence helpers.
 * @module lib/sandbox/__tests__/sprite-session
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  findActiveSpriteSession,
  markSpriteDestroyed,
  touchSpriteSession,
  upsertSpriteSession,
} from "../sprite-session";

function createMockSupabase() {
  const mockMaybeSingle = vi.fn();
  const mockSingle = vi.fn();
  const mockSelectAfterUpsert = vi.fn(() => ({ single: mockSingle }));
  const mockNeq = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
  const mockEqForSelect = vi.fn(() => ({ neq: mockNeq }));
  const mockSelect = vi.fn(() => ({ eq: mockEqForSelect }));
  const mockUpsert = vi.fn(() => ({ select: mockSelectAfterUpsert }));
  const mockEqForUpdate = vi.fn().mockResolvedValue({ error: null });
  const mockUpdate = vi.fn(() => ({ eq: mockEqForUpdate }));
  const mockFrom = vi.fn(() => ({
    select: mockSelect,
    upsert: mockUpsert,
    update: mockUpdate,
  }));

  return {
    client: { from: mockFrom } as unknown,
    mockFrom,
    mockSelect,
    mockEqForSelect,
    mockNeq,
    mockMaybeSingle,
    mockUpsert,
    mockSelectAfterUpsert,
    mockSingle,
    mockUpdate,
    mockEqForUpdate,
  };
}

describe("sprite-session helpers", () => {
  let supabase: ReturnType<typeof createMockSupabase>;

  beforeEach(() => {
    vi.clearAllMocks();
    supabase = createMockSupabase();
  });

  it("returns the active sprite session for a thread", async () => {
    supabase.mockMaybeSingle.mockResolvedValue({
      data: {
        id: "session-1",
        client_id: "client-1",
        thread_id: "thread-1",
        sprite_name: "thread-thread-1",
        status: "sleeping",
        preview_url: null,
        created_at: "2026-03-24T00:00:00.000Z",
        last_active_at: "2026-03-24T00:05:00.000Z",
        destroyed_at: null,
      },
      error: null,
    });

    const result = await findActiveSpriteSession(supabase.client as never, "thread-1");

    expect(result?.sprite_name).toBe("thread-thread-1");
    expect(supabase.mockFrom).toHaveBeenCalledWith("sprite_sessions");
    expect(supabase.mockEqForSelect).toHaveBeenCalledWith("thread_id", "thread-1");
    expect(supabase.mockNeq).toHaveBeenCalledWith("status", "destroyed");
  });

  it("returns null when no active sprite session exists", async () => {
    supabase.mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    await expect(
      findActiveSpriteSession(supabase.client as never, "thread-1"),
    ).resolves.toBeNull();
  });

  it("upserts a thread-scoped sprite session and returns the stored row", async () => {
    supabase.mockSingle.mockResolvedValue({
      data: {
        id: "session-1",
        client_id: "client-1",
        thread_id: "thread-1",
        sprite_name: "thread-thread-1",
        status: "running",
        preview_url: "https://preview.example.com",
        created_at: "2026-03-24T00:00:00.000Z",
        last_active_at: "2026-03-24T00:05:00.000Z",
        destroyed_at: null,
      },
      error: null,
    });

    const result = await upsertSpriteSession(supabase.client as never, {
      client_id: "client-1",
      thread_id: "thread-1",
      sprite_name: "thread-thread-1",
      status: "running",
      preview_url: "https://preview.example.com",
    });

    expect(result?.preview_url).toBe("https://preview.example.com");
    expect(supabase.mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "client-1",
        thread_id: "thread-1",
        sprite_name: "thread-thread-1",
        status: "running",
        preview_url: "https://preview.example.com",
      }),
      { onConflict: "thread_id" },
    );
  });

  it("touches the sprite session by sprite name", async () => {
    await touchSpriteSession(supabase.client as never, "thread-thread-1");

    expect(supabase.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        last_active_at: expect.any(String),
      }),
    );
    expect(supabase.mockEqForUpdate).toHaveBeenCalledWith(
      "sprite_name",
      "thread-thread-1",
    );
  });

  it("marks the sprite session destroyed by sprite name", async () => {
    await markSpriteDestroyed(supabase.client as never, "thread-thread-1");

    expect(supabase.mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "destroyed",
        destroyed_at: expect.any(String),
      }),
    );
    expect(supabase.mockEqForUpdate).toHaveBeenCalledWith(
      "sprite_name",
      "thread-thread-1",
    );
  });
});
