/**
 * Tests for fork-metadata helpers.
 *
 * @module lib/runner/skills/__tests__/fork-metadata.test
 */
import { describe, expect, it, vi } from "vitest";

import {
  forkMetadataPath,
  readForkMetadata,
  type ForkMetadata,
  writeForkMetadata,
} from "../fork-metadata";

function makeStorageMock(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));

  return {
    store,
    from: vi.fn((_bucket: string) => ({
      download: vi.fn(async (storagePath: string) => {
        const value = store.get(storagePath);

        if (!value) {
          return { data: null, error: { message: "object not found", status: 404 } };
        }

        return {
          data: {
            text: async () => value,
          },
          error: null,
        };
      }),
      upload: vi.fn(async (storagePath: string, content: string | Blob) => {
        const text = typeof content === "string" ? content : await content.text();
        store.set(storagePath, text);
        return { data: { path: storagePath }, error: null };
      }),
      remove: vi.fn(async (paths: string[]) => {
        for (const storagePath of paths) {
          store.delete(storagePath);
        }
        return { data: null, error: null };
      }),
    })),
  };
}

describe("forkMetadataPath", () => {
  it("returns the client-scoped fork sidecar path", () => {
    expect(forkMetadataPath("client-1", "call-prep")).toBe(
      "client-1/skills/call-prep/_fork.json",
    );
  });
});

describe("readForkMetadata", () => {
  it("returns null when the sidecar does not exist", async () => {
    const supabase = { storage: makeStorageMock() } as never;

    const result = await readForkMetadata(supabase, "client-1", "call-prep");

    expect(result).toBeNull();
  });

  it("parses a valid sidecar", async () => {
    const supabase = {
      storage: makeStorageMock({
        "client-1/skills/call-prep/_fork.json": JSON.stringify({
          forkedFromVersion: "v-123",
          forkedAt: "2026-04-12T00:00:00.000Z",
        }),
      }),
    } as never;

    const result = await readForkMetadata(supabase, "client-1", "call-prep");

    expect(result).toEqual({
      forkedFromVersion: "v-123",
      forkedAt: "2026-04-12T00:00:00.000Z",
    });
  });
});

describe("writeForkMetadata", () => {
  it("writes a JSON sidecar at the correct path", async () => {
    const storage = makeStorageMock();
    const supabase = { storage } as never;
    const metadata: ForkMetadata = {
      forkedFromVersion: "v-456",
      forkedAt: "2026-04-12T00:00:00.000Z",
    };

    await writeForkMetadata(supabase, "client-1", "call-prep", metadata);

    expect(storage.store.get("client-1/skills/call-prep/_fork.json")).toBe(
      JSON.stringify(metadata, null, 2),
    );
  });
});
