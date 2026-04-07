/**
 * Tests for Groq Whisper transcription integration.
 * @module lib/transcription/__tests__/groq-whisper
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { transcribeAudio } from "../groq-whisper";

const mockFetch = vi.fn();

vi.stubGlobal("fetch", mockFetch);

describe("transcribeAudio", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv("GROQ_API_KEY", "test-groq-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns text and segments from verbose_json response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/webm" })),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        text: "Met with Sarah about the deal.",
        segments: [
          { start: 0.5, end: 3.2, text: "Met with Sarah" },
          { start: 3.5, end: 6.1, text: "about the deal." },
        ],
      }),
    });

    const result = await transcribeAudio({
      audioUrl: "https://example.com/audio.webm",
    });

    expect(result.text).toBe("Met with Sarah about the deal.");
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toEqual({ start: 0.5, end: 3.2, text: "Met with Sarah" });
    expect(result.segments[1]).toEqual({ start: 3.5, end: 6.1, text: "about the deal." });
  });

  it("sends verbose_json response_format to Groq", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/webm" })),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: "hello", segments: [] }),
    });

    await transcribeAudio({ audioUrl: "https://example.com/audio.webm" });

    const groqRequest = mockFetch.mock.calls[1]?.[1] as { body: FormData };
    expect(groqRequest.body.get("response_format")).toBe("verbose_json");
    expect(groqRequest.body.getAll("timestamp_granularities[]")).toContain("segment");
  });

  it("returns empty segments when Groq omits them", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/webm" })),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: "hello" }),
    });

    const result = await transcribeAudio({
      audioUrl: "https://example.com/audio.webm",
    });

    expect(result.text).toBe("hello");
    expect(result.segments).toEqual([]);
  });

  it("throws when Groq responds with a non-ok status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(new Blob(["audio"], { type: "audio/webm" })),
    });
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () => Promise.resolve("Rate limited"),
    });

    await expect(
      transcribeAudio({ audioUrl: "https://example.com/audio.webm" }),
    ).rejects.toThrow("Groq transcription failed (429): Rate limited");
  });

  it("throws when GROQ_API_KEY is not configured", async () => {
    vi.stubEnv("GROQ_API_KEY", "");

    await expect(
      transcribeAudio({ audioUrl: "https://example.com/audio.webm" }),
    ).rejects.toThrow("GROQ_API_KEY is not configured");
  });
});
