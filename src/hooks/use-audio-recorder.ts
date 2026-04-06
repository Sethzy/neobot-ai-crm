/**
 * Browser-native audio recording lifecycle for meeting capture.
 * @module hooks/use-audio-recorder
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "recording" | "paused" | "uploading";

export interface UseAudioRecorderReturn {
  state: RecorderState;
  elapsedSeconds: number;
  error: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<Blob | null>;
}

function getPreferredMimeType(): string {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return "";
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [state, setState] = useState<RecorderState>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const pausedElapsedSecondsRef = useRef(0);

  const stopTimer = useCallback(() => {
    if (!timerRef.current) {
      return;
    }

    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    startedAtRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const startedAt = startedAtRef.current;

      if (startedAt === null) {
        return;
      }

      const totalSeconds = pausedElapsedSecondsRef.current
        + Math.floor((Date.now() - startedAt) / 1000);
      setElapsedSeconds(totalSeconds);
    }, 250);
  }, []);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);
      setElapsedSeconds(0);
      pausedElapsedSecondsRef.current = 0;
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getPreferredMimeType();

      if (!mimeType) {
        throw new Error("No supported audio format found in this browser");
      }

      streamRef.current = stream;

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(1000);
      setState("recording");
      startTimer();
    } catch (startError) {
      cleanupStream();
      stopTimer();
      setState("idle");
      setError(startError instanceof Error ? startError.message : "Failed to start recording");
    }
  }, [cleanupStream, startTimer, stopTimer]);

  const pause = useCallback(() => {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state !== "recording") {
      return;
    }

    recorder.pause();
    stopTimer();
    pausedElapsedSecondsRef.current = elapsedSeconds;
    startedAtRef.current = null;
    setState("paused");
  }, [elapsedSeconds, stopTimer]);

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state !== "paused") {
      return;
    }

    recorder.resume();
    setState("recording");
    startTimer();
  }, [startTimer]);

  const stop = useCallback(async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;

      if (!recorder || recorder.state === "inactive") {
        cleanupStream();
        stopTimer();
        setState("idle");
        resolve(null);
        return;
      }

      recorder.onstop = () => {
        stopTimer();
        const audioBlob = new Blob(chunksRef.current, {
          type: recorder.mimeType,
        });

        chunksRef.current = [];
        pausedElapsedSecondsRef.current = 0;
        startedAtRef.current = null;
        cleanupStream();
        setState("idle");
        resolve(audioBlob);
      };

      recorder.stop();
    });
  }, [cleanupStream, stopTimer]);

  useEffect(() => () => {
    stopTimer();
    cleanupStream();
  }, [cleanupStream, stopTimer]);

  return {
    state,
    elapsedSeconds,
    error,
    start,
    pause,
    resume,
    stop,
  };
}
