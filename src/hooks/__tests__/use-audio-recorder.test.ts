/**
 * Tests for the browser audio recorder hook.
 * @module hooks/__tests__/use-audio-recorder
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUserMedia = vi.fn();
const mockStopTrack = vi.fn();

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
    this.ondataavailable?.({
      data: new Blob(["audio-chunk"], { type: this.mimeType }),
    });
  }

  pause() {
    this.state = "paused";
  }

  resume() {
    this.state = "recording";
  }

  stop() {
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

import { useAudioRecorder } from "../use-audio-recorder";

describe("useAudioRecorder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: mockStopTrack }],
    } satisfies Partial<MediaStream>);
  });

  it("records, pauses, resumes, and stops with an audio blob", async () => {
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });

    expect(mockGetUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(result.current.state).toBe("recording");

    await act(async () => {
      vi.advanceTimersByTime(2100);
    });

    expect(result.current.elapsedSeconds).toBeGreaterThanOrEqual(2);

    act(() => {
      result.current.pause();
    });

    expect(result.current.state).toBe("paused");

    act(() => {
      result.current.resume();
    });

    expect(result.current.state).toBe("recording");

    let blob: Blob | null = null;

    await act(async () => {
      blob = await result.current.stop();
    });

    expect(blob).toBeInstanceOf(Blob);
    expect(blob?.type).toBe("audio/webm;codecs=opus");
    expect(result.current.state).toBe("idle");
    expect(mockStopTrack).toHaveBeenCalledOnce();
  });

  it("surfaces permission errors and resets to idle", async () => {
    mockGetUserMedia.mockRejectedValue(new Error("Permission denied"));
    const { result } = renderHook(() => useAudioRecorder());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("idle");
    expect(result.current.error).toBe("Permission denied");
  });
});
