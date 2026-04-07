/**
 * Recording state machine for the meetings surface.
 * Manages MediaRecorder lifecycle, upload, and ingest call.
 * @module hooks/meetings/use-meeting-recording
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type RecordingStatus =
  | "idle"
  | "recording"
  | "paused"
  | "stopping"
  | "uploading"
  | "transcribing"
  | "done"
  | "error";

interface UseMeetingRecordingReturn {
  status: RecordingStatus;
  elapsedSeconds: number;
  notes: string;
  setNotes: (notes: string) => void;
  errorMessage: string | null;
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => Promise<void>;
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

export function useMeetingRecording(): UseMeetingRecordingReturn {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pausedElapsedSecondsRef = useRef(0);

  const router = useRouter();

  const stopTimer = useCallback(() => {
    if (!timerRef.current) {
      return;
    }

    clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      const startedAt = startTimeRef.current;

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

  useEffect(() => {
    return () => {
      stopTimer();
      startTimeRef.current = null;
      pausedElapsedSecondsRef.current = 0;

      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;

        if (recorder.state !== "inactive") {
          try {
            recorder.stop();
          } catch {
            // Ignore teardown races during unmount.
          }
        }
      }

      cleanupStream();
    };
  }, [cleanupStream, stopTimer]);

  const start = useCallback(async () => {
    try {
      setErrorMessage(null);
      setElapsedSeconds(0);
      pausedElapsedSecondsRef.current = 0;
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = getPreferredMimeType();

      if (!mimeType) {
        throw new Error("No supported audio format found in this browser");
      }

      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setStatus("recording");
      startTimer();
    } catch (error) {
      cleanupStream();
      stopTimer();
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Failed to start recording");
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
    startTimeRef.current = null;
    setStatus("paused");
  }, [elapsedSeconds, stopTimer]);

  const resume = useCallback(() => {
    const recorder = mediaRecorderRef.current;

    if (!recorder || recorder.state !== "paused") {
      return;
    }

    recorder.resume();
    setStatus("recording");
    startTimer();
  }, [startTimer]);

  const stop = useCallback(async () => {
    const recorder = mediaRecorderRef.current;

    if (!recorder || (status !== "recording" && status !== "paused")) {
      return;
    }

    setStatus("stopping");

    const audioBlob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        stopTimer();
        const completedBlob = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        pausedElapsedSecondsRef.current = 0;
        startTimeRef.current = null;
        cleanupStream();
        resolve(completedBlob);
      };

      recorder.stop();
    });

    const idempotencyKey = crypto.randomUUID();
    const effectiveElapsedSeconds = Math.max(1, elapsedSeconds);
    const contentType = audioBlob.type || "audio/webm";

    try {
      setStatus("uploading");

      const uploadResponse = await fetch("/api/meetings/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: "recording.webm",
          contentType,
          durationSeconds: effectiveElapsedSeconds,
        }),
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const uploadPayload = await uploadResponse.json() as {
        uploadUrl: string;
        storagePath: string;
        token?: string;
      };

      const uploadHeaders: HeadersInit = {
        "Content-Type": contentType,
      };

      if (uploadPayload.token) {
        uploadHeaders.Authorization = `Bearer ${uploadPayload.token}`;
      }

      const directUploadResponse = await fetch(uploadPayload.uploadUrl, {
        method: "PUT",
        headers: uploadHeaders,
        body: audioBlob,
      });

      if (!directUploadResponse.ok) {
        throw new Error("Failed to upload recording");
      }

      setStatus("transcribing");

      const ingestResponse = await fetch("/api/meetings/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          storagePath: uploadPayload.storagePath,
          durationSeconds: effectiveElapsedSeconds,
          notes,
          idempotencyKey,
        }),
      });

      if (!ingestResponse.ok) {
        throw new Error("Ingest failed");
      }

      const ingestPayload = await ingestResponse.json() as {
        meetingRecordId: string;
      };

      setStatus("done");
      setNotes("");
      router.push(`/meetings/${ingestPayload.meetingRecordId}`);
    } catch (error) {
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Recording failed");
    }
  }, [cleanupStream, elapsedSeconds, notes, router, status, stopTimer]);

  return {
    status,
    elapsedSeconds,
    notes,
    setNotes,
    errorMessage,
    start,
    pause,
    resume,
    stop,
  };
}
