/**
 * Recording state machine for the meetings surface.
 * Manages MediaRecorder lifecycle, upload, and ingest call.
 * @module hooks/meetings/use-meeting-recording
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient as createSupabaseClient } from "@/lib/supabase/client";
import {
  encodeWavFromAudioBlob,
  estimatePcmWavSizeBytes,
} from "@/lib/audio/encode-wav";
import { AGENT_FILES_BUCKET } from "@/lib/storage/agent-files";
import {
  DEFAULT_STT_LANGUAGE,
  isSupportedSttLanguage,
} from "@/lib/transcription/languages";

const LANGUAGE_STORAGE_KEY = "sunder.meetings.language";
const MAX_BROWSER_WAV_TRANSCODE_SECONDS = 25 * 60;

function readStoredLanguage(): string {
  if (typeof window === "undefined") return DEFAULT_STT_LANGUAGE;
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && isSupportedSttLanguage(stored)) return stored;
  } catch {
    // localStorage may be unavailable in private browsing / SSR edge cases
  }
  return DEFAULT_STT_LANGUAGE;
}

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
  /** True when the last error was a microphone permission denial. */
  isPermissionError: boolean;
  /** Current STT language (BCP-47 code). Persisted to localStorage on change. */
  language: string;
  setLanguage: (code: string) => void;
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

/**
 * Reads the browser's current microphone permission state for diagnostics only.
 * We do not use this for product behavior because Chrome can report stale state.
 */
async function getMicrophonePermissionState(): Promise<PermissionState | "unsupported"> {
  if (!("permissions" in navigator) || typeof navigator.permissions.query !== "function") {
    return "unsupported";
  }

  try {
    const permissionStatus = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });

    return permissionStatus.state;
  } catch {
    return "unsupported";
  }
}

/**
 * Enumerates the currently visible media devices to help distinguish browser-
 * level denials from missing-device or OS-level permission problems.
 */
async function getMediaDeviceDiagnostics(): Promise<
  Array<Pick<MediaDeviceInfo, "kind" | "deviceId" | "groupId" | "label">> | null
> {
  if (!("mediaDevices" in navigator) || typeof navigator.mediaDevices.enumerateDevices !== "function") {
    return null;
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();

    return devices.map(({ kind, deviceId, groupId, label }) => ({
      kind,
      deviceId,
      groupId,
      label,
    }));
  } catch {
    return null;
  }
}

async function logGetUserMediaFailure(error: unknown): Promise<void> {
  const [permissionState, devices] = await Promise.all([
    getMicrophonePermissionState(),
    getMediaDeviceDiagnostics(),
  ]);
  const constraint = typeof error === "object"
    && error !== null
    && "constraint" in error
    && typeof error.constraint === "string"
    ? error.constraint
    : undefined;

  console.error("[meeting-recording] getUserMedia failed", {
    name: error instanceof DOMException || error instanceof Error ? error.name : undefined,
    message: error instanceof Error ? error.message : String(error),
    constraint,
    permissionsState: permissionState,
    enumerateDevices: devices,
    isSecureContext: window.isSecureContext,
    userAgent: navigator.userAgent,
  });
}

function logRecordingUploadFailure(details: {
  error: unknown;
  signedPath?: string;
  storagePath?: string;
  tokenPresent?: boolean;
  blobSize?: number;
  blobType?: string;
  estimatedWavByteLength?: number;
  uploadFileName?: string;
  uploadFileType?: string;
}) {
  console.error("[meeting-recording] upload failed", {
    name: details.error instanceof Error ? details.error.name : undefined,
    message: details.error instanceof Error ? details.error.message : String(details.error),
    signedPath: details.signedPath,
    storagePath: details.storagePath,
    tokenPresent: details.tokenPresent,
    blobSize: details.blobSize,
    blobType: details.blobType,
    estimatedWavByteLength: details.estimatedWavByteLength,
    uploadFileName: details.uploadFileName,
    uploadFileType: details.uploadFileType,
    rawError: details.error,
  });
}

/**
 * Full-file browser transcoding is memory hungry because decode, mixdown,
 * resample, and WAV packing each allocate their own buffers. Cap the duration
 * so long recordings fail fast with a clear message instead of crashing tabs.
 */
