/**
 * Tests for Groq Whisper transcription integration.
 * @module lib/transcription/__tests__/groq-whisper
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("transcribeAudio", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("throws when GROQ_API_KEY is not configured", async () => {
    vi.stubEnv("GROQ_API_KEY", "");

    const { transcribeAudio } = await import("../groq-whisper");

    await expect(
      transcribeAudio({ audioUrl: "https://example.com/audio.webm" }),
    ).rejects.toThrow("GROQ_API_KEY");
  });

  it("downloads the audio file and returns transcript text from Groq", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(new Blob(["audio"], { type: "audio/webm" }), {
          status: 200,
          headers: { "Content-Type": "audio/webm" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: "Hello, this is a test meeting." }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", mockFetch);

    const { transcribeAudio } = await import("../groq-whisper");
    const result = await transcribeAudio({
      audioUrl: "https://example.com/audio.webm",
      language: "en",
    });

    expect(result).toEqual({ text: "Hello, this is a test meeting." });
    expect(mockFetch).toHaveBeenNthCalledWith(1, "https://example.com/audio.webm");
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      "https://api.groq.com/openai/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer test-key",
        },
        body: expect.any(FormData),
      }),
    );

    const groqRequest = mockFetch.mock.calls[1]?.[1] as { body: FormData };
    expect(groqRequest.body.get("model")).toBe("whisper-large-v3-turbo");
    expect(groqRequest.body.get("response_format")).toBe("json");
    expect(groqRequest.body.get("language")).toBe("en");
    expect(groqRequest.body.get("file")).toBeInstanceOf(File);
  });

  it("throws when Groq responds with a non-ok status", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");

    const mockFetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(new Blob(["audio"], { type: "audio/webm" }), {
          status: 200,
          headers: { "Content-Type": "audio/webm" },
        }),
      )
      .mockResolvedValueOnce(new Response("Rate limited", { status: 429 }));
    vi.stubGlobal("fetch", mockFetch);

    const { transcribeAudio } = await import("../groq-whisper");

    await expect(
      transcribeAudio({ audioUrl: "https://example.com/audio.webm" }),
    ).rejects.toThrow("Groq transcription failed");
  });
});
