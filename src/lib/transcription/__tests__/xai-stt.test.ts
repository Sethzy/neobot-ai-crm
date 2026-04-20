/**
 * Tests for xAI Grok speech-to-text integration.
 * @module lib/transcription/__tests__/xai-stt
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { transcribeAudio } from "../xai-stt";

const mockFetch = vi.fn();

vi.stubGlobal("fetch", mockFetch);

/** Two-speaker word stream matching the xAI STT JSON response schema. */
const TWO_SPEAKER_WORDS = {
  text: "Met with Sarah. About the deal.",
  language: "English",
  duration: 3.0,
  words: [
    { text: "Met", start: 0.5, end: 0.8, speaker: 1 },
    { text: "with", start: 0.8, end: 1.0, speaker: 1 },
    { text: "Sarah.", start: 1.0, end: 1.5, speaker: 1 },
    { text: "About", start: 2.0, end: 2.3, speaker: 2 },
    { text: "the", start: 2.3, end: 2.5, speaker: 2 },
    { text: "deal.", start: 2.5, end: 3.0, speaker: 2 },
  ],
};

function mockXaiSuccess(payload: unknown = TWO_SPEAKER_WORDS) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(payload),
  });
}

describe("transcribeAudio (xAI Grok STT)", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv("XAI_API_KEY", "test-xai-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("returns transcript text and segments grouped by speaker", async () => {
    mockXaiSuccess();

    const result = await transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm", language: "en" });

    expect(result.text).toBe("Met with Sarah. About the deal.");
    expect(result.segments).toEqual([
      { start: 0.5, end: 1.5, text: "Met with Sarah.", speaker: 1 },
      { start: 2.0, end: 3.0, text: "About the deal.", speaker: 2 },
    ]);
  });

  it("POSTs to the Grok STT endpoint with bearer auth and multipart form", async () => {
    mockXaiSuccess();

    await transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm", language: "en" });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.x.ai/v1/stt");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer test-xai-key");

    const form = options.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("url")).toBe("https://storage.example.com/audio.webm");
    expect(form.get("diarize")).toBe("true");
    expect(form.get("language")).toBe("en");
    expect(form.get("format")).toBe("true");
  });

  it("passes the requested language through to xAI", async () => {
    mockXaiSuccess();

    await transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm", language: "ms" });

    const [, options] = mockFetch.mock.calls[0];
    const form = options.body as FormData;
    expect(form.get("language")).toBe("ms");
  });

  it("collapses a single-speaker word stream into one segment", async () => {
    mockXaiSuccess({
      text: "Hello world",
      words: [
        { text: "Hello", start: 0.0, end: 0.5, speaker: 1 },
        { text: "world", start: 0.5, end: 1.0, speaker: 1 },
      ],
    });

    const result = await transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm", language: "en" });

    expect(result.segments).toEqual([
      { start: 0.0, end: 1.0, text: "Hello world", speaker: 1 },
    ]);
  });

  it("defaults missing speaker IDs to 0 and still collapses contiguous runs", async () => {
    mockXaiSuccess({
      text: "No diarization here",
      words: [
        { text: "No", start: 0.0, end: 0.2 },
        { text: "diarization", start: 0.2, end: 0.7 },
        { text: "here", start: 0.7, end: 1.0 },
      ],
    });

    const result = await transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm", language: "en" });

    expect(result.segments).toEqual([
      { start: 0.0, end: 1.0, text: "No diarization here", speaker: 0 },
    ]);
  });

  it("returns empty segments when the provider omits a words array", async () => {
    mockXaiSuccess({ text: "short", words: undefined });

    const result = await transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm", language: "en" });

    expect(result).toEqual({ text: "short", segments: [] });
  });

  it("throws when XAI_API_KEY is not configured", async () => {
    vi.stubEnv("XAI_API_KEY", "");

    await expect(
      transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm", language: "en" }),
    ).rejects.toThrow("XAI_API_KEY is not configured");
  });

  it("throws with status and body on a non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    await expect(
      transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm", language: "en" }),
    ).rejects.toThrow("xAI STT request failed (401): Unauthorized");
  });
});