function assertBrowserTranscodeLimit(durationSeconds: number): void {
  if (durationSeconds <= MAX_BROWSER_WAV_TRANSCODE_SECONDS) {
    return;
  }

  const maxMinutes = Math.floor(MAX_BROWSER_WAV_TRANSCODE_SECONDS / 60);
  throw new Error(
    `Recordings longer than ${maxMinutes} minutes are not supported in this browser yet.`,
  );
}

export function useMeetingRecording(): UseMeetingRecordingReturn {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [notes, setNotes] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPermissionError, setIsPermissionError] = useState(false);
  const [language, setLanguageState] = useState<string>(readStoredLanguage);

  const setLanguage = useCallback((code: string) => {
    if (!isSupportedSttLanguage(code)) return;
    setLanguageState(code);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, code);
    } catch {
      // ignore storage failures; in-memory state still wins
    }
  }, []);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const pausedElapsedSecondsRef = useRef(0);

  const router = useRouter();
  const browserSupabase = createSupabaseClient();

  /** Guard against concurrent start() calls (React StrictMode double-invocation). */
  const isStartingRef = useRef(false);

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
    if (isStartingRef.current) return;
    isStartingRef.current = true;

    try {
      setErrorMessage(null);
      setIsPermissionError(false);
      setElapsedSeconds(0);
      pausedElapsedSecondsRef.current = 0;
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(
        async (error: unknown) => {
          await logGetUserMediaFailure(error);
          throw error;
        },
      );
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
      isStartingRef.current = false;
      cleanupStream();
      stopTimer();
      setStatus("error");
      const isDenied = error instanceof DOMException && error.name === "NotAllowedError";
      setIsPermissionError(isDenied);
      setErrorMessage(
        isDenied
          ? "Microphone access is blocked"
          : error instanceof Error ? error.message : "Failed to start recording",
      );
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
        isStartingRef.current = false;
        cleanupStream();
        resolve(completedBlob);
      };

      recorder.stop();
    });

    const idempotencyKey = crypto.randomUUID();
    const effectiveElapsedSeconds = Math.max(1, elapsedSeconds);

    try {
      assertBrowserTranscodeLimit(effectiveElapsedSeconds);

      const estimatedWavByteLength = estimatePcmWavSizeBytes(effectiveElapsedSeconds);
      const wavBlob = audioBlob.type === "audio/wav"
        ? audioBlob
        : await encodeWavFromAudioBlob(audioBlob);
      const uploadFile = new File([wavBlob], "recording.wav", {
        type: "audio/wav",
      });

      setStatus("uploading");

      const uploadResponse = await fetch("/api/meetings/upload-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filename: "recording.wav",
          contentType: "audio/wav",
          durationSeconds: effectiveElapsedSeconds,
        }),
      });

      if (!uploadResponse.ok) {
        throw new Error("Failed to get upload URL");
      }

      const uploadPayload = await uploadResponse.json() as {
        signedUrl: string;
        path: string;
        storagePath: string;
        token: string;
      };

      const uploadResult = await browserSupabase.storage
        .from(AGENT_FILES_BUCKET)
        .uploadToSignedUrl(uploadPayload.path, uploadPayload.token, uploadFile, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadResult.error) {
        logRecordingUploadFailure({
          error: uploadResult.error,
          signedPath: uploadPayload.path,
          storagePath: uploadPayload.storagePath,
          tokenPresent: Boolean(uploadPayload.token),
          blobSize: audioBlob.size,
          blobType: audioBlob.type,
          estimatedWavByteLength,
          uploadFileName: uploadFile.name,
          uploadFileType: uploadFile.type,
        });
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
          language,
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
      logRecordingUploadFailure({
        error,
        blobSize: audioBlob.size,
        blobType: audioBlob.type,
        estimatedWavByteLength: estimatePcmWavSizeBytes(effectiveElapsedSeconds),
      });
      setStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Recording failed");
    }
  }, [browserSupabase, cleanupStream, elapsedSeconds, notes, router, status, stopTimer]);

  return {
    status,
    elapsedSeconds,
    notes,
    setNotes,
    errorMessage,
    isPermissionError,
    language,
    setLanguage,
    start,
    pause,
    resume,
    stop,
  };
}
