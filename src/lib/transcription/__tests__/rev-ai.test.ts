/**
 * Tests for Rev AI speech-to-text integration.
 * @module lib/transcription/__tests__/rev-ai
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { transcribeAudio } from "../rev-ai";

const mockFetch = vi.fn();

vi.stubGlobal("fetch", mockFetch);

/** Two-speaker monologues response matching Rev AI's JSON transcript format. */
const TWO_SPEAKER_MONOLOGUES = {
  monologues: [
    {
      speaker: 1,
      elements: [
        { type: "text", value: "Met", ts: 0.5, end_ts: 0.8, confidence: 0.99 },
        { type: "text", value: "with", ts: 0.8, end_ts: 1.0, confidence: 0.98 },
        { type: "text", value: "Sarah", ts: 1.0, end_ts: 1.5, confidence: 0.97 },
        { type: "punct", value: "." },
      ],
    },
    {
      speaker: 2,
      elements: [
        { type: "text", value: "About", ts: 2.0, end_ts: 2.3, confidence: 0.99 },
        { type: "text", value: "the", ts: 2.3, end_ts: 2.5, confidence: 1.0 },
        { type: "text", value: "deal", ts: 2.5, end_ts: 3.0, confidence: 0.98 },
        { type: "punct", value: "." },
      ],
    },
  ],
};

/** Helper to mock the standard 3-fetch Rev AI flow: submit → poll → transcript. */
function mockRevAiSuccess(monologues = TWO_SPEAKER_MONOLOGUES) {
  // Submit job
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ id: "job-123", status: "in_progress" }),
  });
  // Poll → completed
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ id: "job-123", status: "transcribed" }),
  });
  // Fetch transcript
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(monologues),
  });
}

describe("transcribeAudio", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubEnv("REV_AI_ACCESS_TOKEN", "test-rev-ai-token");
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("submits a job, polls until transcribed, and returns normalized segments with speakers", async () => {
    mockRevAiSuccess();

    const promise = transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm" });
    // Advance past the poll interval
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(result.text).toBe("Met with Sarah. About the deal.");
    expect(result.segments).toEqual([
      { start: 0.5, end: 1.5, text: "Met with Sarah.", speaker: 1 },
      { start: 2.0, end: 3.0, text: "About the deal.", speaker: 2 },
    ]);
  });

  it("submits the audio URL in source_config and sends the bearer token", async () => {
    mockRevAiSuccess();

    const promise = transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm" });
    await vi.advanceTimersByTimeAsync(3000);
    await promise;

    const [submitUrl, submitOptions] = mockFetch.mock.calls[0];
    expect(submitUrl).toBe("https://api.rev.ai/speechtotext/v1/jobs");
    expect(submitOptions.method).toBe("POST");
    expect(submitOptions.headers["Authorization"]).toBe("Bearer test-rev-ai-token");
    expect(JSON.parse(submitOptions.body)).toEqual({
      source_config: { url: "https://storage.example.com/audio.webm" },
    });
  });

  it("fetches transcript with the correct Accept header", async () => {
    mockRevAiSuccess();

    const promise = transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm" });
    await vi.advanceTimersByTimeAsync(3000);
    await promise;

    const [transcriptUrl, transcriptOptions] = mockFetch.mock.calls[2];
    expect(transcriptUrl).toBe("https://api.rev.ai/speechtotext/v1/jobs/job-123/transcript");
    expect(transcriptOptions.headers["Accept"]).toBe("application/vnd.rev.transcript.v1.0+json");
  });

  it("polls multiple times until the job is transcribed", async () => {
    // Submit
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "job-123", status: "in_progress" }),
    });
    // Poll 1 → still in_progress
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "job-123", status: "in_progress" }),
    });
    // Poll 2 → transcribed
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "job-123", status: "transcribed" }),
    });
    // Fetch transcript
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(TWO_SPEAKER_MONOLOGUES),
    });

    const promise = transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm" });
    await vi.advanceTimersByTimeAsync(6000);
    const result = await promise;

    expect(result.segments).toHaveLength(2);
    // submit + 2 polls + transcript = 4 fetches
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("throws when REV_AI_ACCESS_TOKEN is not configured", async () => {
    vi.stubEnv("REV_AI_ACCESS_TOKEN", "");

    await expect(
      transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm" }),
    ).rejects.toThrow("REV_AI_ACCESS_TOKEN is not configured");
  });

  it("throws when the job submission fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: () => Promise.resolve("Unauthorized"),
    });

    await expect(
      transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm" }),
    ).rejects.toThrow("Rev AI job submission failed (401): Unauthorized");
  });

  it("throws when the job status is failed", async () => {
    // Submit
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "job-123", status: "in_progress" }),
    });
    // Poll → failed
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ id: "job-123", status: "failed", failure_detail: "Audio too short" }),
    });

    const promise = transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm" });
    const expectation = expect(promise).rejects.toThrow("Rev AI transcription failed: Audio too short");
    await vi.advanceTimersByTimeAsync(3000);
    await expectation;
  });

  it("handles a single-speaker monologue", async () => {
    const singleSpeaker = {
      monologues: [
        {
          speaker: 1,
          elements: [
            { type: "text", value: "Hello", ts: 0.0, end_ts: 0.5, confidence: 1.0 },
            { type: "text", value: "world", ts: 0.5, end_ts: 1.0, confidence: 1.0 },
          ],
        },
      ],
    };

    mockRevAiSuccess(singleSpeaker);

    const promise = transcribeAudio({ audioUrl: "https://storage.example.com/audio.webm" });
    await vi.advanceTimersByTimeAsync(3000);
    const result = await promise;

    expect(result.text).toBe("Hello world");
    expect(result.segments).toEqual([
      { start: 0.0, end: 1.0, text: "Hello world", speaker: 1 },
    ]);
  });
});
