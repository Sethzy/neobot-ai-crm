/**
 * Tests for the meetings recording hook.
 * @module hooks/meetings/__tests__/use-meeting-recording
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockGetUserMedia = vi.fn();
const mockStopTrack = vi.fn();
const mockRecorderStop = vi.fn();
const mockFetch = vi.fn();
const mockUploadToSignedUrl = vi.fn();
const mockStorageFrom = vi.fn();
const mockEncodeWavFromAudioBlob = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    storage: {
      from: mockStorageFrom,
    },
  }),
}));

vi.mock("@/lib/audio/encode-wav", () => ({
  encodeWavFromAudioBlob: (...args: unknown[]) => mockEncodeWavFromAudioBlob(...args),
  estimatePcmWavSizeBytes: (durationSeconds: number) => durationSeconds * 32_000 + 44,
}));

class MockMediaRecorder {
  static isTypeSupported(type: string) {
    return type === "audio/webm;codecs=opus" || type === "audio/webm";
  }

  mimeType: string;
  state: "inactive" | "recording" | "paused" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(
    public stream: MediaStream,
    options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  pause() {
    this.state = "paused";
  }

  resume() {
    this.state = "recording";
  }

  stop() {
    mockRecorderStop();
    this.state = "inactive";
    this.onstop?.();
  }
}

vi.stubGlobal("MediaRecorder", MockMediaRecorder as unknown as typeof MediaRecorder);

Object.defineProperty(global.navigator, "mediaDevices", {
  configurable: true,
  value: {
    getUserMedia: mockGetUserMedia,
  },
});

import { useMeetingRecording } from "../use-meeting-recording";

describe("useMeetingRecording", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal("fetch", mockFetch);

    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: mockStopTrack }],
    } satisfies Partial<MediaStream>);
    mockEncodeWavFromAudioBlob.mockResolvedValue(
      new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])], { type: "audio/wav" }),
    );
    mockStorageFrom.mockReturnValue({
      uploadToSignedUrl: mockUploadToSignedUrl,
    });
    mockUploadToSignedUrl.mockResolvedValue({
      data: { path: "client-1/meetings/raw/meeting.webm" },
      error: null,
    });
  });

  it("stops the active media stream when the hook unmounts mid-recording", async () => {
    const { result, unmount } = renderHook(() => useMeetingRecording());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.status).toBe("recording");

    unmount();

    expect(mockRecorderStop).toHaveBeenCalledOnce();
    expect(mockStopTrack).toHaveBeenCalledOnce();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("prevents concurrent start calls (StrictMode double-invocation guard)", async () => {
    const { result } = renderHook(() => useMeetingRecording());

    // Simulate two concurrent start() calls — mirrors StrictMode double-mount
    await act(async () => {
      void result.current.start();
      void result.current.start();
    });

    // getUserMedia should only have been called once
    expect(mockGetUserMedia).toHaveBeenCalledOnce();
  });

  it("uploads recordings through Supabase signed upload tokens instead of raw storage fetches", async () => {
    mockFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            signedUrl: "https://storage.example.com/upload/sign/path",
            token: "upload-token",
            path: "client-1/meetings/raw/meeting.webm",
            storagePath: "meetings/raw/meeting.webm",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            meetingRecordId: "meeting-1",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );

    const { result } = renderHook(() => useMeetingRecording());

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(mockStorageFrom).toHaveBeenCalledWith("agent-files");
    expect(mockUploadToSignedUrl).toHaveBeenCalledWith(
      "client-1/meetings/raw/meeting.webm",
      "upload-token",
      expect.any(File),
      {
        cacheControl: "3600",
        upsert: false,
      },
    );
    const uploadedFile = mockUploadToSignedUrl.mock.calls[0]?.[2];
    expect(uploadedFile).toBeInstanceOf(File);
    expect(uploadedFile.name).toBe("recording.wav");
    expect(uploadedFile.type).toBe("audio/wav");
    expect(mockFetch).toHaveBeenNthCalledWith(1, "/api/meetings/upload-url", expect.any(Object));
    expect(mockFetch).toHaveBeenNthCalledWith(2, "/api/meetings/ingest", expect.any(Object));
    expect(mockPush).toHaveBeenCalledWith("/meetings/meeting-1");
  });

  it("surfaces transcoder failures as recording errors", async () => {
    mockEncodeWavFromAudioBlob.mockRejectedValueOnce(new Error("Transcode failed"));

    const { result } = renderHook(() => useMeetingRecording());

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("Transcode failed");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("fails fast before browser transcoding for recordings over the safety limit", async () => {
    const { result } = renderHook(() => useMeetingRecording());

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      vi.advanceTimersByTime(26 * 60 * 1000);
    });

    await act(async () => {
      await result.current.stop();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe(
      "Recordings longer than 25 minutes are not supported in this browser yet.",
    );
    expect(mockEncodeWavFromAudioBlob).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
