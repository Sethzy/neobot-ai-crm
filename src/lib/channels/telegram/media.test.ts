/**
 * Tests for Telegram media helper functions.
 * @module lib/channels/telegram/media.test
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Api } from "grammy";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/types/database";

import { downloadAndStoreTelegramFile, getMediaFallbacks, resolveFileId } from "./media";

describe("resolveFileId", () => {
  it("picks the largest photo file id", () => {
    const result = resolveFileId("photo", {
      photo: [
        { file_id: "small", file_unique_id: "small-1", width: 100, height: 100 },
        { file_id: "large", file_unique_id: "large-1", width: 800, height: 800 },
      ],
    });

    expect(result).toBe("large");
  });

  it("extracts voice file ids", () => {
    expect(resolveFileId("voice", { voice: { file_id: "voice-123", duration: 5 } })).toBe(
      "voice-123",
    );
  });

  it("extracts document file ids", () => {
    expect(
      resolveFileId("document", {
        document: { file_id: "doc-123", file_name: "test.pdf" },
      }),
    ).toBe("doc-123");
  });

  it("returns null when the requested media type is absent", () => {
    expect(resolveFileId("photo", {})).toBeNull();
  });
});

describe("getMediaFallbacks", () => {
  it("returns jpg/jpeg for photos", () => {
    expect(getMediaFallbacks("photo")).toEqual({ ext: "jpg", mime: "image/jpeg" });
  });

  it("returns ogg/audio-ogg for voice notes", () => {
    expect(getMediaFallbacks("voice")).toEqual({ ext: "ogg", mime: "audio/ogg" });
  });

  it("returns binary defaults for unknown media types", () => {
    expect(getMediaFallbacks("unknown")).toEqual({
      ext: "bin",
      mime: "application/octet-stream",
    });
  });
});

describe("downloadAndStoreTelegramFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_000);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "Content-Type": "image/jpeg" },
    })));
  });

  it("uploads Telegram media to agent-files/uploads/telegram and returns storagePath", async () => {
    const mockUpload = vi.fn().mockResolvedValue({ data: { path: "ok" }, error: null });
    const mockCreateSignedUrl = vi.fn().mockResolvedValue({
      data: {
        signedUrl: "https://storage.example.com/agent-files/client-1/uploads/telegram/1700000000000_unique-file.jpg?token=signed",
      },
      error: null,
    });
    const mockFrom = vi.fn(() => ({
      upload: mockUpload,
      createSignedUrl: mockCreateSignedUrl,
    }));
    const supabase = {
      storage: {
        from: mockFrom,
      },
    } as unknown as SupabaseClient<Database>;
    const api = {
      token: "telegram-token",
      getFile: vi.fn().mockResolvedValue({
        file_path: "photos/file_10.jpg",
        file_unique_id: "unique-file",
      }),
    } as unknown as Pick<Api, "token" | "getFile"> as Api;

    const result = await downloadAndStoreTelegramFile(
      api,
      supabase,
      "client-1",
      "file-123",
      "jpg",
      "image/jpeg",
    );

    expect(mockFrom).toHaveBeenCalledWith("agent-files");
    expect(mockUpload).toHaveBeenCalledWith(
      "client-1/uploads/telegram/1700000000000_unique-file.jpg",
      expect.any(Buffer),
      { contentType: "image/jpeg" },
    );
    expect(mockCreateSignedUrl).toHaveBeenCalledWith(
      "client-1/uploads/telegram/1700000000000_unique-file.jpg",
      3600,
    );
    expect(result).toEqual({
      url: "https://storage.example.com/agent-files/client-1/uploads/telegram/1700000000000_unique-file.jpg?token=signed",
      mimeType: "image/jpeg",
      storagePath: "uploads/telegram/1700000000000_unique-file.jpg",
    });
  });
});
