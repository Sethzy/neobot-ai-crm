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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
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

    mockGetUserMedia.mockResolvedValue({
      getTracks: () => [{ stop: mockStopTrack }],
    } satisfies Partial<MediaStream>);
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
});
