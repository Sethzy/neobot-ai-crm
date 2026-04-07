/**
 * Rev AI speech-to-text integration with speaker diarization.
 * @module lib/transcription/rev-ai
 */

const REV_AI_BASE_URL = "https://api.rev.ai/speechtotext/v1";
const POLL_INTERVAL_MS = 2000;

export interface TranscribeAudioInput {
  /** Signed URL used to download the private audio object from Supabase Storage. */
  audioUrl: string;
}

export interface TranscribeAudioResult {
  /** Plain-text transcription with all monologues joined. */
  text: string;
  /** Segment-level data with timestamps and speaker labels. */
  segments: Array<{
    start: number;
    end: number;
    text: string;
    speaker: number;
  }>;
}

interface RevAiElement {
  type: "text" | "punct";
  value: string;
  ts?: number;
  end_ts?: number;
  confidence?: number;
}

interface RevAiMonologue {
  speaker: number;
  elements: RevAiElement[];
}

interface RevAiTranscript {
  monologues: RevAiMonologue[];
}

/** Collapses a monologue's word-level elements into a single segment. */
function collapseMonologue(monologue: RevAiMonologue) {
  const textParts: string[] = [];
  let start = -1;
  let end = -1;

  for (const el of monologue.elements) {
    if (el.type === "text") {
      if (start === -1 && el.ts !== undefined) {
        start = el.ts;
      }
      if (el.end_ts !== undefined) {
        end = el.end_ts;
      }
      textParts.push(el.value);
    } else if (el.type === "punct") {
      // Attach punctuation to the previous word (no leading space)
      const last = textParts.length - 1;
      if (last >= 0) {
        textParts[last] = textParts[last] + el.value;
      }
    }
  }

  return {
    start,
    end,
    text: textParts.join(" "),
    speaker: monologue.speaker,
  };
}

/** Normalizes Rev AI monologues into our standard result shape. */
function normalizeTranscript(transcript: RevAiTranscript): TranscribeAudioResult {
  const segments = transcript.monologues.map(collapseMonologue);
  const text = segments.map((s) => s.text).join(" ");
  return { text, segments };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Submits audio to Rev AI for transcription, polls until complete,
 * and returns the transcript with speaker diarization.
 */
export async function transcribeAudio({
  audioUrl,
}: TranscribeAudioInput): Promise<TranscribeAudioResult> {
  const apiKey = process.env.REV_AI_ACCESS_TOKEN?.trim();

  if (!apiKey) {
    throw new Error("REV_AI_ACCESS_TOKEN is not configured");
  }

  // 1. Submit job
  const submitResponse = await fetch(`${REV_AI_BASE_URL}/jobs`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      source_config: { url: audioUrl },
    }),
  });

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    throw new Error(`Rev AI job submission failed (${submitResponse.status}): ${errorText}`);
  }

  const job = await submitResponse.json() as { id: string; status: string };
  console.log(`[rev-ai] job submitted | id=${job.id} status=${job.status}`);

  // 2. Poll until transcribed
  let status = job.status;
  let pollCount = 0;

  while (status === "in_progress") {
    await delay(POLL_INTERVAL_MS);
    pollCount++;

    const pollResponse = await fetch(`${REV_AI_BASE_URL}/jobs/${job.id}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });

    const pollResult = await pollResponse.json() as {
      status: string;
      failure_detail?: string;
    };

    status = pollResult.status;
    console.log(`[rev-ai] poll #${pollCount} | status=${status}`);

    if (status === "failed") {
      throw new Error(`Rev AI transcription failed: ${pollResult.failure_detail ?? "unknown error"}`);
    }
  }

  // 3. Fetch transcript
  console.log(`[rev-ai] fetching transcript | polls=${pollCount}`);
  const transcriptResponse = await fetch(`${REV_AI_BASE_URL}/jobs/${job.id}/transcript`, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/vnd.rev.transcript.v1.0+json",
    },
  });

  const transcript = await transcriptResponse.json() as RevAiTranscript;

  return normalizeTranscript(transcript);
}
