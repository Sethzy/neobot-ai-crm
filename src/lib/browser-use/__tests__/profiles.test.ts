/**
 * Tests for Browser-Use profile persistence queries.
 * @module lib/browser-use/__tests__/profiles
 */
import { describe, expect, it } from "vitest";

import { createMockSupabaseClient } from "@/test/mocks/supabase";

import {
  getProfileForPlatform,
  listProfiles,
  upsertProfile,
} from "../profiles";

const BROWSER_PROFILE = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  client_id: "660e8400-e29b-41d4-a716-446655440000",
  platform: "propnex",
  browser_use_profile_id: "profile_123",
  label: "PropNex ProMap",
  created_at: "2026-03-19T00:00:00.000Z",
  updated_at: "2026-03-19T00:00:00.000Z",
} as const;

describe("getProfileForPlatform", () => {
  it("returns the parsed browser profile when present", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [BROWSER_PROFILE], error: null },
    });

    const result = await getProfileForPlatform(
      supabase as never,
      BROWSER_PROFILE.client_id,
      BROWSER_PROFILE.platform,
    );

    expect(result).toEqual(BROWSER_PROFILE);
    expect(supabase.calls.from).toEqual(["browser_profiles"]);
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["client_id", BROWSER_PROFILE.client_id],
    });
    expect(supabase.calls.methods).toContainEqual({
      method: "eq",
      args: ["platform", BROWSER_PROFILE.platform],
    });
    expect(supabase.calls.methods).toContainEqual({ method: "maybeSingle", args: [] });
  });

  it("returns null when the profile is absent", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await expect(
      getProfileForPlatform(supabase as never, BROWSER_PROFILE.client_id, BROWSER_PROFILE.platform),
    ).resolves.toBeNull();
  });

  it("throws when the profile lookup fails", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "db is down" } },
    });

    await expect(
      getProfileForPlatform(supabase as never, BROWSER_PROFILE.client_id, BROWSER_PROFILE.platform),
    ).rejects.toThrow("Failed to load browser profile: db is down");
  });

  it("throws when Supabase returns an invalid browser profile row", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: {
        data: [{ ...BROWSER_PROFILE, browser_use_profile_id: null }],
        error: null,
      },
    });

    await expect(
      getProfileForPlatform(supabase as never, BROWSER_PROFILE.client_id, BROWSER_PROFILE.platform),
    ).rejects.toThrow();
  });
});

describe("upsertProfile", () => {
  it("upserts and returns the parsed profile row", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { data: [BROWSER_PROFILE], error: null },
    });

    const result = await upsertProfile(supabase as never, {
      clientId: BROWSER_PROFILE.client_id,
      platform: BROWSER_PROFILE.platform,
      browserUseProfileId: BROWSER_PROFILE.browser_use_profile_id,
      label: BROWSER_PROFILE.label,
    });

    expect(result).toEqual(BROWSER_PROFILE);
    expect(supabase.calls.from).toEqual(["browser_profiles"]);
    expect(supabase.calls.methods).toContainEqual({
      method: "upsert",
      args: [
        {
          client_id: BROWSER_PROFILE.client_id,
          platform: BROWSER_PROFILE.platform,
          browser_use_profile_id: BROWSER_PROFILE.browser_use_profile_id,
          label: BROWSER_PROFILE.label,
        },
        { onConflict: "client_id,platform" },
      ],
    });
    expect(supabase.calls.methods).toContainEqual({ method: "single", args: [] });
  });

  it("stores a null label when label is omitted", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { data: [{ ...BROWSER_PROFILE, label: null }], error: null },
    });

    await upsertProfile(supabase as never, {
      clientId: BROWSER_PROFILE.client_id,
      platform: BROWSER_PROFILE.platform,
      browserUseProfileId: BROWSER_PROFILE.browser_use_profile_id,
    });

    expect(supabase.calls.methods).toContainEqual({
      method: "upsert",
      args: [
        {
          client_id: BROWSER_PROFILE.client_id,
          platform: BROWSER_PROFILE.platform,
          browser_use_profile_id: BROWSER_PROFILE.browser_use_profile_id,
          label: null,
        },
        { onConflict: "client_id,platform" },
      ],
    });
  });

  it("throws when the upsert fails", async () => {
    const supabase = createMockSupabaseClient({
      insertResult: { data: null, error: { message: "constraint violation" } },
    });

    await expect(
      upsertProfile(supabase as never, {
        clientId: BROWSER_PROFILE.client_id,
        platform: BROWSER_PROFILE.platform,
        browserUseProfileId: BROWSER_PROFILE.browser_use_profile_id,
      }),
    ).rejects.toThrow("Failed to upsert browser profile: constraint violation");
  });
});

describe("listProfiles", () => {
  it("returns parsed browser profiles ordered by created_at", async () => {
    const secondProfile = {
      ...BROWSER_PROFILE,
      id: "770e8400-e29b-41d4-a716-446655440000",
      platform: "ura",
      browser_use_profile_id: "profile_456",
      label: "URA",
    };
    const supabase = createMockSupabaseClient({
      selectResult: { data: [BROWSER_PROFILE, secondProfile], error: null },
    });

    const result = await listProfiles(supabase as never, BROWSER_PROFILE.client_id);

    expect(result).toEqual([BROWSER_PROFILE, secondProfile]);
    expect(supabase.calls.methods).toContainEqual({
      method: "order",
      args: ["created_at", { ascending: true }],
    });
  });

  it("returns an empty array when no profiles exist", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: [], error: null },
    });

    await expect(listProfiles(supabase as never, BROWSER_PROFILE.client_id)).resolves.toEqual([]);
  });

  it("throws when the list query fails", async () => {
    const supabase = createMockSupabaseClient({
      selectResult: { data: null, error: { message: "read failed" } },
    });

    await expect(listProfiles(supabase as never, BROWSER_PROFILE.client_id)).rejects.toThrow(
      "Failed to list browser profiles: read failed",
    );
  });
});
