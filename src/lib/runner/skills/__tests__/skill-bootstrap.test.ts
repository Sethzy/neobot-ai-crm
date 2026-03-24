/**
 * Tests for bundled instruction skill bootstrapping.
 * @module lib/runner/skills/__tests__/skill-bootstrap
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { _resetSkillBootstrapCache, bootstrapSkills } from "../skill-bootstrap";

function createMockSupabase({
  listData = [] as Array<{ name: string; id?: string | null }>,
  listError = null as { message: string } | null,
  uploadError = null as { message: string; statusCode?: string } | null,
}: {
  listData?: Array<{ name: string; id?: string | null }>;
  listError?: { message: string } | null;
  uploadError?: { message: string; statusCode?: string } | null;
} = {}) {
  const uploadedFiles: string[] = [];

  return {
    client: {
      storage: {
        from: () => ({
          list: vi.fn(async () => ({
            data: listData.map((entry) => ({
              id: null,
              ...entry,
            })),
            error: listError,
          })),
          upload: vi.fn(async (path: string) => {
            uploadedFiles.push(path);
            return { error: uploadError };
          }),
        }),
      },
    } as unknown as SupabaseClient,
    uploadedFiles,
  };
}

describe("bootstrapSkills", () => {
  beforeEach(() => {
    _resetSkillBootstrapCache();
  });

  it("seeds bundled defaults when the skills directory is empty", async () => {
    const { client, uploadedFiles } = createMockSupabase();

    await bootstrapSkills(client, "client-1");

    expect(uploadedFiles.filter((path) => path.endsWith("SKILL.md"))).toHaveLength(13);
    expect(uploadedFiles.some((path) => path.includes("call-prep"))).toBe(true);
    expect(uploadedFiles.some((path) => path.includes("daily-briefing"))).toBe(true);
    // Inner skills also seed reference files
    expect(uploadedFiles.some((path) => path.includes("re-analyst/references/sg-property-taxes.md"))).toBe(true);
    expect(uploadedFiles.some((path) => path.includes("re-analyst/references/yield-benchmarks.md"))).toBe(true);
  });

  it("skips skill slugs that already exist", async () => {
    const { client, uploadedFiles } = createMockSupabase({
      listData: [{ name: "call-prep" }, { name: "daily-briefing" }],
    });

    await bootstrapSkills(client, "client-1");

    expect(uploadedFiles.filter((path) => path.includes("call-prep"))).toHaveLength(0);
    expect(uploadedFiles.filter((path) => path.includes("daily-briefing"))).toHaveLength(0);
    expect(uploadedFiles.filter((path) => path.endsWith("SKILL.md"))).toHaveLength(11);
  });

  it("is idempotent via the process cache", async () => {
    let listCallCount = 0;
    const supabase = {
      storage: {
        from: () => ({
          list: vi.fn(async () => {
            listCallCount++;
            return { data: [{ name: "call-prep", id: null }], error: null };
          }),
          upload: vi.fn(async () => ({ error: null })),
        }),
      },
    } as unknown as SupabaseClient;

    await bootstrapSkills(supabase, "client-1");
    await bootstrapSkills(supabase, "client-1");

    expect(listCallCount).toBe(1);
  });

  it("tolerates upload conflicts", async () => {
    const { client } = createMockSupabase({
      uploadError: { message: "Duplicate", statusCode: "409" },
    });

    await expect(bootstrapSkills(client, "client-1")).resolves.toBeUndefined();
  });

  it("throws on non-conflict storage errors", async () => {
    const { client } = createMockSupabase({
      uploadError: { message: "Storage unavailable" },
    });

    await expect(bootstrapSkills(client, "client-1")).rejects.toThrow("Storage unavailable");
  });

  it("does not cache the client when bootstrapping fails", async () => {
    let listCallCount = 0;
    const supabase = {
      storage: {
        from: () => ({
          list: vi.fn(async () => {
            listCallCount++;
            return { data: [], error: null };
          }),
          upload: vi.fn(async () => ({
            error: { message: "Storage down" },
          })),
        }),
      },
    } as unknown as SupabaseClient;

    await expect(bootstrapSkills(supabase, "client-1")).rejects.toThrow("Storage down");
    await expect(bootstrapSkills(supabase, "client-1")).rejects.toThrow("Storage down");

    expect(listCallCount).toBe(2);
  });

  it("does not let files at the skills root shadow bundled defaults", async () => {
    const { client, uploadedFiles } = createMockSupabase({
      listData: [
        { name: "call-prep", id: "file-1" },
        { name: "daily-briefing", id: null },
      ],
    });

    await bootstrapSkills(client, "client-1");

    expect(uploadedFiles.filter((path) => path.includes("call-prep"))).toHaveLength(1);
    expect(uploadedFiles.filter((path) => path.includes("daily-briefing"))).toHaveLength(0);
  });
});
